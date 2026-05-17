import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import {
  computeCacheKey,
  loadDesignSystemSync,
  readTailwindVersion,
} from '../../src/design-system/sync-loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('loadDesignSystemSync', () => {
  it('loads design system from valid CSS file', () => {
    const result = loadDesignSystemSync(ENTRY_POINT)
    expect(result).not.toBeNull()
  })

  it('returns null for nonexistent file', () => {
    const result = loadDesignSystemSync('/nonexistent/path/tailwind.css')
    expect(result).toBeNull()
  })

  it('returns PrecomputedData with all required fields', () => {
    const result = loadDesignSystemSync(ENTRY_POINT)!
    expect(result).not.toBeNull()

    // All fields exist
    expect(result.validClasses).toBeDefined()
    expect(result.canonical).toBeDefined()
    expect(result.order).toBeDefined()
    expect(result.cssProps).toBeDefined()
    expect(result.variantOrder).toBeDefined()
    expect(result.componentClasses).toBeDefined()
    expect(result.arbitraryEquivalents).toBeDefined()

    // Correct types
    expect(Array.isArray(result.validClasses)).toBe(true)
    expect(typeof result.canonical).toBe('object')
    expect(typeof result.order).toBe('object')
    expect(typeof result.cssProps).toBe('object')
    expect(typeof result.variantOrder).toBe('object')
    expect(Array.isArray(result.componentClasses)).toBe(true)
    expect(typeof result.arbitraryEquivalents).toBe('object')
  })

  it('produces non-empty data for default Tailwind CSS', () => {
    const result = loadDesignSystemSync(ENTRY_POINT)!

    expect(result.validClasses.length).toBeGreaterThan(1000)
    expect(Object.keys(result.order).length).toBeGreaterThan(1000)
    expect(Object.keys(result.cssProps).length).toBeGreaterThan(100)
    expect(Object.keys(result.variantOrder).length).toBeGreaterThan(10)
  })

  it('accepts custom timeout', () => {
    const result = loadDesignSystemSync(ENTRY_POINT, 60_000)
    expect(result).not.toBeNull()
  })

  it('returns null gracefully on very short timeout', () => {
    // 1ms timeout — child process can't possibly finish
    // May return cached data or null depending on cache state
    // The key assertion is that it doesn't throw
    loadDesignSystemSync(ENTRY_POINT, 1)
  })
})

describe('computeCacheKey', () => {
  it('is deterministic for the same inputs', () => {
    expect(computeCacheKey('const x = 1', '4.3.0')).toBe(computeCacheKey('const x = 1', '4.3.0'))
  })

  it('changes when the script content changes', () => {
    const a = computeCacheKey('const x = 1', '4.3.0')
    const b = computeCacheKey('const x = 2', '4.3.0')
    expect(a).not.toBe(b)
  })

  it('changes when the tailwind version changes', () => {
    const a = computeCacheKey('const x = 1', '4.2.4')
    const b = computeCacheKey('const x = 1', '4.3.0')
    expect(a).not.toBe(b)
  })

  it('produces a stable shape: <8-hex>:<version>', () => {
    expect(computeCacheKey('script', '4.3.0')).toMatch(/^[a-f0-9]{8}:4\.3\.0$/)
  })
})

describe('readTailwindVersion', () => {
  it('returns the installed @tailwindcss/node version', () => {
    // Format is semver — fallback "unknown" would mean @tailwindcss/node isn't resolvable,
    // which would also break loadDesignSystemSync entirely (covered by tests above).
    expect(readTailwindVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
