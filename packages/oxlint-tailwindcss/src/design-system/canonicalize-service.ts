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

import { DesignSystemWorker, makeWorkerScript } from './ds-worker'
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

  return out
}

/** Reset the canonicalize service (for tests). */
export function resetCanonicalizeService(): void {
  canonWorker.reset()
  canonCache.clear()
}
