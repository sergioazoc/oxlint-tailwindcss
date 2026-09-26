/**
 * Phase 1 (v1.1) verification: the sort and canonicalize worker services
 * are fail-loud — failures throw `SortServiceError` instead of degrading
 * silently to a heuristic fallback. Callers in DS-dependent rules wrap
 * via `safeGetDS` so the failure surfaces as a single
 * `designSystemUnavailable` diagnostic.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { resolve } from 'node:path'
import {
  canonicalizeClassesSync,
  resetCanonicalizeService,
  CANONICALIZE_HANDLER,
} from '../../src/design-system/canonicalize-service'
import {
  sortClassesSync,
  resetSortService,
  SORT_HANDLER,
} from '../../src/design-system/sort-service'
import {
  resolveDeclarationsSync,
  resetDeclarationService,
  validateClassesSync,
  DECLARATION_HANDLER,
} from '../../src/design-system/declaration-service'
import { DesignSystemWorker, makeWorkerScript } from '../../src/design-system/ds-worker'
import { DesignSystemCache } from '../../src/design-system/cache'
import { type PrecomputedData } from '../../src/design-system/sync-loader'
import { makeDeclarations } from '../utils/declarations'
import { DS_UNAVAILABLE_MESSAGE_ID, SortServiceError } from '../../src/utils/fatal'
import { noDarkWithoutLight } from '../../src/rules/no-dark-without-light'
import { noArbitraryValue } from '../../src/rules/no-arbitrary-value'
import { noDynamicClasses } from '../../src/rules/no-dynamic-classes'
import { noHardcodedColors } from '../../src/rules/no-hardcoded-colors'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'
import plugin from '../../src/index'

const NONEXISTENT_CSS = '/tmp/this-css-does-not-exist-for-fatal-test.css'

describe('sort service — fail-loud', () => {
  beforeEach(() => resetSortService())

  test('throws SortServiceError when the worker cannot load the CSS', () => {
    expect(() => sortClassesSync(NONEXISTENT_CSS, ['flex', 'p-2'])).toThrow(SortServiceError)
  })

  test('subsequent calls for the same path keep throwing (sticky)', () => {
    expect(() => sortClassesSync(NONEXISTENT_CSS, ['flex'])).toThrow(SortServiceError)
    // No retry cost — sticky lastError throws immediately.
    expect(() => sortClassesSync(NONEXISTENT_CSS, ['flex'])).toThrow(SortServiceError)
  })

  test('error carries a hint pointing the user at a remedy', () => {
    try {
      sortClassesSync(NONEXISTENT_CSS, ['flex'])
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SortServiceError)
      expect((err as SortServiceError).hint).toBeTruthy()
    }
  })
})

describe('canonicalize service — fail-loud', () => {
  beforeEach(() => resetCanonicalizeService())

  test('throws SortServiceError when the worker cannot load the CSS', () => {
    expect(() => canonicalizeClassesSync(NONEXISTENT_CSS, ['p-[2px]'], 16)).toThrow(
      SortServiceError,
    )
  })

  test('error carries a hint pointing the user at a remedy', () => {
    try {
      canonicalizeClassesSync(NONEXISTENT_CSS, ['p-[2px]'], 16)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SortServiceError)
      expect((err as SortServiceError).hint).toBeTruthy()
    }
  })
})

/**
 * The declaration service used to swallow its own failures.
 *
 * It returned "no information" instead of throwing, which was defensible while
 * `no-conflicting-classes` was the only caller — no declarations, no comparison,
 * no diagnostic. It stopped being defensible when `no-unknown-classes` started
 * asking it about VALIDITY: there, silence sends the rule back to the tolerant
 * heuristic, so a dead worker quietly reinstates the false negatives the service
 * exists to remove and the run still passes.
 */
describe('declaration service — fail-loud', () => {
  beforeEach(() => resetDeclarationService())

  function bareCache(): DesignSystemCache {
    const data: PrecomputedData = {
      validClasses: ['flex'],
      canonical: {},
      order: { flex: '100' },
      cssDeclarations: makeDeclarations({ flex: [['', 'display', 'flex']] }),
      variantOrder: {},
      componentClasses: [],
      arbitraryEquivalents: {},
      prefix: '',
    }
    return DesignSystemCache.fromPrecomputed(data)
  }

  test('resolveDeclarationsSync throws when the worker cannot load the CSS', () => {
    expect(() => resolveDeclarationsSync(NONEXISTENT_CSS, bareCache(), ['p-[5px]'])).toThrow(
      SortServiceError,
    )
  })

  test('validateClassesSync throws instead of answering "unknown"', () => {
    expect(() => validateClassesSync(NONEXISTENT_CSS, bareCache(), ['bg-red-5000'])).toThrow(
      SortServiceError,
    )
  })

  test('the error carries a hint, like the other two services', () => {
    try {
      validateClassesSync(NONEXISTENT_CSS, bareCache(), ['bg-red-5000'])
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SortServiceError)
      expect((err as SortServiceError).hint).toBeTruthy()
    }
  })

  test('the DS-dependent callers can surface it, and the DS-optional one cannot', () => {
    // Which posture each rule takes is not a matter of taste: a rule that may
    // report `designSystemUnavailable` declares that messageId, and one that may
    // not simply does not have it. oxlint rejects reporting an undeclared
    // messageId, so this is the guarantee itself, not a proxy for it.
    expect(noConflictingClasses.meta?.messages).toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
    expect(noUnknownClasses.meta?.messages).toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
    expect(noDarkWithoutLight.meta?.messages).not.toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
    expect(noArbitraryValue.meta?.messages).not.toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
    expect(noDynamicClasses.meta?.messages).not.toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
    expect(noHardcodedColors.meta?.messages).not.toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
  })

  test('the version guard reuses designSystemUnavailable — no rule declares an engine messageId', () => {
    // UnsupportedEngineError routes through the SAME messageId, so no rule needed
    // a new one. Lock it: no rule may introduce an engine-/unsupported-specific id.
    for (const [name, rule] of Object.entries(plugin.rules)) {
      const messages = (rule.meta?.messages ?? {}) as Record<string, unknown>
      for (const id of Object.keys(messages)) {
        expect(
          /engine|unsupported/i.test(id),
          `${name} declares unexpected messageId "${id}"`,
        ).toBe(false)
      }
    }
  })
})

/**
 * Issue #130. A per-REQUEST worker failure (the handler threw, the response
 * didn't fit the buffer, a timeout, a non-JSON reply) used to be stored as a
 * process-lifetime sticky error keyed by cssPath — exactly like an INIT failure.
 * That let one malformed/mid-typing arbitrary value permanently disable a rule
 * for the whole entry point until the editor's oxlint process restarted.
 *
 * The specific trigger is engine-version-dependent (Tailwind 4.3.3 does NOT
 * throw on `px-[calc(var(--a)+)]` — it echoes it back), so the sticky behavior
 * is exercised with a custom worker whose handler throws on a sentinel input.
 */
describe('per-request worker failure — retryable, not sticky (#130)', () => {
  const CSS = resolve(__dirname, '../fixtures/default.css')
  let worker: DesignSystemWorker<unknown, unknown> | null = null

  afterEach(() => {
    worker?.reset()
    worker = null
  })

  test('a per-request handler throw does not poison later valid calls', () => {
    worker = new DesignSystemWorker({
      // Load the real DS (so init succeeds), but throw on one sentinel request.
      workerScript: makeWorkerScript(
        "(ds, req) => { if (req === '__BOOM__') throw new Error('boom'); return req; }",
      ),
      serviceName: 'canonicalize',
    })

    // The handler throws → the worker replies with the 'null' sentinel → the
    // per-request null branch throws SortServiceError.
    expect(() => worker!.callSync(CSS, '__BOOM__')).toThrow(SortServiceError)

    // Regression: the SAME instance + SAME cssPath must retry (re-spawn) and
    // succeed. With the old sticky remember() this rethrew the error forever.
    expect(worker!.callSync(CSS, ['flex', 'p-2'])).toEqual(['flex', 'p-2'])
  })
})

/**
 * Issue #145. #130 made every per-request failure retryable — right for a
 * malformed input, wrong for a TIMEOUT: a machine slow enough to time out once
 * times out again, and `dropWorker` resets the DS to cold, so an unbounded retry
 * re-pays the full timeout on every remaining class list (O(files) — a CI run
 * went from ~90s to >10min). The fix BOUNDS the retrying: after a few
 * consecutive per-request failures for one entry point the error goes
 * SOFT-sticky (fast-fail), any success clears the budget, and the sticky expires
 * after a backoff window so a long-lived editor self-heals (never the #130
 * "dead until restart"). `requestTimeoutMs` / `maxConsecutiveRequestFailures`
 * are test seams so this doesn't wait the shipped 30s.
 */
describe('per-request worker failure — bounded, self-healing (#145)', () => {
  const CSS = resolve(__dirname, '../fixtures/default.css')
  let worker: DesignSystemWorker<unknown, unknown> | null = null

  afterEach(() => {
    worker?.reset()
    worker = null
    vi.useRealTimers()
  })

  test('stops paying the request timeout once the budget is spent', () => {
    worker = new DesignSystemWorker({
      // A handler that never replies stands in for one that is merely slow.
      workerScript: makeWorkerScript('(ds, req) => { while (true) {} }'),
      serviceName: 'canonicalize',
      requestTimeoutMs: 50,
      maxConsecutiveRequestFailures: 2,
    })

    // Each call within budget waits out the (short) timeout and re-spawns cold.
    for (let i = 0; i < 2; i++) {
      expect(() => worker!.callSync(CSS, ['flex'])).toThrow(SortServiceError)
    }

    // Budget spent → the next call must fast-fail via the soft sticky instead of
    // waiting out another timeout (+ cold re-spawn). Without the bound it would.
    const start = Date.now()
    expect(() => worker!.callSync(CSS, ['flex'])).toThrow(SortServiceError)
    expect(Date.now() - start).toBeLessThan(50)
  })

  test('a success between failures clears the budget', () => {
    worker = new DesignSystemWorker({
      // Throw on a sentinel (→ null branch), echo anything else back.
      workerScript: makeWorkerScript(
        "(ds, req) => { if (req === '__BOOM__') throw new Error('boom'); return req; }",
      ),
      serviceName: 'canonicalize',
      maxConsecutiveRequestFailures: 2,
    })

    // Two NON-consecutive failures (a success in between) must NOT trip the
    // budget — otherwise interleaved traffic would quietly reintroduce #130.
    expect(() => worker!.callSync(CSS, '__BOOM__')).toThrow(SortServiceError) // count → 1
    expect(worker!.callSync(CSS, ['flex'])).toEqual(['flex']) // success → count reset to 0
    expect(() => worker!.callSync(CSS, '__BOOM__')).toThrow(SortServiceError) // count → 1 (not 2)
    // Still healthy: not soft-sticky, so a valid call succeeds.
    expect(worker!.callSync(CSS, ['flex', 'p-2'])).toEqual(['flex', 'p-2'])
  })

  test('the soft sticky expires so a recovered machine self-heals', () => {
    vi.useFakeTimers()
    worker = new DesignSystemWorker({
      workerScript: makeWorkerScript(
        "(ds, req) => { if (req === '__BOOM__') throw new Error('boom'); return req; }",
      ),
      serviceName: 'canonicalize',
      maxConsecutiveRequestFailures: 1, // one failure → soft-sticky immediately
    })

    // Budget 1: the first failure makes it soft-sticky.
    expect(() => worker!.callSync(CSS, '__BOOM__')).toThrow(SortServiceError)
    // Within the backoff window a valid call still fast-fails (soft sticky).
    expect(() => worker!.callSync(CSS, ['flex'])).toThrow(SortServiceError)

    // Past the backoff window the sticky expires: the next call retries and
    // succeeds (a long-lived process is never dead until restart). Atomics.wait
    // uses real time, so faking Date only moves the backoff clock.
    vi.advanceTimersByTime(120_000)
    expect(worker!.callSync(CSS, ['flex', 'p-2'])).toEqual(['flex', 'p-2'])
  })
})

/**
 * Issue #130 (RC1). Each worker handler's risky `ds.*` call is guarded so a
 * Tailwind parser throw on a malformed arbitrary value degrades to a no-op
 * instead of the 'null' sentinel. Tested by evaluating the exact handler string
 * that ships (the same one hashed into the on-disk cache key) against a fake
 * design system whose method throws — no worker, no real Tailwind, so it is
 * deterministic on 4.3.3.
 */
describe('worker handlers — a throwing ds.* degrades to a no-op (#130)', () => {
  const unreached = () => {
    throw new Error('preamble helper should not be reached on the throw path')
  }

  test('canonicalize: a throwing canonicalizeCandidates leaves the class unchanged', async () => {
    // Async since R5: it may await a stock design system to explain a result.
    const handler = new Function(`return (${CANONICALIZE_HANDLER})`)() as (
      ds: unknown,
      req: unknown,
    ) => Promise<unknown>
    const ds = {
      canonicalizeCandidates() {
        throw new Error('boom')
      },
      candidatesToCss() {
        throw new Error('boom')
      },
    }
    expect(await handler(ds, { classes: ['px-[calc(var(--a)+)]'] })).toEqual([
      { canonical: 'px-[calc(var(--a)+)]', safe: true },
    ])
  })

  test('sort: a throwing getClassOrder leaves the input order unchanged', () => {
    const handler = new Function(`return (${SORT_HANDLER})`)() as (
      ds: unknown,
      classes: string[],
    ) => string[]
    const ds = {
      getClassOrder() {
        throw new Error('boom')
      },
    }
    expect(handler(ds, ['flex', 'p-2'])).toEqual(['flex', 'p-2'])
  })

  test('declaration: a throwing class is omitted, a falsy sibling stays invalid', () => {
    const handler = new Function(
      'walkDeclarations',
      'scanVarReads',
      'isPureVarRead',
      `return (${DECLARATION_HANDLER})`,
    )(unreached, unreached, unreached) as (ds: unknown, req: unknown) => unknown
    const ds = {
      theme: { prefix: '' },
      candidatesToCss(arr: string[]) {
        if (arr[0].includes('calc')) throw new Error('boom')
        return [''] // compiles to nothing → invalid
      },
    }
    // The malformed class is omitted (so no-unknown-classes stays lenient); the
    // real typo `bg-red-5000` is still flagged invalid instead of being masked.
    expect(handler(ds, { classes: ['bg-red-5000', 'px-[calc(var(--a)+)]'] })).toEqual({
      decls: {},
      values: {},
      invalid: ['bg-red-5000'],
    })
  })
})
