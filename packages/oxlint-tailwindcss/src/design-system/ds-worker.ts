/**
 * Generic worker-thread service wrapping `__unstable__loadDesignSystem`.
 *
 * `sort-service.ts` and `canonicalize-service.ts` used to be near-byte-identical
 * (~500 LOC) — both spawned a worker that loaded the design system, then served
 * synchronous requests over a SharedArrayBuffer using `Atomics.wait`. The only
 * real difference was the body of the request loop: `getClassOrder` vs
 * `canonicalizeCandidates`. This class encapsulates the entire shared protocol
 * — SharedArrayBuffer layout, state machine, lifecycle, fail-loud — and each
 * service shrinks to ~40 LOC of singleton + public signature.
 *
 * v1: failures throw `SortServiceError`. The error is sticky for the lifetime
 * of the process (per cssPath) so subsequent calls don't pay another
 * init-timeout cost. Callers wrap via `safeGetDS` to surface the failure as a
 * single `designSystemUnavailable` diagnostic.
 */

import { Worker } from 'node:worker_threads'
import { SortServiceError } from '../utils/fatal'
import { TAILWIND_NODE_PATH } from './tailwind-node'

// SharedArrayBuffer layout:
//   [0] Int32 — requestSignal  (0=idle, 1=has_request)
//   [1] Int32 — responseSignal (0=idle, 1=has_response)
//   [2] Int32 — readySignal    (0=loading, 1=ready, -1=error)
//   [3] Int32 — (reserved/padding)
//   [16..19]  — Uint32 data length
//   [20..]    — Uint8 data (JSON, shared for request & response)

const BUFFER_SIZE = 4 * 1024 * 1024 // 4 MB
const HEADER_INTS = 4
const DATA_OFFSET = HEADER_INTS * 4 + 4 // 20 bytes
const INIT_TIMEOUT = 60_000 // 60 s to load DS (raised in v1 to avoid spurious timeouts on slow CI)
const REQUEST_TIMEOUT = 30_000 // 30 s per request

interface ReadyState {
  worker: Worker
  controlArray: Int32Array
  lengthView: DataView
  dataArea: Uint8Array
  cssPath: string
}

export interface DesignSystemWorkerOptions {
  /** JS source passed to `new Worker(..., { eval: true })`. */
  workerScript: string
  /** Human-readable name shown in error messages — `'sort'` or `'canonicalize'`. */
  serviceName: 'sort' | 'canonicalize'
}

export class DesignSystemWorker<Req, Res> {
  private ready: ReadyState | null = null
  private lastError: SortServiceError | null = null

  constructor(private readonly opts: DesignSystemWorkerOptions) {}

  /**
   * Ensure the worker is running and pointed at `cssPath`. Returns the
   * ready state. Throws `SortServiceError` on any failure (init timeout,
   * spawn error, DS-load error). Sticky: subsequent calls for the same
   * cssPath rethrow without retrying.
   */
  private ensure(cssPath: string): ReadyState {
    if (this.lastError && this.ready?.cssPath === cssPath) throw this.lastError
    if (this.ready && this.ready.cssPath === cssPath) return this.ready

    if (this.ready) this.cleanup()
    this.lastError = null

    if (TAILWIND_NODE_PATH === null) {
      this.lastError = new SortServiceError(
        `Could not resolve '@tailwindcss/node' for the ${this.opts.serviceName} worker.`,
        "Install '@tailwindcss/node' (or upgrade oxlint-tailwindcss) and re-run.",
      )
      throw this.lastError
    }

    const sharedBuffer = new SharedArrayBuffer(BUFFER_SIZE)
    const controlArray = new Int32Array(sharedBuffer, 0, HEADER_INTS)
    const lengthView = new DataView(sharedBuffer, HEADER_INTS * 4, 4)
    const dataArea = new Uint8Array(sharedBuffer, DATA_OFFSET)

    let worker: Worker
    try {
      worker = new Worker(this.opts.workerScript, {
        eval: true,
        workerData: { sharedBuffer, cssPath, tailwindNodePath: TAILWIND_NODE_PATH },
      })
    } catch (cause) {
      this.lastError = new SortServiceError(
        `Failed to spawn ${this.opts.serviceName} worker for "${cssPath}".`,
        'This is unexpected; please open an issue with the error details.',
        { cause: cause instanceof Error ? cause : undefined },
      )
      throw this.lastError
    }

    worker.unref()
    worker.on('error', (err: Error) => {
      this.lastError = new SortServiceError(
        `${this.opts.serviceName} worker died: ${err.message}`,
        'The worker will not be restarted in this process. Restart the lint session.',
        { cause: err },
      )
    })

    // Wait for DS to load
    const result = Atomics.wait(controlArray, 2, 0, INIT_TIMEOUT)
    if (result === 'timed-out') {
      this.lastError = new SortServiceError(
        `${this.opts.serviceName} worker timed out loading the design system from "${cssPath}" after ${INIT_TIMEOUT}ms.`,
        'Raise settings.tailwindcss.timeout if your machine is slow, or verify the CSS imports resolve.',
      )
      this.terminateWorker(worker)
      throw this.lastError
    }
    if (controlArray[2] === -1) {
      this.lastError = new SortServiceError(
        `${this.opts.serviceName} worker failed to load the design system from "${cssPath}".`,
        'Verify @tailwindcss/node is installed and the CSS file (and its imports) is valid.',
      )
      this.terminateWorker(worker)
      throw this.lastError
    }

    this.ready = { worker, controlArray, lengthView, dataArea, cssPath }
    return this.ready
  }

  /**
   * Send a request to the worker and synchronously wait for the response.
   * Throws `SortServiceError` on any failure.
   */
  callSync(cssPath: string, req: Req): Res {
    const state = this.ensure(cssPath)

    const requestBytes = Buffer.from(JSON.stringify(req), 'utf-8')
    if (requestBytes.length > BUFFER_SIZE - DATA_OFFSET) {
      throw new SortServiceError(
        `${this.opts.serviceName} request payload is too large (${requestBytes.length} > ${BUFFER_SIZE - DATA_OFFSET} bytes).`,
        'This is unexpected with typical class lists; please open an issue.',
      )
    }

    state.dataArea.set(requestBytes, 0)
    state.lengthView.setUint32(0, requestBytes.length)

    Atomics.store(state.controlArray, 0, 1)
    Atomics.notify(state.controlArray, 0)

    const result = Atomics.wait(state.controlArray, 1, 0, REQUEST_TIMEOUT)
    if (result === 'timed-out') {
      this.lastError = new SortServiceError(
        `${this.opts.serviceName} worker request timed out after ${REQUEST_TIMEOUT}ms.`,
        'Raise settings.tailwindcss.timeout if your machine is slow.',
      )
      this.cleanup()
      throw this.lastError
    }

    const responseLen = state.lengthView.getUint32(0)
    const responseStr = Buffer.from(state.dataArea.slice(0, responseLen)).toString('utf-8')
    Atomics.store(state.controlArray, 1, 0)

    let parsed: unknown
    try {
      parsed = JSON.parse(responseStr)
    } catch (cause) {
      this.lastError = new SortServiceError(
        `${this.opts.serviceName} worker returned non-JSON response.`,
        'This is a bug; please open an issue.',
        { cause: cause instanceof Error ? cause : undefined },
      )
      this.cleanup()
      throw this.lastError
    }

    if (parsed === null) {
      this.lastError = new SortServiceError(
        `${this.opts.serviceName} worker returned null — request body was rejected.`,
        'This is a bug; please open an issue with the input that triggered it.',
      )
      this.cleanup()
      throw this.lastError
    }

    return parsed as Res
  }

  reset(): void {
    this.cleanup()
    this.lastError = null
  }

  private cleanup(): void {
    if (this.ready) {
      this.terminateWorker(this.ready.worker)
      this.ready = null
    }
  }

  private terminateWorker(worker: Worker): void {
    try {
      worker.terminate()
    } catch {
      // Already dead — nothing to do.
    }
  }
}
