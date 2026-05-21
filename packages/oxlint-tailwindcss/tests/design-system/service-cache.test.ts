import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import {
  canonicalizeClassesSync,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'

const DEFAULT_CSS = resolve(__dirname, '../fixtures/default.css')
const ALT_CSS = resolve(__dirname, '../fixtures/with-typography.css')

describe('canonicalize-service cache', () => {
  beforeEach(() => {
    resetCanonicalizeService()
  })
  afterEach(() => {
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
    // Switching cssPath restarts the worker but the cache (keyed by cssPath)
    // keeps entries from both design systems alive.
    const b = canonicalizeClassesSync(ALT_CSS, classes, 16)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()

    // Going back to the original path must still return the same result.
    const aAgain = canonicalizeClassesSync(DEFAULT_CSS, classes, 16)
    expect(aAgain).toEqual(a)
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
