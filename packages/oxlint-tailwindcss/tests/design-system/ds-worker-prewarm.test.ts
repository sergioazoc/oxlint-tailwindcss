/**
 * Starting a service worker ahead of its first request. The canonicalize
 * service's first request used to pay the worker's spawn, its design-system
 * load and Tailwind's per-`rem` canonicalization init (~1.2 s) in series, after
 * the precompute; `prewarm` starts all of it in the background, and the first
 * request only waits for whatever is left.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { DesignSystemWorker, makeWorkerScript } from '../../src/design-system/ds-worker'
import { SortServiceError } from '../../src/utils/fatal'
import {
  canonicalizeClassesSync,
  prewarmCanonicalize,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'

const CSS = resolve(__dirname, '../fixtures/default.css')
// Echo what the warm-up saw (or `cold`), so a test can tell whether it ran.
const ECHO = "(ds, req) => globalThis.__warm ?? 'cold'"

let worker: DesignSystemWorker<unknown, unknown> | null = null
afterEach(() => {
  worker?.reset()
  worker = null
  resetCanonicalizeService()
})

const make = (warmup: string) =>
  new DesignSystemWorker({
    workerScript: makeWorkerScript(ECHO, '', warmup),
    serviceName: 'canonicalize',
  })

describe('prewarm', () => {
  it('runs the warm-up with the data given, then serves requests', () => {
    worker = make('(ds, warm) => { globalThis.__warm = warm }')
    worker.prewarm(CSS, { rem: 16 })
    expect(worker.callSync(CSS, 'x')).toEqual({ rem: 16 })
  })

  it('without a prewarm, no warm-up runs', () => {
    worker = make('(ds, warm) => { globalThis.__warm = warm }')
    expect(worker.callSync(CSS, 'x')).toBe('cold')
  })

  it('starts one worker per entry point, however many times it is asked', () => {
    worker = make('(ds, warm) => { globalThis.__warm = warm }')
    worker.prewarm(CSS, 'first')
    worker.prewarm(CSS, 'second')
    expect(worker.callSync(CSS, 'x')).toBe('first')
  })

  it('a warm-up that throws still leaves a working worker', () => {
    worker = make("(ds, warm) => { throw new Error('warm-up failed') }")
    worker.prewarm(CSS, 1)
    expect(worker.callSync(CSS, 'x')).toBe('cold')
  })

  it('never throws; a worker that cannot load reports on its first request', () => {
    worker = make('(ds, warm) => {}')
    const missing = resolve(__dirname, '../fixtures/does-not-exist.css')
    expect(() => worker!.prewarm(missing, 1)).not.toThrow()
    expect(() => worker!.callSync(missing, 'x')).toThrow(SortServiceError)
  })
})

describe('prewarmCanonicalize', () => {
  it('leaves the canonicalize service answering exactly as a cold one', () => {
    prewarmCanonicalize(CSS, 16)
    const warm = canonicalizeClassesSync(CSS, ['p-[16px]', 'w-[1px]'], 16)
    resetCanonicalizeService()
    const cold = canonicalizeClassesSync(CSS, ['p-[16px]', 'w-[1px]'], 16)
    expect(warm).toEqual(cold)
    expect(warm[0].canonical).toBe('p-4')
  })
})
