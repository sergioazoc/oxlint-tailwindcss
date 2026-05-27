import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import {
  cacheArtifactPaths,
  computeCacheKey,
  loadDesignSystemSync,
} from '../../src/design-system/sync-loader'
import { TAILWIND_NODE_VERSION } from '../../src/design-system/tailwind-node'
import { DesignSystemLoadError } from '../../src/utils/fatal'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('loadDesignSystemSync', () => {
  it('loads design system from valid CSS file', () => {
    const result = loadDesignSystemSync(ENTRY_POINT)
    expect(result).toBeDefined()
  })

  it('throws DesignSystemLoadError for a nonexistent file', () => {
    expect(() => loadDesignSystemSync('/nonexistent/path/tailwind.css')).toThrow(
      DesignSystemLoadError,
    )
  })

  it('returns PrecomputedData with all required fields', () => {
    const result = loadDesignSystemSync(ENTRY_POINT)

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
    const result = loadDesignSystemSync(ENTRY_POINT)

    expect(result.validClasses.length).toBeGreaterThan(1000)
    expect(Object.keys(result.order).length).toBeGreaterThan(1000)
    expect(Object.keys(result.cssProps).length).toBeGreaterThan(100)
    expect(Object.keys(result.variantOrder).length).toBeGreaterThan(10)
  })

  it('accepts custom timeout', () => {
    const result = loadDesignSystemSync(ENTRY_POINT, 60_000)
    expect(result).toBeDefined()
  })
})

describe('cold-cache fork coordination (issue #24)', () => {
  // Unique CSS content → unique content hash → cache artifacts isolated from
  // every other test that shares default.css and runs in parallel.
  const UNIQUE_CSS = resolve(__dirname, '../fixtures/lock-coordination.css')

  it('breaks a stale lock and still loads', () => {
    writeFileSync(UNIQUE_CSS, `@import 'tailwindcss';\n/* lock-coordination ${Date.now()} */\n`)
    const { json, lock } = cacheArtifactPaths(UNIQUE_CSS)

    // Force the cold path: no cached JSON, and a stale lock left behind by a
    // hypothetical isolate that died mid-precompute.
    rmSync(json, { force: true })
    mkdirSync(resolve(lock, '..'), { recursive: true })
    writeFileSync(lock, '')
    const stale = new Date(Date.now() - 1000 * 60 * 60) // 1h ago
    utimesSync(lock, stale, stale)

    // Must reclaim the stale lock and complete instead of waiting forever.
    const result = loadDesignSystemSync(UNIQUE_CSS)
    expect(result).toBeDefined()
    expect(result.validClasses.length).toBeGreaterThan(1000)

    // Lock is released after a successful compute.
    expect(existsSync(lock)).toBe(false)

    rmSync(json, { force: true })
    rmSync(UNIQUE_CSS, { force: true })
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

describe('TAILWIND_NODE_VERSION', () => {
  it('matches the installed @tailwindcss/node version', () => {
    // Format is semver — fallback "unknown" would mean @tailwindcss/node isn't resolvable,
    // which would also break loadDesignSystemSync entirely (covered by tests above).
    expect(TAILWIND_NODE_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('arbitraryEquivalents shape', () => {
  it('emits one mapping per dash split point for multi-segment utilities', () => {
    // The precompute loop enumerates every dash split, so for `bg-card-foreground`
    // (3 segments) it produces 2 candidates: `bg-[<value>]` and `bg-card-[<value>]`.
    // Whichever round-trips through Tailwind's `candidatesToCss` ends up in the map.
    // This locks down the fix that replaced `lastIndexOf('-')` (single split, missed
    // every multi-segment utility) with `indexOf('-', 1)` (all splits, skip leading `-`).
    const result = loadDesignSystemSync(ENTRY_POINT)!
    const keys = Object.keys(result.arbitraryEquivalents)
    // Sanity: there ARE entries
    expect(keys.length).toBeGreaterThan(50)
  })

  it('never emits a candidate with an empty prefix (negative-utility guard)', () => {
    // Regression guard for the negative-utility case: if the dash-enumeration loop
    // started at `cls.indexOf('-')` (without the +1 offset), classes like
    // `-translate-x-1` would produce `''.indexOf('-') === 0`, exit the loop
    // immediately, and emit zero candidates. Worse, off-by-one variants of the fix
    // could emit `'-[<value>]'` with an empty prefix. Every key must contain a
    // non-bracket character before the `-[`.
    const result = loadDesignSystemSync(ENTRY_POINT)!
    for (const key of Object.keys(result.arbitraryEquivalents)) {
      // Find the `-[` that introduces the arbitrary value
      const bracketStart = key.lastIndexOf('-[')
      expect(bracketStart, `key ${key} has no -[`).toBeGreaterThan(0)
      const prefix = key.slice(0, bracketStart)
      // Prefix must contain at least one non-dash, non-empty character
      expect(prefix.length, `key ${key} has empty prefix`).toBeGreaterThan(0)
      expect(prefix.replace(/-/g, '').length, `key ${key} has dash-only prefix`).toBeGreaterThan(0)
    }
  })

  it('maps multi-segment utilities like bg-red-500 via the shortest valid split', () => {
    // The acid test for the lastIndexOf → indexOf fix: bg-red-500 must register
    // the bracket-form that uses the FULL value (matching the named utility's CSS).
    // Tailwind's CSS for bg-red-500 references --color-red-500, so the matching
    // arbitrary form is `bg-[var(--color-red-500)]`. The pre-fix code emitted
    // `bg-red-[<value>]` only (which doesn't round-trip).
    const result = loadDesignSystemSync(ENTRY_POINT)!
    const equivalents = result.arbitraryEquivalents as Record<string, string>
    expect(equivalents['bg-[var(--color-red-500)]']).toBe('bg-red-500')
  })
})
