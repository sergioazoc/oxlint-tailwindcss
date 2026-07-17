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

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
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
 * The canonical results are pure functions of the design system + rem, so we
 * persist them next to the DS precompute artifact, deriving the filename from
 * `cacheArtifactPaths(cssPath).json` (content-hash keyed). When the DS
 * changes, the hash changes, and the canonical cache invalidates with it.
 *
 * Best-effort everywhere: a missing/corrupt/unwritable cache file must never
 * break linting — it only costs worker round-trips.
 */
const CANON_CACHE_VERSION = 'v1'

interface PersistState {
  file: string
  /** entries added since last flush; -1 = persistence unavailable */
  dirty: number
}

/** One persistence state per `${cssPath}\0${rem}\0` cache prefix. */
const persistStates = new Map<string, PersistState>()

function persistFileFor(cssPath: string, rem?: number): string | null {
  try {
    const { json } = cacheArtifactPaths(cssPath)
    const remKey = rem === undefined ? 'default' : String(rem)
    return json.replace(/\.json$/, `.canon-${CANON_CACHE_VERSION}-${remKey}.json`)
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
      for (const [cls, canonical] of Object.entries(data)) {
        if (typeof canonical === 'string') canonCache.set(cachePrefix + cls, canonical)
      }
    }
  } catch {
    // No cache yet, or unreadable/corrupt — start fresh.
  }
}

/** Atomically write all cached entries for this prefix to disk. */
function flushPersist(cachePrefix: string, state: PersistState): void {
  if (state.dirty <= 0) return
  try {
    const out: Record<string, string> = {}
    for (const [key, value] of canonCache) {
      if (key.startsWith(cachePrefix)) out[key.slice(cachePrefix.length)] = value
    }
    const tmp = `${state.file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(out))
    renameSync(tmp, state.file)
    state.dirty = 0
  } catch {
    // Unwritable cache dir — disable persistence for this prefix.
    state.dirty = -1
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

  // Write-through: flush after every batch that produced fresh results.
  // Deliberately NOT an exit hook — these services must not register process
  // listeners (see tests/design-system/exit-listeners.test.ts). The write is
  // a few-KB atomic tmp+rename, negligible next to the worker round-trips it
  // eliminates on the next run.
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
