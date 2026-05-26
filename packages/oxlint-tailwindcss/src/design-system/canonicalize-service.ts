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

import { DesignSystemWorker } from './ds-worker'
import { SortServiceError } from '../utils/fatal'

interface CanonicalizeRequest {
  classes: string[]
  rem?: number
}

const WORKER_SCRIPT = `
const { workerData } = require('worker_threads');

async function main() {
  const { sharedBuffer, cssPath } = workerData;
  const control = new Int32Array(sharedBuffer, 0, 4);
  const lengthView = new DataView(sharedBuffer, 4 * 4, 4);
  const dataArea = new Uint8Array(sharedBuffer, 4 * 4 + 4);

  let ds;
  try {
    const { __unstable__loadDesignSystem } = require(workerData.tailwindNodePath);
    const { readFileSync } = require('fs');
    const { dirname } = require('path');
    const css = readFileSync(cssPath, 'utf-8');
    ds = await __unstable__loadDesignSystem(css, { base: dirname(cssPath) });
  } catch {
    Atomics.store(control, 2, -1);
    Atomics.notify(control, 2);
    return;
  }

  Atomics.store(control, 2, 1);
  Atomics.notify(control, 2);

  while (true) {
    Atomics.wait(control, 0, 0);
    const len = lengthView.getUint32(0);
    const requestStr = Buffer.from(dataArea.slice(0, len)).toString('utf-8');
    Atomics.store(control, 0, 0);

    let response;
    try {
      const { classes, rem } = JSON.parse(requestStr);
      const options = rem ? { rem } : undefined;
      // canonicalizeCandidates deduplicates its input, so we must call it
      // one class at a time to preserve order/length. See sync-loader.ts.
      const result = classes.map((cls) => {
        const r = ds.canonicalizeCandidates([cls], options);
        return r[0] ?? cls;
      });
      response = Buffer.from(JSON.stringify(result), 'utf-8');
    } catch {
      response = Buffer.from('null', 'utf-8');
    }

    dataArea.set(response, 0);
    lengthView.setUint32(0, response.length);
    Atomics.store(control, 1, 1);
    Atomics.notify(control, 1);
  }
}
main();
`

const canonWorker = new DesignSystemWorker<CanonicalizeRequest, string[]>({
  workerScript: WORKER_SCRIPT,
  serviceName: 'canonicalize',
})

/**
 * Process-wide cache of canonicalized classes.
 * Key: `${cssPath}\0${rem}\0${className}` — isolates monorepos (multiple
 * DSs) and different rem settings. Value: canonicalized class string.
 */
const canonCache = new Map<string, string>()

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
): string[] {
  const out: string[] = Array.from({ length: classes.length })
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

  const freshByClass = new Map<string, string>()
  for (let k = 0; k < uniqueMissing.length; k++) {
    freshByClass.set(uniqueMissing[k], fresh[k])
  }

  for (let j = 0; j < missing.length; j++) {
    const cls = missing[j]
    const value = freshByClass.get(cls) ?? cls
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
