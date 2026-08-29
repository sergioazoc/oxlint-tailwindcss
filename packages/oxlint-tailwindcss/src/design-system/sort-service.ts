/**
 * Persistent sort service backed by `DesignSystemWorker`.
 *
 * Calls `ds.getClassOrder(classes)` and returns the class names in the
 * Tailwind-canonical order. The shared protocol (SharedArrayBuffer,
 * Atomics.wait, fail-loud, sticky lastError) lives in `./ds-worker.ts`.
 */

import { DesignSystemWorker, makeWorkerScript } from './ds-worker'

// Handler: sort the requested classes into Tailwind-canonical order.
// `null` sort indices (unknown classes) sort first, preserving their relative
// position. The shared protocol/load/loop lives in makeWorkerScript.
export const SORT_HANDLER = `(ds, classes) => {
  // A malformed/mid-typing arbitrary value can make ds.getClassOrder throw on
  // some engine versions (#130). Degrade to the input order (no reordering):
  // the rule reads an unchanged order as "already sorted" and emits nothing,
  // instead of the throw becoming the worker's 'null' sentinel → a
  // process-sticky fatal error that disabled the rule until restart.
  let ordered;
  try {
    ordered = ds.getClassOrder(classes);
  } catch (e) {
    return classes;
  }
  return [...ordered]
    .sort((a, b) => {
      if (a[1] === null && b[1] === null) return 0;
      if (a[1] === null) return -1;
      if (b[1] === null) return 1;
      return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    })
    .map(([name]) => name);
}`

const WORKER_SCRIPT = makeWorkerScript(SORT_HANDLER)

const sortWorker = new DesignSystemWorker<string[], string[]>({
  workerScript: WORKER_SCRIPT,
  serviceName: 'sort',
})

/**
 * Sort classes via worker thread using the official Tailwind class order.
 *
 * Throws `SortServiceError` on any failure (worker init timeout, request
 * timeout, worker crash, payload too large). Callers should wrap via
 * `safeGetDS` so the failure surfaces as a single `designSystemUnavailable`
 * diagnostic instead of crashing the lint.
 */
export function sortClassesSync(cssPath: string, classes: string[]): string[] {
  return sortWorker.callSync(cssPath, classes)
}

/** Reset the sort service (for tests). */
export function resetSortService(): void {
  sortWorker.reset()
}
