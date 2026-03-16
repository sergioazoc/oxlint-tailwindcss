/**
 * Persistent sort service using worker_threads + SharedArrayBuffer.
 *
 * The problem: `ds.getClassOrder()` is the only way to get the exact official
 * Tailwind CSS sort order (matching oxfmt/prettier-plugin-tailwindcss), but the
 * design system is async to load and the oxlint plugin API is sync.
 *
 * The solution: spawn a Worker thread that loads the DS once, then accepts sort
 * requests via SharedArrayBuffer + Atomics. The parent uses `Atomics.wait()`
 * (with timeout) for synchronous blocking without risk of infinite hangs.
 *
 * Falls back gracefully if the worker fails to initialize within the timeout.
 */

import { Worker } from 'node:worker_threads'

// SharedArrayBuffer layout:
//   [0] Int32  — requestSignal  (0=idle, 1=has_request)
//   [1] Int32  — responseSignal (0=idle, 1=has_response)
//   [2] Int32  — readySignal    (0=loading, 1=ready, -1=error)
//   [3] Int32  — (reserved/padding)
//   [16..19]   — Uint32 data length
//   [20..]     — Uint8 data (JSON, shared for request & response)

const BUFFER_SIZE = 4 * 1024 * 1024 // 4 MB
const HEADER_INTS = 4
const DATA_OFFSET = HEADER_INTS * 4 + 4 // 20 bytes
const INIT_TIMEOUT = 30_000 // 30 s to load DS
const REQUEST_TIMEOUT = 10_000 // 10 s per sort request

const WORKER_SCRIPT = `
const { workerData } = require('worker_threads');

async function main() {
  const { sharedBuffer, cssPath } = workerData;
  const control = new Int32Array(sharedBuffer, 0, ${HEADER_INTS});
  const lengthView = new DataView(sharedBuffer, ${HEADER_INTS * 4}, 4);
  const dataArea = new Uint8Array(sharedBuffer, ${DATA_OFFSET});

  let ds;
  try {
    const { __unstable__loadDesignSystem } = require('@tailwindcss/node');
    const { readFileSync } = require('fs');
    const { dirname } = require('path');
    const css = readFileSync(cssPath, 'utf-8');
    ds = await __unstable__loadDesignSystem(css, { base: dirname(cssPath) });
  } catch {
    Atomics.store(control, 2, -1);
    Atomics.notify(control, 2);
    return;
  }

  // Signal ready
  Atomics.store(control, 2, 1);
  Atomics.notify(control, 2);

  // Request loop
  while (true) {
    Atomics.wait(control, 0, 0); // wait for requestSignal !== 0

    const len = lengthView.getUint32(0);
    const requestStr = Buffer.from(dataArea.slice(0, len)).toString('utf-8');
    Atomics.store(control, 0, 0); // consume request

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

    Atomics.store(control, 1, 1); // signal response
    Atomics.notify(control, 1);
  }
}
main();
`

let worker: Worker | null = null
let controlArray: Int32Array | null = null
let lengthView: DataView | null = null
let dataArea: Uint8Array | null = null
let initialized = false
let available = true

function ensureService(cssPath: string): boolean {
  if (initialized) return available
  initialized = true

  try {
    const sharedBuffer = new SharedArrayBuffer(BUFFER_SIZE)
    controlArray = new Int32Array(sharedBuffer, 0, HEADER_INTS)
    lengthView = new DataView(sharedBuffer, HEADER_INTS * 4, 4)
    dataArea = new Uint8Array(sharedBuffer, DATA_OFFSET)

    worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { sharedBuffer, cssPath },
    })

    worker.unref()

    worker.on('error', () => {
      available = false
      worker = null
    })
    worker.on('exit', () => {
      worker = null
    })

    // Wait for DS to load (with timeout)
    const result = Atomics.wait(controlArray, 2, 0, INIT_TIMEOUT)
    if (result === 'timed-out' || controlArray[2] === -1) {
      available = false
      cleanup()
      return false
    }

    process.on('exit', cleanup)
    return true
  } catch {
    available = false
    cleanup()
    return false
  }
}

function cleanup(): void {
  if (worker) {
    try {
      worker.terminate()
    } catch {}
    worker = null
  }
}

/**
 * Sort classes using the official Tailwind CSS sort order via worker thread.
 * Returns the sorted class array, or null if the service is unavailable.
 */
export function sortClassesSync(cssPath: string, classes: string[]): string[] | null {
  if (!ensureService(cssPath)) return null
  if (!controlArray || !dataArea || !lengthView) return null

  try {
    const request = Buffer.from(JSON.stringify(classes), 'utf-8')
    if (request.length > BUFFER_SIZE - DATA_OFFSET) return null // too large

    dataArea.set(request, 0)
    lengthView.setUint32(0, request.length)

    // Signal request
    Atomics.store(controlArray, 0, 1)
    Atomics.notify(controlArray, 0)

    // Wait for response (with timeout)
    const result = Atomics.wait(controlArray, 1, 0, REQUEST_TIMEOUT)
    if (result === 'timed-out') {
      available = false
      cleanup()
      return null
    }

    // Read response
    const responseLen = lengthView.getUint32(0)
    const responseStr = Buffer.from(dataArea.slice(0, responseLen)).toString('utf-8')
    Atomics.store(controlArray, 1, 0) // consume response

    return JSON.parse(responseStr)
  } catch {
    available = false
    cleanup()
    return null
  }
}

/**
 * Reset the sort service (for tests).
 */
export function resetSortService(): void {
  cleanup()
  initialized = false
  available = true
  controlArray = null
  lengthView = null
  dataArea = null
}
