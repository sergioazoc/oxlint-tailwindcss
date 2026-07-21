import { afterAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import {
  canonicalizeClassesSync,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'

const DEFAULT_CSS = resolve(__dirname, '../fixtures/default.css')
const ALT_CSS = resolve(__dirname, '../fixtures/with-typography.css')

// Resetting the service tears down the worker; the next call re-loads the
// design system in-thread (~2.5s). A blanket beforeEach/afterEach reset paid
// that cost on EVERY test. Instead we share one warm worker across tests and
// reset only where the test's meaning demands a cold worker (the "first call is
// slow" timing test and the explicit "reset clears" test). Vitest runs tests in
// declaration order within a file, so the shared state is deterministic.
describe('canonicalize-service cache', () => {
  afterAll(() => {
    resetCanonicalizeService()
  })

  it('returns output with same length as input (regression for dedup bug)', () => {
    // canonicalizeCandidates deduplicates internally. Prior implementation
    // passed the whole array in one call, which truncated output for inputs
    // with duplicates. Output must be same length/order as input.
    const input = ['p-[1rem]', 'p-[1rem]', 'flex']
    const result = canonicalizeClassesSync(DEFAULT_CSS, input, 16)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(input.length)
  })

  it('second call with the same class is much faster than the first', () => {
    // Needs a cold worker so the first call pays the init cost we're comparing.
    resetCanonicalizeService()
    const classes = ['p-[16px]', 'm-[8px]', 'flex', 'bg-[#3b82f6]']

    const t1 = performance.now()
    const first = canonicalizeClassesSync(DEFAULT_CSS, classes, 16)
    const firstElapsed = performance.now() - t1
    expect(first).not.toBeNull()

    const t2 = performance.now()
    const second = canonicalizeClassesSync(DEFAULT_CSS, classes, 16)
    const secondElapsed = performance.now() - t2
    expect(second).toEqual(first)

    // Cache hit should be at least 10x faster than the initial worker round-trip.
    expect(secondElapsed * 10).toBeLessThan(firstElapsed)
  })

  it('different rem values do not collide in the cache', () => {
    const classes = ['p-[16px]']
    const r16 = canonicalizeClassesSync(DEFAULT_CSS, classes, 16)
    const r10 = canonicalizeClassesSync(DEFAULT_CSS, classes, 10)
    expect(r16).not.toBeNull()
    expect(r10).not.toBeNull()
    expect(r16).toHaveLength(1)
    expect(r10).toHaveLength(1)
  })

  it('different cssPaths do not collide in the cache', () => {
    const classes = ['flex']
    const a = canonicalizeClassesSync(DEFAULT_CSS, classes, 16)
    // #77: switching cssPath no longer tears down the worker — the service now
    // keeps one warm worker per cssPath (LRU-bounded) — and the cache (keyed by
    // cssPath) keeps entries from both design systems alive.
    const b = canonicalizeClassesSync(ALT_CSS, classes, 16)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()

    // Going back to the original path must still return the same result.
    const aAgain = canonicalizeClassesSync(DEFAULT_CSS, classes, 16)
    expect(aAgain).toEqual(a)
  })

  it('keeps multiple cssPaths warm across interleaved calls (#77)', () => {
    // Monorepo pattern: oxlint feeds files from two packages in arbitrary
    // order, so the service sees the two entry points interleaved. Each call
    // uses a DISTINCT arbitrary value (cache miss → real worker round-trip),
    // so this exercises the per-cssPath worker map, not just the class cache.
    // Before #77 this thrashed a singleton worker; it must now stay correct.
    const results: Array<{ canonical: string }> = []
    for (let i = 0; i < 4; i++) {
      const [ra] = canonicalizeClassesSync(DEFAULT_CSS, [`p-[${i + 1}px]`], 16)
      const [rb] = canonicalizeClassesSync(ALT_CSS, [`m-[${i + 1}px]`], 16)
      expect(ra.canonical).toBeTypeOf('string')
      expect(rb.canonical).toBeTypeOf('string')
      results.push(ra, rb)
    }
    expect(results).toHaveLength(8)
    // A previously-seen class on the first path is still served correctly after
    // visiting the other path repeatedly (worker + cache both survived).
    const [again] = canonicalizeClassesSync(DEFAULT_CSS, ['p-[1px]'], 16)
    expect(again.canonical).toBe(results[0].canonical)
  })

  it('reset clears cached entries (new call takes worker path again)', () => {
    const classes = ['p-[16px]']
    canonicalizeClassesSync(DEFAULT_CSS, classes, 16)

    resetCanonicalizeService()

    // After reset the first call must reinitialize the worker and still succeed.
    const result = canonicalizeClassesSync(DEFAULT_CSS, classes, 16)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
  })

  it('mixed hits and misses return correct result in input order', () => {
    const warm = ['p-[16px]', 'flex']
    canonicalizeClassesSync(DEFAULT_CSS, warm, 16)

    const mixed = ['flex', 'bg-[#ff0000]', 'p-[16px]', 'm-[4px]']
    const result = canonicalizeClassesSync(DEFAULT_CSS, mixed, 16)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(mixed.length)

    // The warmed entries at positions 0 and 2 must match the first-call results.
    const warmAgain = canonicalizeClassesSync(DEFAULT_CSS, warm, 16)!
    expect(result![0]).toBe(warmAgain[1]) // 'flex'
    expect(result![2]).toBe(warmAgain[0]) // 'p-[16px]'
  })
})
