import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('Performance', () => {
  it('loads design system in under 5 seconds', () => {
    resetDesignSystem()
    const start = performance.now()
    const result = getLoadedDesignSystem(ENTRY_POINT)
    const elapsed = performance.now() - start
    expect(result).not.toBeNull()
    const limit = process.env.CI ? 30_000 : 5_000
    expect(elapsed).toBeLessThan(limit)
    console.log(`Design system load: ${elapsed.toFixed(0)}ms`)
  })

  it('subsequent loads use cache (under 5ms)', () => {
    // Singleton should be cached
    const start = performance.now()
    const result = getLoadedDesignSystem(ENTRY_POINT)
    const elapsed = performance.now() - start
    expect(result).not.toBeNull()
    expect(elapsed).toBeLessThan(5)
    console.log(`Cached load: ${elapsed.toFixed(2)}ms`)
  })

  it('isValid is fast for 1000 lookups', () => {
    const result = getLoadedDesignSystem(ENTRY_POINT)!
    const { cache } = result

    const classes = cache.validClasses.slice(0, 1000)
    const start = performance.now()
    for (const cls of classes) {
      cache.isValid(cls)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(50)
    console.log(`1000 isValid lookups: ${elapsed.toFixed(2)}ms`)
  })

  it('getClassOrder is fast for 100 classes', () => {
    const result = getLoadedDesignSystem(ENTRY_POINT)!
    const { cache } = result

    const classes = cache.validClasses.slice(0, 100)
    const start = performance.now()
    cache.getClassOrder(classes)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(10)
    console.log(`100-class getClassOrder: ${elapsed.toFixed(2)}ms`)
  })
})
