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
import { resolveTailwindNodeFor } from './tailwind-node'

// SharedArrayBuffer layout:
//   [0] Int32 — requestSignal  (0=idle, 1=has_request)
//   [1] Int32 — responseSignal (0=idle, 1=has_response)
//   [2] Int32 — readySignal    (0=loading, 1=ready, -1=error)
//   [3] Int32 — (reserved/padding)
//   [16..19]  — Uint32 data length
//   [20..]    — Uint8 data (JSON, shared for request & response)

const BUFFER_SIZE = 4 * 1024 * 1024 // 4 MB
const HEADER_INTS = 4
const LENGTH_OFFSET = HEADER_INTS * 4 // 16 bytes
const DATA_OFFSET = LENGTH_OFFSET + 4 // 20 bytes
const INIT_TIMEOUT = 60_000 // 60 s to load DS (raised in v1 to avoid spurious timeouts on slow CI)
const REQUEST_TIMEOUT = 30_000 // 30 s per request

// LRU bound on live workers (#77). In a monorepo linted in one oxlint run the
// plugin can resolve several entry points, and oxlint feeds files in
// nondeterministic order — a singleton worker tore itself down and re-loaded
// the design system (~200 ms + a ~1.9 s cold canonicalize) on every switch. We
// keep one warm worker PER cssPath instead. Each entry is a full design system
// plus a 4 MB SharedArrayBuffer, so the count is capped and the
// least-recently-used worker is evicted past the cap.
const MAX_WORKERS = 8

/**
 * Build the worker script shared by `sort-service` and `canonicalize-service`.
 * Owns the entire SharedArrayBuffer protocol (offsets derived from the same
 * constants the host uses, so they can't drift), the design-system load with
 * error propagation (DS-M4: the real cause is written into the buffer so the
 * host can surface it, not a generic "failed to load"), the ready signal, and
 * the request loop. `handlerExpr` is a function expression `(ds, request) =>
 * result` — the only part that differs between services.
 */
export function makeWorkerScript(handlerExpr: string, preamble = ''): string {
  return `
${preamble}
const { workerData } = require('worker_threads');
async function main() {
  const { sharedBuffer, cssPath } = workerData;
  const control = new Int32Array(sharedBuffer, 0, ${HEADER_INTS});
  const lengthView = new DataView(sharedBuffer, ${LENGTH_OFFSET}, 4);
  const dataArea = new Uint8Array(sharedBuffer, ${DATA_OFFSET});

  // On load failure, write the real cause into the data region so the host can
  // report it instead of a bare "failed to load the design system".
  function signalLoadError(e) {
    try {
      const msg = Buffer.from(String((e && e.message) || e || 'unknown design-system load error'), 'utf-8');
      const n = Math.min(msg.length, dataArea.length);
      dataArea.set(msg.subarray(0, n), 0);
      lengthView.setUint32(0, n);
    } catch {}
    Atomics.store(control, 2, -1);
    Atomics.notify(control, 2);
  }

  let ds;
  try {
    const { __unstable__loadDesignSystem } = require(workerData.tailwindNodePath);
    const { readFileSync } = require('fs');
    const { dirname } = require('path');
    const css = readFileSync(cssPath, 'utf-8');
    ds = await __unstable__loadDesignSystem(css, { base: dirname(cssPath) });
  } catch (e) {
    signalLoadError(e);
    return;
  }

  Atomics.store(control, 2, 1);
  Atomics.notify(control, 2);

  const handler = ${handlerExpr};

  while (true) {
    Atomics.wait(control, 0, 0);
    const len = lengthView.getUint32(0);
    const requestStr = Buffer.from(dataArea.slice(0, len)).toString('utf-8');
    Atomics.store(control, 0, 0);

    let response;
    try {
      const request = JSON.parse(requestStr);
      const result = handler(ds, request);
      response = Buffer.from(JSON.stringify(result), 'utf-8');
    } catch {
      response = Buffer.from('null', 'utf-8');
    }

    // DS-M6: if the response doesn't fit the shared buffer, reply with a
    // sentinel the host reads as a rejected request, instead of letting
    // dataArea.set throw and kill the worker (which would hang the caller
    // until the request timeout and then report a misleading timeout).
    if (response.length > dataArea.length) {
      response = Buffer.from('null', 'utf-8');
    }

    dataArea.set(response, 0);
    lengthView.setUint32(0, response.length);
    Atomics.store(control, 1, 1);
    Atomics.notify(control, 1);
  }
}
main().catch(() => {});
`
}

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
  /** Human-readable name shown in error messages. */
  serviceName: 'sort' | 'canonicalize' | 'declarations'
}

export class DesignSystemWorker<Req, Res> {
  // One warm worker per cssPath (#77), insertion-ordered so the first key is
  // the least-recently-used; `ensure` re-inserts on a hit to mark it MRU.
  //
  // Keyed by cssPath alone (NOT cssPath+engine): one engine per cssPath per
  // process is guaranteed by the memoized `resolveTailwindNodeFor` + require
  // cache pinning, so a fixed cssPath can never need two engines in-process. An
  // engine upgrade is only ever observed by a fresh process (empty maps). If
  // hot engine reload is ever introduced, switch the key to
  // `${cssPath}\0${nodeVersion}` and pair it with a resolver-memo invalidation.
  private workers = new Map<string, ReadyState>()
  // Sticky errors keyed per cssPath. A failure for one entry point must not be
  // forgotten when another entry point is linted in between — the old single
  // lastError/lastErrorCssPath pair was cleared on ANY cssPath switch, so it
  // never stayed sticky across the alternating-file pattern #77 describes.
  private errors = new Map<string, SortServiceError>()

  constructor(private readonly opts: DesignSystemWorkerOptions) {}

  /** Record an error as sticky for `cssPath` and return it for `throw`. */
  private remember(cssPath: string, err: SortServiceError): SortServiceError {
    this.errors.set(cssPath, err)
    return err
  }

  /**
   * Ensure the worker is running and pointed at `cssPath`. Returns the
   * ready state. Throws `SortServiceError` on any failure (init timeout,
   * spawn error, DS-load error). Sticky: subsequent calls for the same
   * cssPath rethrow without retrying.
   */
  private ensure(cssPath: string): ReadyState {
    const sticky = this.errors.get(cssPath)
    if (sticky) throw sticky

    const existing = this.workers.get(cssPath)
    if (existing) {
      // Mark most-recently-used: delete + re-insert moves it to the tail so
      // the LRU eviction below always drops the coldest entry point.
      this.workers.delete(cssPath)
      this.workers.set(cssPath, existing)
      return existing
    }

    // Resolve the consumer's engine for this entry point (issue #114). The same
    // memoized pure resolver feeds the precompute and the disk-cache key, so all
    // layers load the identical @tailwindcss/node for a given cssPath.
    const { nodePath: tailwindNodePath } = resolveTailwindNodeFor(cssPath)
    if (tailwindNodePath === null) {
      throw this.remember(
        cssPath,
        new SortServiceError(
          `Could not resolve '@tailwindcss/node' for the ${this.opts.serviceName} worker.`,
          "Install '@tailwindcss/node' (or upgrade oxlint-tailwindcss) and re-run.",
        ),
      )
    }

    const sharedBuffer = new SharedArrayBuffer(BUFFER_SIZE)
    const controlArray = new Int32Array(sharedBuffer, 0, HEADER_INTS)
    const lengthView = new DataView(sharedBuffer, HEADER_INTS * 4, 4)
    const dataArea = new Uint8Array(sharedBuffer, DATA_OFFSET)

    let worker: Worker
    try {
      worker = new Worker(this.opts.workerScript, {
        eval: true,
        workerData: { sharedBuffer, cssPath, tailwindNodePath },
      })
    } catch (cause) {
      throw this.remember(
        cssPath,
        new SortServiceError(
          `Failed to spawn ${this.opts.serviceName} worker for "${cssPath}".`,
          'This is unexpected; please open an issue with the error details.',
          { cause: cause instanceof Error ? cause : undefined },
        ),
      )
    }

    worker.unref()
    worker.on('error', (err: Error) => {
      this.errors.set(
        cssPath,
        new SortServiceError(
          `${this.opts.serviceName} worker died: ${err.message}`,
          'The worker will not be restarted in this process. Restart the lint session.',
          { cause: err },
        ),
      )
      // Drop the corpse so a later ensure() for this cssPath doesn't reuse it.
      // Guard on identity: an evicted worker's late error must not delete a
      // fresh worker created for the same cssPath afterwards (terminateWorker
      // also removes this listener, so an intentional teardown never fires it).
      const current = this.workers.get(cssPath)
      if (current && current.worker === worker) this.workers.delete(cssPath)
    })

    // Wait for DS to load
    const result = Atomics.wait(controlArray, 2, 0, INIT_TIMEOUT)
    if (result === 'timed-out') {
      this.terminateWorker(worker)
      throw this.remember(
        cssPath,
        new SortServiceError(
          `${this.opts.serviceName} worker timed out loading the design system from "${cssPath}" after ${INIT_TIMEOUT}ms.`,
          // This timeout is a fixed internal limit, NOT settings.tailwindcss.timeout
          // (which only governs the precompute loader). Don't send users chasing a
          // setting that won't move it.
          'Verify the CSS imports resolve; this can also happen if the machine or CI runner is heavily loaded.',
        ),
      )
    }
    if (controlArray[2] === -1) {
      // The worker wrote the real cause into the data region (DS-M4).
      const len = lengthView.getUint32(0)
      const detail = len > 0 ? Buffer.from(dataArea.slice(0, len)).toString('utf-8') : ''
      this.terminateWorker(worker)
      throw this.remember(
        cssPath,
        new SortServiceError(
          `${this.opts.serviceName} worker failed to load the design system from "${cssPath}".${
            detail ? ` ${detail}` : ''
          }`,
          'Verify @tailwindcss/node is installed and the CSS file (and its imports) is valid.',
        ),
      )
    }

    const state: ReadyState = { worker, controlArray, lengthView, dataArea, cssPath }
    this.workers.set(cssPath, state)
    this.evictIfNeeded()
    return state
  }

  /** Evict least-recently-used workers past the cap (#77). */
  private evictIfNeeded(): void {
    while (this.workers.size > MAX_WORKERS) {
      const oldestKey = this.workers.keys().next().value
      if (oldestKey === undefined) break
      const oldest = this.workers.get(oldestKey)
      this.workers.delete(oldestKey)
      if (oldest) this.terminateWorker(oldest.worker)
    }
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
      // Per-request failure (#130): drop the worker so the next call re-spawns
      // and retries, but do NOT remember() it as sticky. A request-level failure
      // is a property of one input, not of the entry point — making it sticky
      // (as init failures are) let one malformed/transient input permanently
      // disable the rule for the whole cssPath until the process restarted.
      // Mirrors the already-non-sticky "payload too large" branch above.
      this.dropWorker(cssPath)
      throw new SortServiceError(
        `${this.opts.serviceName} worker request timed out after ${REQUEST_TIMEOUT}ms.`,
        // Fixed internal limit, not settings.tailwindcss.timeout.
        'This is unexpected for typical class lists; please open an issue if it persists.',
      )
    }

    const responseLen = state.lengthView.getUint32(0)
    const responseStr = Buffer.from(state.dataArea.slice(0, responseLen)).toString('utf-8')
    Atomics.store(state.controlArray, 1, 0)

    let parsed: unknown
    try {
      parsed = JSON.parse(responseStr)
    } catch (cause) {
      // Per-request failure (#130): drop-and-retry, not sticky. See the
      // request-timeout branch above for the rationale.
      this.dropWorker(cssPath)
      throw new SortServiceError(
        `${this.opts.serviceName} worker returned non-JSON response.`,
        'This is a bug; please open an issue.',
        { cause: cause instanceof Error ? cause : undefined },
      )
    }

    if (parsed === null) {
      // Per-request failure (#130): drop-and-retry, not sticky. After the
      // handler guards land, the only realistic cause here is an oversized
      // response (the response-side twin of "payload too large"), so a later
      // request with different input must be free to succeed, not rethrow.
      this.dropWorker(cssPath)
      throw new SortServiceError(
        `${this.opts.serviceName} worker returned null — the request body was rejected or its response did not fit the buffer.`,
        'This is a bug; please open an issue with the input that triggered it.',
      )
    }

    return parsed as Res
  }

  reset(): void {
    for (const state of this.workers.values()) this.terminateWorker(state.worker)
    this.workers.clear()
    this.errors.clear()
  }

  /** Terminate and forget the worker for a single cssPath (on request failure). */
  private dropWorker(cssPath: string): void {
    const state = this.workers.get(cssPath)
    if (state) {
      this.workers.delete(cssPath)
      this.terminateWorker(state.worker)
    }
  }

  private terminateWorker(worker: Worker): void {
    try {
      // Remove the crash listener first so an intentional teardown (evict,
      // drop, reset) never fires the sticky-error handler for this cssPath.
      worker.removeAllListeners('error')
      // Fire-and-forget: teardown never needs the exit code. `void` marks the
      // returned promise as intentionally unawaited (typescript/no-floating-promises).
      void worker.terminate()
    } catch {
      // Already dead — nothing to do.
    }
  }
}
