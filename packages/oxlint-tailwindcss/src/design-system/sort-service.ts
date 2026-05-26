/**
 * Persistent sort service backed by `DesignSystemWorker`.
 *
 * Calls `ds.getClassOrder(classes)` and returns the class names in the
 * Tailwind-canonical order. The shared protocol (SharedArrayBuffer,
 * Atomics.wait, fail-loud, sticky lastError) lives in `./ds-worker.ts`.
 */

import { DesignSystemWorker } from './ds-worker'

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
      const classes = JSON.parse(requestStr);
      const ordered = ds.getClassOrder(classes);
      const sorted = [...ordered]
        .sort((a, b) => {
          if (a[1] === null && b[1] === null) return 0;
          if (a[1] === null) return -1;
          if (b[1] === null) return 1;
          return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
        })
        .map(([name]) => name);
      response = Buffer.from(JSON.stringify(sorted), 'utf-8');
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
