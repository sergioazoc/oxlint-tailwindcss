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
 * v1: failures throw `SortServiceError`. Init/spawn/crash/DS-load failures are
 * HARD sticky per cssPath for the process lifetime, so subsequent calls don't
 * pay another init-timeout cost. Per-request failures (timeout / non-JSON /
 * null) are SOFT sticky (#145): unbounded retrying re-pays the full request
 * timeout on every class list (O(files)), so after a few consecutive failures
 * the error goes sticky for a backoff window and the rest of the run fails fast;
 * any success clears it. DS-dependent callers surface the failure as
 * `designSystemUnavailable` (via `safeGetDS`, or `reportFatalDsError` directly);
 * the DS-optional caller of the declaration service catches it and degrades.
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

// After this many consecutive per-request failures for one entry point, the
// error goes SOFT-sticky so the rest of the run fails fast instead of re-paying
// the timeout on every remaining class list (#145). Any success resets the
// count, so a single transient blip never trips it.
const MAX_CONSECUTIVE_REQUEST_FAILURES = 3

// How long a SOFT (per-request) sticky error lasts before a retry is allowed
// again (#145). Unlike init/spawn/crash/DS-load failures — HARD sticky for the
// whole process — a per-request sticky expires: after this window `ensure()`
// lets one attempt through, so a long-lived editor self-heals when the machine
// recovers instead of staying dead until restart (the #130 symptom).
const REQUEST_STICKY_BACKOFF_MS = 60_000

/**
 * Per-request timeout override for slow-but-functional machines (#145). A
 * machine whose cold canonicalize sits close to the 30 s default times out
 * spuriously; raising this lets the request COMPLETE (the rule keeps working)
 * rather than only failing fast. An env var — not a `settings.tailwindcss` key —
 * keeps the documented invariant that worker services don't read
 * `settings.tailwindcss.timeout`, and sidesteps the settings-timing problem
 * (settings throw inside `createOnce`). Read once per worker construction.
 */
function envRequestTimeout(): number | undefined {
  return parseRequestTimeout(process.env.OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT)
}

/**
 * `OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT` → milliseconds, or `undefined`
 * (use the default) for anything that isn't a finite positive number. Exported
 * for the tests that pin what the settings page documents.
 */
export function parseRequestTimeout(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// LRU bound on live workers (#77). In a monorepo linted in one oxlint run the
// plugin can resolve several entry points, and oxlint feeds files in
// nondeterministic order — a singleton worker tore itself down and re-loaded
// the design system (~200 ms + a ~1.9 s cold canonicalize) on every switch. We
// keep one warm worker PER cssPath instead. Each entry is a full design system
// plus a 4 MB SharedArrayBuffer, so the count is capped and the
// least-recently-used worker is evicted past the cap.
const MAX_WORKERS = 8

/**
 * Build the worker script shared by `sort-service`, `canonicalize-service`, and
 * `declaration-service`.
 * Owns the entire SharedArrayBuffer protocol (offsets derived from the same
 * constants the host uses, so they can't drift), the design-system load with
 * error propagation (DS-M4: the real cause is written into the buffer so the
 * host can surface it, not a generic "failed to load"), the ready signal, and
 * the request loop. `handlerExpr` is a function expression `(ds, request) =>
 * result` — the part that differs between services — and `preamble` is
 * optional source prepended to the script (declaration-service injects the
 * shared `DECL_EXTRACTOR_SOURCE`).
 */
export function makeWorkerScript(handlerExpr: string, preamble = '', warmupExpr = ''): string {
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
  let loadDesignSystem;
  let base;
  try {
    ({ __unstable__loadDesignSystem: loadDesignSystem } = require(workerData.tailwindNodePath));
    const { readFileSync } = require('fs');
    const { dirname } = require('path');
    const css = readFileSync(cssPath, 'utf-8');
    base = dirname(cssPath);
    ds = await loadDesignSystem(css, { base });
  } catch (e) {
    signalLoadError(e);
    return;
  }

  // What a handler may need besides the project's design system. \`loadStock\`:
  // plain \`@import "tailwindcss"\` from the same place, on the same engine — the
  // baseline that tells what the project's own CSS changed. Loaded the first
  // time a handler asks, never otherwise.
  let stockPromise = null;
  const env = {
    loadStock() {
      if (!stockPromise) stockPromise = loadDesignSystem('@import "tailwindcss";', { base });
      return stockPromise;
    },
  };

  Atomics.store(control, 2, 1);
  Atomics.notify(control, 2);

  // A worker started ahead of its first request (\`prewarm\`) warms up after
  // saying it's ready: a request that arrives meanwhile waits in control[0]
  // and is picked up as soon as the loop starts.
  const warmup = ${warmupExpr || 'null'};
  if (warmup && workerData.warm !== undefined) {
    try { await warmup(ds, workerData.warm, env); } catch {}
  }

  const handler = ${handlerExpr};

  while (true) {
    Atomics.wait(control, 0, 0);
    const len = lengthView.getUint32(0);
    const requestStr = Buffer.from(dataArea.slice(0, len)).toString('utf-8');
    Atomics.store(control, 0, 0);

    let response;
    try {
      const request = JSON.parse(requestStr);
      const result = await handler(ds, request, env);
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
  /** False while a prewarmed worker may still be loading its design system. */
  ready: boolean
}

export interface DesignSystemWorkerOptions {
  /** JS source passed to `new Worker(..., { eval: true })`. */
  workerScript: string
  /** Human-readable name shown in error messages. */
  serviceName: 'sort' | 'canonicalize' | 'declarations'
  /**
   * Per-request timeout in ms. Precedence: this option >
   * `OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT` env var > the 30 s default.
   * Exists mainly as a test seam — a real timeout test would otherwise wait the
   * full default; users tune it via the env var (#145).
   */
  requestTimeoutMs?: number
  /**
   * Consecutive per-request failures for one entry point before the error goes
   * soft-sticky (default {@link MAX_CONSECUTIVE_REQUEST_FAILURES}). Test seam (#145).
   */
  maxConsecutiveRequestFailures?: number
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
  // Per-request (SOFT) sticky state, kept separate from `errors` (which is HARD
  // sticky: init/spawn/crash/DS-load, never retried in-process). A per-request
  // failure — timeout, oversized response, non-JSON — is bounded, not permanent
  // (#145): `failRequest` counts consecutive failures per cssPath and, past
  // MAX_CONSECUTIVE_REQUEST_FAILURES, records a soft sticky good for
  // REQUEST_STICKY_BACKOFF_MS; `ensure` fast-fails until it expires, then lets
  // one retry through; any success (in `callSync`) clears both. This bounds the
  // O(files) timeout cost without reintroducing the #130 "dead until restart".
  private requestFailCount = new Map<string, number>()
  private requestStick = new Map<string, { err: SortServiceError; until: number }>()

  /** Resolved per-request timeout (option > env var > REQUEST_TIMEOUT). */
  private readonly requestTimeoutMs: number
  /** Resolved consecutive-failure budget before a per-request error goes soft-sticky. */
  private readonly maxConsecutiveRequestFailures: number

  constructor(private readonly opts: DesignSystemWorkerOptions) {
    this.requestTimeoutMs = opts.requestTimeoutMs ?? envRequestTimeout() ?? REQUEST_TIMEOUT
    this.maxConsecutiveRequestFailures =
      opts.maxConsecutiveRequestFailures ?? MAX_CONSECUTIVE_REQUEST_FAILURES
  }

  /** Record an error as HARD sticky for `cssPath` and return it for `throw`. */
  private remember(cssPath: string, err: SortServiceError): SortServiceError {
    this.errors.set(cssPath, err)
    return err
  }

  /**
   * Handle a per-request (SOFT) failure (#145): drop the worker so the next call
   * re-spawns, count consecutive failures for this cssPath, and once the budget
   * is spent record a soft sticky good for a backoff window so the rest of the
   * run fails fast instead of re-paying the timeout per class list. A later
   * success (see `callSync`) clears the count and the soft sticky. Returns the
   * error for `throw` (mirrors `remember`).
   */
  private failRequest(cssPath: string, err: SortServiceError): SortServiceError {
    this.dropWorker(cssPath)
    const count = (this.requestFailCount.get(cssPath) ?? 0) + 1
    this.requestFailCount.set(cssPath, count)
    if (count >= this.maxConsecutiveRequestFailures) {
      this.requestStick.set(cssPath, { err, until: Date.now() + REQUEST_STICKY_BACKOFF_MS })
    }
    return err
  }

  /**
   * Ensure the worker is running and pointed at `cssPath`. Returns the
   * ready state. Throws `SortServiceError` on any failure (init timeout,
   * spawn error, DS-load error). Sticky: subsequent calls for the same
   * cssPath rethrow without retrying.
   */
  private ensure(cssPath: string): ReadyState {
    // HARD sticky (init/spawn/crash/DS-load): never retried in this process.
    const sticky = this.errors.get(cssPath)
    if (sticky) throw sticky

    // SOFT sticky (per-request budget spent, #145): fast-fail until the backoff
    // window elapses, then clear it and let one attempt through — a success then
    // resets the budget, so a long-lived process self-heals.
    const soft = this.requestStick.get(cssPath)
    if (soft) {
      if (Date.now() < soft.until) throw soft.err
      this.requestStick.delete(cssPath)
      this.requestFailCount.delete(cssPath)
    }

    const existing = this.workers.get(cssPath)
    if (existing && !existing.ready) {
      // Prewarmed: wait for its init now (usually long done).
      this.workers.delete(cssPath)
      this.waitReady(existing)
      this.workers.set(cssPath, existing)
      return existing
    }
    if (existing) {
      // Mark most-recently-used: delete + re-insert moves it to the tail so
      // the LRU eviction below always drops the coldest entry point.
      this.workers.delete(cssPath)
      this.workers.set(cssPath, existing)
      return existing
    }

    const state = this.spawn(cssPath)
    this.waitReady(state)
    this.workers.set(cssPath, state)
    this.evictIfNeeded()
    return state
  }

  /**
   * Start the worker for `cssPath` without waiting for it: it loads the design
   * system and then runs the script's warm-up with `warm`, while the caller
   * carries on. The first request waits for whatever is left. Never throws — a
   * worker that can't start reports on its first request, as it would have. A
   * no-op when the worker is already there, or known to fail.
   */
  prewarm(cssPath: string, warm: unknown): void {
    if (this.workers.has(cssPath) || this.errors.has(cssPath) || this.requestStick.has(cssPath)) {
      return
    }
    try {
      this.workers.set(cssPath, this.spawn(cssPath, warm))
      this.evictIfNeeded()
    } catch {
      // Remembered by `spawn`; the first request rethrows it.
    }
  }

  /** Create the worker and its buffers; `ready` is false until `waitReady`. */
  private spawn(cssPath: string, warm?: unknown): ReadyState {
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
        workerData: { sharedBuffer, cssPath, tailwindNodePath, warm },
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

    return { worker, controlArray, lengthView, dataArea, cssPath, ready: false }
  }

  /** Wait for a spawned worker's design system; throws (and remembers) on failure. */
  private waitReady(state: ReadyState): void {
    const { worker, controlArray, lengthView, dataArea, cssPath } = state
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

    state.ready = true
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

    const result = Atomics.wait(state.controlArray, 1, 0, this.requestTimeoutMs)
    if (result === 'timed-out') {
      // Per-request failure: bounded drop-and-retry (#145). A timeout is usually
      // a property of the MACHINE, not the input — a machine slow enough to time
      // out once times out again, and dropWorker resets the DS to cold, so an
      // unbounded retry re-pays the full timeout on every remaining class list
      // (O(files)). failRequest goes soft-sticky after a few consecutive
      // failures so the rest of the run fails fast. If the machine is merely
      // slow, raise OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT so the request
      // completes instead of failing.
      throw this.failRequest(
        cssPath,
        new SortServiceError(
          `${this.opts.serviceName} worker request timed out after ${this.requestTimeoutMs}ms.`,
          // Not settings.tailwindcss.timeout (that governs the precompute loader
          // only); raise OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT instead.
          'A slow machine or CI runner can cause this. If the class lists are valid, raise OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT; otherwise please open an issue.',
        ),
      )
    }

    const responseLen = state.lengthView.getUint32(0)
    const responseStr = Buffer.from(state.dataArea.slice(0, responseLen)).toString('utf-8')
    Atomics.store(state.controlArray, 1, 0)

    let parsed: unknown
    try {
      parsed = JSON.parse(responseStr)
    } catch (cause) {
      // Per-request failure: bounded drop-and-retry (#145). See the request-
      // timeout branch above for the rationale.
      throw this.failRequest(
        cssPath,
        new SortServiceError(
          `${this.opts.serviceName} worker returned non-JSON response.`,
          'This is a bug; please open an issue.',
          { cause: cause instanceof Error ? cause : undefined },
        ),
      )
    }

    if (parsed === null) {
      // Per-request failure: bounded drop-and-retry (#145). After #132's handler
      // guards the only realistic cause is an oversized response, so a later
      // request with different input must be free to succeed — but repeated
      // failures still go soft-sticky so the run doesn't stall.
      throw this.failRequest(
        cssPath,
        new SortServiceError(
          `${this.opts.serviceName} worker returned null — the request body was rejected or its response did not fit the buffer.`,
          'This is a bug; please open an issue with the input that triggered it.',
        ),
      )
    }

    // Success clears any per-request failure budget / soft sticky for this
    // cssPath (#145), so failures spread across a long run never accumulate.
    this.requestFailCount.delete(cssPath)
    this.requestStick.delete(cssPath)
    return parsed as Res
  }

  reset(): void {
    for (const state of this.workers.values()) this.terminateWorker(state.worker)
    this.workers.clear()
    this.errors.clear()
    this.requestFailCount.clear()
    this.requestStick.clear()
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
