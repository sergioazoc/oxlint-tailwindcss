/**
 * Persistent canonicalize service backed by `DesignSystemWorker`.
 *
 * Calls `ds.canonicalizeCandidates([cls], { rem })` one class at a time
 * (the design system deduplicates its input, so batching changes the
 * result shape — see sync-loader.ts). The shared protocol lives in
 * `./ds-worker.ts`.
 *
 * ## Per-class cache (process-wide)
 *
 * Results are cached by `${cssPath}\0${rem}\0${class}`. The worker is
 * invoked only for cache misses. In practice the cache converges quickly —
 * after the first few files any given class has been seen, and every
 * subsequent lookup is O(1).
 */

import { createHash } from 'node:crypto'
import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { threadId } from 'node:worker_threads'
import { DesignSystemWorker, makeWorkerScript } from './ds-worker'
import { cacheArtifactPaths } from './sync-loader'
import { SortServiceError } from '../utils/fatal'
import { roundRemValue } from '../utils/floating-point'

interface CanonicalizeRequest {
  classes: string[]
  rem?: number
}

/**
 * One canonicalization result.
 *
 * `safe` is the #78 guard: `true` only when the canonical form emits
 * byte-identical CSS to the original. A canonicalization like
 * `rounded-[4px]` → `rounded-lg` is UNSAFE because `rounded-lg` compiles to
 * `border-radius: var(--radius-lg)`, whose value depends on a `:root`
 * override that `canonicalizeCandidates` resolves against the compile-time
 * theme default — so accepting it would silently change the design. The rule
 * layer only rewrites when `safe` is true; unsafe results are left as written.
 * Value-preserving canonicalizations (legacy renames, var-syntax
 * normalization like `bg-[var(--x)]` → `bg-(--x)`, literal-valued utilities
 * like `z-[10]` → `z-10`) all stay `safe: true`.
 */
export interface CanonicalizeResult {
  canonical: string
  safe: boolean
}

// Handler: canonicalize each class. canonicalizeCandidates deduplicates its
// input, so we call it one class at a time to preserve order/length (see
// sync-loader.ts). The shared protocol/load/loop lives in makeWorkerScript.
//
// `safe` (#78) is computed here, inside the worker, where the design system
// lives: a rewrite is value-preserving iff the two classes emit byte-identical
// CSS *declarations* (the selector differs by construction, so it is stripped —
// everything between the first `{` and the last `}`). candidatesToCss is the
// source of truth; when the canonical form resolves through a `var()`/`calc()`
// whose value a `:root` override can change, the declarations differ and the
// rewrite is flagged unsafe.
const CANONICALIZE_HANDLER = `(ds, request) => {
  const { classes, rem } = request;
  const options = rem ? { rem } : undefined;
  const declsOf = (cls) => {
    let out;
    try { out = ds.candidatesToCss([cls]); } catch (e) { return null; }
    if (!out || !out[0]) return null;
    const css = out[0];
    const open = css.indexOf('{');
    const close = css.lastIndexOf('}');
    if (open < 0 || close < 0) return null;
    return css.slice(open + 1, close).replace(/\\s+/g, ' ').trim();
  };
  return classes.map((cls) => {
    const r = ds.canonicalizeCandidates([cls], options);
    const canonical = r[0] ?? cls;
    if (canonical === cls) return { canonical: cls, safe: true };
    const a = declsOf(cls);
    const b = declsOf(canonical);
    return { canonical, safe: a !== null && b !== null && a === b };
  });
}`

const WORKER_SCRIPT = makeWorkerScript(CANONICALIZE_HANDLER)

const canonWorker = new DesignSystemWorker<CanonicalizeRequest, CanonicalizeResult[]>({
  workerScript: WORKER_SCRIPT,
  serviceName: 'canonicalize',
})

/**
 * Process-wide cache of canonicalized classes.
 * Key: `${cssPath}\0${rem}\0${className}` — isolates monorepos (multiple
 * DSs) and different rem settings. Value: the canonical form + its #78 `safe`
 * flag.
 */
const canonCache = new Map<string, CanonicalizeResult>()

/**
 * ## Disk persistence (per design system + rem)
 *
 * Each `oxlint` invocation is a fresh process, so without persistence every
 * unique dynamic class (`p-[2px]`, `bg-(--c)`, …) pays a synchronous worker
 * round-trip again on every run — on arbitrary-value-heavy codebases this
 * dominates the whole lint (seconds per run, issue: enforce-canonical perf).
 *
 * The canonical results are pure functions of the design system + rem + the
 * canonicalization logic, so we persist them next to the DS precompute
 * artifact, deriving the filename from `cacheArtifactPaths(cssPath).json`
 * (content-hash keyed) plus `CANON_LOGIC_HASH` (below). When the DS changes,
 * the artifact hash changes; when the canonicalization logic changes, the
 * logic hash changes — either way the canonical cache invalidates with it, so
 * no manual version bump is needed and stale values can never reach an autofix.
 *
 * We persist the full `CanonicalizeResult` (`canonical` + the #78 `safe`
 * flag), not just the string: `safe` gates whether `enforce-canonical`
 * actually applies the rewrite, so dropping it on restore would re-introduce
 * the unsafe-autofix bug #78 fixed.
 *
 * Best-effort everywhere: a missing/corrupt/unwritable cache file must never
 * break linting — it only costs worker round-trips.
 */

// Auto-invalidating cache-key component: md5 of the worker canonicalization
// script + the rounding function source. Any change to how a class is
// canonicalized (handler logic) or rounded flips this, so an old on-disk cache
// simply isn't found — the same self-healing the DS precompute cache gets from
// md5(PRECOMPUTE_SCRIPT). Replaces a hand-maintained version constant.
const CANON_LOGIC_HASH = createHash('md5')
  .update(WORKER_SCRIPT + roundRemValue.toString())
  .digest('hex')
  .slice(0, 8)

// Per-(pid,thread) tmp/reclaim-file counter. oxlint runs many worker threads in
// one process, so temp names must include threadId + a sequence to avoid
// collisions and renameSync races (mirrors sync-loader.ts).
let tmpSeq = 0

// A flush older than this is treated as abandoned (a crashed isolate that never
// released its lock) and reclaimed, so a leaked lock can't disable persistence
// forever. Generous: a real flush holds the lock for microseconds.
const LOCK_STALE_MS = 10_000

interface PersistState {
  file: string
  /** entries added since last flush; -1 = persistence unavailable */
  dirty: number
}

/** One persistence state per `${cssPath}\0${rem}\0` cache prefix. */
const persistStates = new Map<string, PersistState>()

function tryUnlink(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // Already gone, or not ours to remove — nothing to do.
  }
}

/**
 * Reclaim a stale lock via exclusive rename rather than unlink (mirrors
 * sync-loader.ts): two isolates that both judge the lock stale would otherwise
 * both unlink it, and the second could delete a FRESH lock a third isolate just
 * created. `renameSync` has a single winner; the loser gets ENOENT and moves on.
 */
function reclaimStaleLock(lockPath: string): void {
  let ageMs: number
  try {
    ageMs = Date.now() - statSync(lockPath).mtimeMs
  } catch {
    return // vanished already
  }
  if (ageMs < LOCK_STALE_MS) return
  const reclaimPath = `${lockPath}.reclaim.${process.pid}.${threadId}.${tmpSeq++}`
  try {
    renameSync(lockPath, reclaimPath)
  } catch {
    return // someone else reclaimed/released it first
  }
  tryUnlink(reclaimPath)
}

type LockOutcome = 'acquired' | 'contended' | 'unavailable'

/**
 * Acquire the per-file flush lock by atomic exclusive create (`wx`). The lock
 * serializes the read-merge-write below so concurrent isolates don't clobber
 * each other's entries (last-writer-wins → the cache would otherwise only
 * converge over several runs). Distinguishes contention (another isolate is
 * mid-flush — skip and retry next threshold) from an unwritable dir (give up).
 */
function acquireFlushLock(lockPath: string): LockOutcome {
  const tryCreate = (): LockOutcome => {
    try {
      closeSync(openSync(lockPath, 'wx'))
      return 'acquired'
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === 'EEXIST' ? 'contended' : 'unavailable'
    }
  }
  const first = tryCreate()
  if (first !== 'contended') return first
  reclaimStaleLock(lockPath)
  return tryCreate()
}

/** Exported for tests: the exact on-disk cache path for a (cssPath, rem). */
export function persistFileFor(cssPath: string, rem?: number): string | null {
  try {
    const { json } = cacheArtifactPaths(cssPath)
    const remKey = rem === undefined ? 'default' : String(rem)
    return json.replace(/\.json$/, `.canon-${CANON_LOGIC_HASH}-${remKey}.json`)
  } catch {
    return null
  }
}

/** Load the persisted map (if any) into `canonCache`, and set up flushing. */
function ensurePersistLoaded(cssPath: string, rem: number | undefined, cachePrefix: string): void {
  if (persistStates.has(cachePrefix)) return

  const file = persistFileFor(cssPath, rem)
  if (file === null) {
    persistStates.set(cachePrefix, { file: '', dirty: -1 })
    return
  }
  const state: PersistState = { file, dirty: 0 }
  persistStates.set(cachePrefix, state)

  try {
    const data: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    if (typeof data === 'object' && data !== null) {
      for (const [cls, entry] of Object.entries(data)) {
        // Persisted shape: [canonical, safe]. Validate strictly — a
        // corrupt/old-shape entry is skipped, never trusted into an autofix.
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'boolean') {
          canonCache.set(cachePrefix + cls, { canonical: entry[0], safe: entry[1] })
        }
      }
    }
  } catch {
    // No cache yet, or unreadable/corrupt — start fresh.
  }
}

/**
 * Persist this prefix's entries under a per-file lock, merging with whatever is
 * already on disk first. oxlint worker threads are separate JS isolates, each
 * with its own in-memory `canonCache`, so the file is their shared channel: a
 * bare overwrite would clobber the entries other isolates persisted
 * (last-writer-wins), leaving the cache to converge only over several runs.
 * Read-merge-write under the lock makes it converge in one.
 */
function flushPersist(cachePrefix: string, state: PersistState): void {
  if (state.dirty <= 0) return

  const lockPath = `${state.file}.lock`
  const lock = acquireFlushLock(lockPath)
  // Another isolate holds the lock: skip now, keep `dirty` so the next batch
  // over-threshold retries. Unwritable dir: give up on persistence entirely.
  if (lock === 'contended') return
  if (lock === 'unavailable') {
    state.dirty = -1
    return
  }

  try {
    // Start from what is already on disk so we don't drop another isolate's
    // (or a prior run's) entries; then overlay ours. Values are deterministic
    // for a given DS + logic hash, so overlapping keys carry identical values.
    const merged: Record<string, [string, boolean]> = {}
    try {
      const existing: unknown = JSON.parse(readFileSync(state.file, 'utf-8'))
      if (typeof existing === 'object' && existing !== null) {
        for (const [cls, entry] of Object.entries(existing)) {
          if (
            Array.isArray(entry) &&
            typeof entry[0] === 'string' &&
            typeof entry[1] === 'boolean'
          ) {
            merged[cls] = [entry[0], entry[1]]
          }
        }
      }
    } catch {
      // No existing file, or corrupt — our entries alone become the new file.
    }
    for (const [key, value] of canonCache) {
      if (key.startsWith(cachePrefix)) {
        merged[key.slice(cachePrefix.length)] = [value.canonical, value.safe]
      }
    }

    // Unique tmp per pid+thread+seq, then atomic rename into place (the lock
    // serializes writers; the unique name guards against any residual overlap).
    const tmp = `${state.file}.${process.pid}.${threadId}.${tmpSeq++}.tmp`
    writeFileSync(tmp, JSON.stringify(merged))
    renameSync(tmp, state.file)
    state.dirty = 0
  } catch {
    // Write failed after acquiring the lock — disable persistence for this prefix.
    state.dirty = -1
  } finally {
    tryUnlink(lockPath)
  }
}

/**
 * Canonicalize classes via the worker thread.
 *
 * Throws `SortServiceError` on any worker failure (init timeout, request
 * timeout, worker crash). Callers should wrap via `safeGetDS` so the
 * failure surfaces as a single `designSystemUnavailable` diagnostic.
 *
 * Returns an array the same length and order as `classes`. Uses a
 * process-wide per-class cache: the worker is invoked only for classes
 * not already seen with this (cssPath, rem) combination.
 */
export function canonicalizeClassesSync(
  cssPath: string,
  classes: string[],
  rem?: number,
): CanonicalizeResult[] {
  const out: CanonicalizeResult[] = Array.from({ length: classes.length })
  const missingIdx: number[] = []
  const missing: string[] = []
  const cachePrefix = `${cssPath}\0${rem ?? ''}\0`

  ensurePersistLoaded(cssPath, rem, cachePrefix)

  for (let i = 0; i < classes.length; i++) {
    const key = cachePrefix + classes[i]
    const hit = canonCache.get(key)
    if (hit !== undefined) {
      out[i] = hit
    } else {
      missingIdx.push(i)
      missing.push(classes[i])
    }
  }

  if (missing.length === 0) return out

  // Deduplicate the worker request: if a location repeats a class, we
  // don't need to canonicalize it twice. The per-class cache serves
  // repeats in subsequent calls; within a single call the cache is cold.
  const uniqueMissing = [...new Set(missing)]
  const fresh = canonWorker.callSync(cssPath, { classes: uniqueMissing, rem })
  if (fresh.length !== uniqueMissing.length) {
    throw new SortServiceError(
      `Canonicalize worker returned ${fresh.length} results for ${uniqueMissing.length} inputs.`,
      'This is a bug; please open an issue.',
    )
  }

  const freshByClass = new Map<string, CanonicalizeResult>()
  for (let k = 0; k < uniqueMissing.length; k++) {
    freshByClass.set(uniqueMissing[k], fresh[k])
  }

  for (let j = 0; j < missing.length; j++) {
    const cls = missing[j]
    const raw = freshByClass.get(cls) ?? { canonical: cls, safe: true }
    // Round rem/em/px floats so the worker path matches the precomputed map
    // (cache.ts does the same): canonicalizing arbitrary values can yield
    // `2.4000000000000004rem`, which must never reach the user's source. The
    // `safe` flag is decided in the worker and carried through unchanged.
    const value: CanonicalizeResult = { canonical: roundRemValue(raw.canonical), safe: raw.safe }
    canonCache.set(cachePrefix + cls, value)
    out[missingIdx[j]] = value
  }

  // Write-through: flush after every batch that produced fresh entries. A
  // threshold-based debounce is deliberately NOT used — oxlint fans the work
  // across many worker threads (separate isolates), so per-thread miss counts
  // rarely reach any useful threshold on a warm run, and the residual would
  // never persist: the cache stalls partway and never converges. The lock
  // already throttles concurrent flushes, and whole-file rewrites are cheap at
  // realistic sizes (a few hundred entries), so write-through is both correct
  // (converges in one run) and inexpensive.
  const state = persistStates.get(cachePrefix)
  if (state && state.dirty >= 0) {
    state.dirty += uniqueMissing.length
    flushPersist(cachePrefix, state)
  }

  return out
}

/** Reset the canonicalize service (for tests). */
export function resetCanonicalizeService(): void {
  canonWorker.reset()
  canonCache.clear()
  persistStates.clear()
}
