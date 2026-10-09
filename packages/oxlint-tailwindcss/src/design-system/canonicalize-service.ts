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
import { cacheArtifactPaths, touchCacheFile } from './sync-loader'
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
  /**
   * Why an unsafe rewrite is not equivalent (R5), when both forms compile:
   * - `'variant'` — same declarations, different selector, and stock Tailwind
   *   says the two ARE the same: the project defines the canonical variant
   *   differently (shadcn's `data-disabled:` is `:where([data-disabled="true"]), …`);
   * - `'selector'` — same declarations, different selector in stock Tailwind
   *   too (`has-[[data-slot=x]]:` vs `has-data-[slot=x]:`): a spelling
   *   difference, nothing the project defined;
   * - `'value'` — the declarations differ (a theme-backed token, #78);
   * - `'variable'` — the canonical form is the same CSS plus mirror `--tw-*`
   *   declarations that other utilities read (#217): `[font-weight:var(--x)]`
   *   → `font-(--x)` also sets `--tw-font-weight`, which a `text-*` size reads.
   * Absent when `safe`, or when either form doesn't compile.
   */
  reason?: NonEquivalentReason
  /** The `--tw-*` variables the canonical form adds. Only with `'variable'`. */
  variables?: string[]
}

export type NonEquivalentReason = 'variant' | 'selector' | 'value' | 'variable'

const isReason = (x: unknown): x is NonEquivalentReason =>
  x === 'variant' || x === 'selector' || x === 'value' || x === 'variable'

const isVariableList = (x: unknown): x is string[] =>
  Array.isArray(x) && x.length > 0 && x.every((v) => typeof v === 'string' && v.startsWith('--'))

/**
 * A persisted `[canonical, safe, reason?, variables?]` entry, or null when it
 * isn't one. The variables come with `'variable'` and only with it: a
 * `'variable'` entry without them would render a message naming nothing.
 */
function fromPersisted(entry: unknown): CanonicalizeResult | null {
  if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'boolean') {
    return null
  }
  if (entry.length === 2) return { canonical: entry[0], safe: entry[1] }
  if (!isReason(entry[2])) return null
  if (entry[2] !== 'variable') {
    return entry.length === 3 ? { canonical: entry[0], safe: entry[1], reason: entry[2] } : null
  }
  if (entry.length !== 4 || !isVariableList(entry[3])) return null
  return { canonical: entry[0], safe: entry[1], reason: entry[2], variables: entry[3] }
}

function toPersisted(r: CanonicalizeResult): unknown[] {
  if (r.reason === 'variable') return [r.canonical, r.safe, r.reason, r.variables]
  return r.reason ? [r.canonical, r.safe, r.reason] : [r.canonical, r.safe]
}

// Handler: canonicalize each class. canonicalizeCandidates deduplicates its
// input, so we call it one class at a time to preserve order/length (see
// sync-loader.ts). The shared protocol/load/loop lives in makeWorkerScript.
//
// `safe` (#78) is computed here, inside the worker, where the design system
// lives: a rewrite is value-preserving iff the two classes emit byte-identical
// CSS apart from the class's own name. candidatesToCss is the source of truth;
// when the canonical form resolves through a `var()`/`calc()` whose value a
// `:root` override can change, the declarations differ and the rewrite is
// flagged unsafe.
//
// The class's own name is neutralized wherever the selector puts it, and
// nothing else is. Slicing between the first `{` and the last `}` kept the name
// whenever a variant wrapped the rule in an at-rule (#156); neutralizing only a
// name that OPENS a statement, the fix for that, missed every selector that
// doesn't start with it: `in-*` (`:where(:focus) .in-focus\:x`), `*:` and `**:`
// (`:is(.\*\:x > *)`), `divide-*` (`:where(.divide-x-2 > :not(:last-child))`)
// and, after Tailwind 4.3.3 (tailwindlabs/tailwindcss#20513), every `group-*`
// and `peer-*` (`:is(:where(.group):hover .group-hover\:x)`). Each of those
// rewrites read as a selector change, and none was reported.
//
// The token is the one Tailwind prints: a `.` and the class serialized the way
// CSS.escape does it (Tailwind's escape() is that algorithm), matched whole —
// not as the start of a longer name, not after a `\`. Strings are stepped over,
// so declaration values are compared untouched, and every other class in the
// selector (`.group\/item`, `.peer`) stays as written: a canonicalization that
// changes the variant's selector (`[&>*]:` → `*:`) still differs, and stays
// unsafe.
export const CANONICALIZE_HANDLER = `async (ds, request, env) => {
  const { classes, rem } = request;
  const options = rem ? { rem } : undefined;
  const escapeClass = (s) => {
    if (s === '-') return '\\\\-';
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 0) out += '\\uFFFD';
      else if ((c >= 1 && c <= 31) || c === 127 || (c >= 48 && c <= 57 && (i === 0 || (i === 1 && s[0] === '-')))) {
        out += '\\\\' + c.toString(16) + ' ';
      } else if (c >= 128 || c === 45 || c === 95 || (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
        out += s[i];
      } else {
        out += '\\\\' + s[i];
      }
    }
    return out;
  };
  const NAME_CHAR = /[\\w\\\\-]|[^\\x00-\\x7f]/;
  const rawOf = (d, cls) => {
    let out;
    try { out = d.candidatesToCss([cls]); } catch (e) { return null; }
    return out && out[0] ? out[0] : null;
  };
  const own = (css, cls) => {
    const token = '.' + escapeClass(cls);
    let out = '';
    let i = 0;
    while (i < css.length) {
      const ch = css[i];
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < css.length && css[j] !== ch) j += css[j] === '\\\\' ? 2 : 1;
        out += css.slice(i, j + 1);
        i = j + 1;
      } else if (css.startsWith(token, i) && css[i - 1] !== '\\\\' && !NAME_CHAR.test(css[i + token.length] || ' ')) {
        out += '.__c';
        i += token.length;
      } else {
        out += ch;
        i++;
      }
    }
    return out.replace(/\\s+/g, ' ').trim();
  };
  // Declarations only, selectors and at-rule preludes dropped: equal for two
  // rules that set the same things on different selectors.
  const declarationsOf = (css) => css.replace(/[^{};]+\\{/g, '').replace(/\\}/g, '').replace(/\\s+/g, ' ').trim();
  // A mirror (#217) is a --tw-* declaration that repeats, verbatim, the value of
  // a sibling real property in the same block: "--tw-font-weight: var(--x)" next
  // to "font-weight: var(--x)". Tailwind drops exactly these (and their
  // @property rules) when it signs a class to canonicalize it, which is why it
  // proposes "[font-weight:var(--x)]" -> "font-(--x)". Other utilities read
  // those variables (a text-* size reads --tw-font-weight), so the two forms are
  // not the same CSS. candidatesToCss prints one declaration per line, so this
  // walks lines: a value holding a ";" (content: ';') stays whole.
  const stripMirrors = (css) => {
    const lines = css.split('\\n');
    const removed = new Set();
    const drop = new Set();
    const blocks = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.endsWith('{')) { blocks.push([]); continue; }
      if (t === '}') {
        const decls = blocks.pop() || [];
        for (const d of decls) {
          if (!d.prop.startsWith('--tw-')) continue;
          if (decls.some((o) => !o.prop.startsWith('--') && o.value === d.value)) {
            drop.add(d.line);
            removed.add(d.prop);
          }
        }
        continue;
      }
      const colon = t.indexOf(':');
      if (blocks.length > 0 && colon > 0 && t.endsWith(';')) {
        blocks[blocks.length - 1].push({ line: i, prop: t.slice(0, colon).trim(), value: t.slice(colon + 1, -1).trim() });
      }
    }
    if (removed.size === 0) return { css, removed };
    const kept = [];
    for (let i = 0; i < lines.length; i++) {
      if (drop.has(i)) continue;
      const t = lines[i].trim();
      if (t.startsWith('@property ') && t.endsWith('{') && removed.has(t.slice(10, -1).trim())) {
        while (i < lines.length && lines[i].trim() !== '}') i++;
        continue;
      }
      kept.push(lines[i]);
    }
    return { css: kept.join('\\n'), removed };
  };
  const results = [];
  for (const cls of classes) {
    // A malformed/mid-typing arbitrary value (e.g. \`px-[calc(var(--a)+)]\`) can
    // make the Tailwind parser throw on some engine versions (#130). Treat it
    // as an incanonicalizable no-op — same posture declsOf already takes for
    // candidatesToCss — instead of letting the throw become the worker's 'null'
    // sentinel, which the host used to turn into a process-sticky fatal error.
    let r;
    try {
      r = ds.canonicalizeCandidates([cls], options);
    } catch (e) {
      results.push({ canonical: cls, safe: true });
      continue;
    }
    const canonical = r[0] ?? cls;
    if (canonical === cls) { results.push({ canonical: cls, safe: true }); continue; }
    const rawA = rawOf(ds, cls);
    const rawB = rawOf(ds, canonical);
    const a = rawA === null ? null : own(rawA, cls);
    const b = rawB === null ? null : own(rawB, canonical);
    if (a !== null && b !== null && a === b) { results.push({ canonical, safe: true }); continue; }
    if (a === null || b === null) { results.push({ canonical, safe: false }); continue; }
    const ma = stripMirrors(rawA);
    const mb = stripMirrors(rawB);
    const sa = own(ma.css, cls);
    const sb = own(mb.css, canonical);
    if (sa === sb) {
      // The same CSS once the mirrors are gone. It is 'variable' only when the
      // canonical form ADDS mirrors and drops none; any other way to get here
      // differs in something else.
      const added = [...mb.removed].filter((v) => !ma.removed.has(v)).sort();
      const dropped = [...ma.removed].some((v) => !mb.removed.has(v));
      results.push(added.length > 0 && !dropped
        ? { canonical, safe: false, reason: 'variable', variables: added }
        : { canonical, safe: false, reason: 'value' });
      continue;
    }
    if (declarationsOf(sa) !== declarationsOf(sb)) { results.push({ canonical, safe: false, reason: 'value' }); continue; }
    // Only the selector differs. Whether the PROJECT made it differ is what
    // stock Tailwind answers: the same two classes, compiled without the
    // project's CSS. Equal there means a project-defined variant.
    let stock = null;
    try { stock = await env.loadStock(); } catch (e) {}
    const xa = stock && rawOf(stock, cls);
    const xb = stock && rawOf(stock, canonical);
    const same = xa && xb && own(stripMirrors(xa).css, cls) === own(stripMirrors(xb).css, canonical);
    results.push({ canonical, safe: false, reason: same ? 'variant' : 'selector' });
  }
  return results;
}`

// Tailwind builds its canonicalization tables on the first call, once per \`rem\`
// (~1 s on a real theme): a prewarmed worker pays it before any request comes.
const CANONICALIZE_WARMUP = `(ds, warm) => {
  ds.canonicalizeCandidates(['w-[1px]'], warm.rem ? { rem: warm.rem } : undefined);
}`

const WORKER_SCRIPT = makeWorkerScript(CANONICALIZE_HANDLER, '', CANONICALIZE_WARMUP)

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
    // In use: keep it past the cache's 30-day pruning.
    touchCacheFile(file)
    if (typeof data === 'object' && data !== null) {
      for (const [cls, entry] of Object.entries(data)) {
        // Persisted shape: [canonical, safe, reason?, variables?]. Validate strictly — a
        // corrupt/old-shape entry is skipped, never trusted into an autofix.
        const value = fromPersisted(entry)
        if (value) canonCache.set(cachePrefix + cls, value)
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
    // Null-prototype target so a `__proto__` cache key is treated as plain data,
    // never the prototype setter (which would silently swallow the entry).
    const merged: Record<string, unknown[]> = Object.create(null)
    try {
      const existing: unknown = JSON.parse(readFileSync(state.file, 'utf-8'))
      if (typeof existing === 'object' && existing !== null) {
        for (const [cls, entry] of Object.entries(existing)) {
          const value = fromPersisted(entry)
          if (value) {
            merged[cls] = toPersisted(value)
            // Adopt entries a sibling isolate persisted after our initial load
            // into our own in-memory cache, so the rest of this run serves them
            // without a worker round-trip. Values are deterministic for this
            // (DS, logic hash), so a key we already hold is identical — never
            // overwrite what we computed ourselves.
            const key = cachePrefix + cls
            if (!canonCache.has(key)) canonCache.set(key, value)
          }
        }
      }
    } catch {
      // No existing file, or corrupt — our entries alone become the new file.
    }
    for (const [key, value] of canonCache) {
      if (key.startsWith(cachePrefix)) {
        merged[key.slice(cachePrefix.length)] = toPersisted(value)
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
 * Start the canonicalize worker for `cssPath` in the background, warmed for
 * `rem` — what `canonicalizeClassesSync` will ask with. Called when a design
 * system has to be precomputed, so the two run side by side instead of one
 * after the other.
 */
export function prewarmCanonicalize(cssPath: string, rem?: number): void {
  canonWorker.prewarm(cssPath, { rem })
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
    if (raw.reason === 'variable') {
      // Never without the variables it names (see fromPersisted).
      if (isVariableList(raw.variables)) {
        value.reason = raw.reason
        value.variables = raw.variables
      } else {
        value.reason = 'value'
      }
    } else if (raw.reason) {
      value.reason = raw.reason
    }
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
