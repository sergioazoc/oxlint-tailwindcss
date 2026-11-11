/**
 * The request/response handshake waits on its flag, not on the wake-up (#251).
 *
 * `Atomics.store` and `Atomics.notify` are two steps. A thread descheduled
 * between them delivers its `notify` late, and a late `notify` wakes whoever is
 * waiting on that index by then: the next wait, whose flag is still 0. Under
 * heavy CPU load that made the host read the shared buffer before the worker
 * had answered and find its own request there.
 *
 * The window is a few microseconds wide, so each test delivers such a wake-up
 * by hand instead of waiting for the scheduler to produce one.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { DesignSystemWorker, makeWorkerScript } from '../../src/design-system/ds-worker'

const CSS = resolve(__dirname, '../fixtures/default.css')

const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4))
const sleep = (ms: number) => void Atomics.wait(SLEEP_BUFFER, 0, 0, ms)

let worker: DesignSystemWorker<unknown, unknown> | null = null
afterEach(() => {
  worker?.reset()
  worker = null
})

describe('a wake-up that arrives without its flag', () => {
  it('host: keeps waiting for the response instead of reading its own request back', () => {
    // The handler runs inside the worker's `main`, so it can reach `control`.
    // While the host waits for the answer, it notifies the response index with
    // the flag still 0, then answers for real a little later.
    worker = new DesignSystemWorker({
      workerScript: makeWorkerScript(`async (ds, req) => {
        await new Promise((done) => setTimeout(done, 30));
        const woken = Atomics.notify(control, 1);
        await new Promise((done) => setTimeout(done, 30));
        return { answer: req, woken };
      }`),
      serviceName: 'canonicalize',
    })

    // `woken: 1`: the host really was parked when the stray wake-up came.
    expect(worker.callSync(CSS, 'x')).toEqual({ answer: 'x', woken: 1 })
  })

  it('worker: goes back to waiting instead of serving a request nobody sent', () => {
    worker = new DesignSystemWorker({
      workerScript: makeWorkerScript('(ds, req) => ({ answer: req })'),
      serviceName: 'canonicalize',
    })
    expect(worker.callSync(CSS, 'a')).toEqual({ answer: 'a' })

    // The worker is idle now, waiting for the next request. Wake it with the
    // request flag still 0 (retrying until it has parked again after `a`).
    const internals = worker as unknown as {
      workers: Map<string, { controlArray: Int32Array }>
    }
    const { controlArray } = internals.workers.get(CSS)!
    let woken = 0
    for (let i = 0; i < 200 && woken === 0; i++) {
      woken = Atomics.notify(controlArray, 0)
      if (woken === 0) sleep(5)
    }
    expect(woken).toBe(1)

    // Give it time to act on the wake-up, if it is going to. It must not have
    // "answered" whatever was left in the buffer, and the next request gets
    // its own answer.
    sleep(50)
    expect(Atomics.load(controlArray, 1)).toBe(0)
    expect(worker.callSync(CSS, 'b')).toEqual({ answer: 'b' })
  })
})
