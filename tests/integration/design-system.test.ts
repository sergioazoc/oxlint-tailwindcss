import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { resolve } from 'node:path'
import {
  getLoadedDesignSystem,
  resetDesignSystem,
  type LoadResult,
} from '../../src/design-system/loader'
import { DesignSystemCache } from '../../src/design-system/cache'

const FIXTURE_PATH = resolve(__dirname, '../fixtures/default.css')

describe('Design System Integration', () => {
  let result: LoadResult | null

  beforeAll(() => {
    resetDesignSystem()
    result = getLoadedDesignSystem(FIXTURE_PATH)
  })

  afterAll(() => {
    resetDesignSystem()
  })

  it('loads the design system from a valid CSS file', () => {
    expect(result).not.toBeNull()
    expect(result!.cache).toBeInstanceOf(DesignSystemCache)
  })

  it('validates known Tailwind classes', () => {
    const { cache } = result!
    expect(cache.isValid('flex')).toBe(true)
    expect(cache.isValid('items-center')).toBe(true)
    expect(cache.isValid('bg-blue-500')).toBe(true)
    expect(cache.isValid('p-4')).toBe(true)
  })

  it('validates variant-prefixed classes', () => {
    const { cache } = result!
    // Variants should resolve to a valid base utility
    expect(cache.isValid('hover:bg-blue-700')).toBe(true)
    expect(cache.isValid('dark:text-white')).toBe(true)
    expect(cache.isValid('sm:flex')).toBe(true)
  })

  it('validates arbitrary values', () => {
    const { cache } = result!
    expect(cache.isValid('bg-[#123]')).toBe(true)
    expect(cache.isValid('w-[200px]')).toBe(true)
    expect(cache.isValid('[&>svg]:w-4')).toBe(true)
  })

  it('rejects made-up classes', () => {
    const { cache } = result!
    expect(cache.isValid('itms-center')).toBe(false)
    expect(cache.isValid('fex')).toBe(false)
    expect(cache.isValid('not-a-real-class')).toBe(false)
  })

  it('gets the class order', () => {
    const { cache } = result!
    const orderFlex = cache.getOrder('flex')
    const orderP4 = cache.getOrder('p-4')
    expect(orderFlex).not.toBeNull()
    expect(orderP4).not.toBeNull()
  })

  it('extracts CSS properties from a class', () => {
    const { cache } = result!
    const propsP4 = cache.getCssProperties('p-4')
    expect(propsP4).toContain('padding')

    const propsFlex = cache.getCssProperties('flex')
    expect(propsFlex).toContain('display')
  })

  it('canonicalizes classes', () => {
    const { cache } = result!
    // -m-0 is in classList and canonicalizes to m-0 (removes unnecessary negative on zero)
    const canonical = cache.canonicalize('-m-0')
    expect(canonical).toBe('m-0')
  })

  it('canonicalizes variant-prefixed classes', () => {
    const { cache } = result!
    const canonical = cache.canonicalize('hover:-m-0')
    expect(canonical).toBe('hover:m-0')
  })

  it('reuses singleton in subsequent calls', () => {
    const result2 = getLoadedDesignSystem(FIXTURE_PATH)
    expect(result2).not.toBeNull()
    expect(result2!.cache).toBe(result!.cache) // same reference
  })

  it('provides valid class list for suggestions', () => {
    const { cache } = result!
    expect(cache.validClasses.length).toBeGreaterThan(0)
    expect(cache.validClasses).toContain('flex')
    expect(cache.validClasses).toContain('items-center')
  })

  it('batch class order works', () => {
    const { cache } = result!
    const ordered = cache.getClassOrder(['flex', 'p-4', 'text-red-500'])
    expect(ordered).toHaveLength(3)
    expect(ordered[0][0]).toBe('flex')
    expect(ordered[1][0]).toBe('p-4')
    expect(ordered[2][0]).toBe('text-red-500')
    // All should have non-null order
    for (const [, order] of ordered) {
      expect(order).not.toBeNull()
    }
  })
})
