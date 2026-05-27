import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { splitClasses } from '../../src/utils/class-splitter'
import { roundRemValue } from '../../src/utils/floating-point'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('Regression tests', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  describe('class-splitter edge cases', () => {
    it('handles arbitrary values with colons', () => {
      const result = splitClasses('grid-cols-[1fr_2fr] bg-[url("https://example.com")]')
      expect(result).toEqual(['grid-cols-[1fr_2fr]', 'bg-[url("https://example.com")]'])
    })

    it('handles arbitrary variants with brackets', () => {
      const result = splitClasses('[&>svg]:w-4 [&:hover]:bg-blue-500')
      expect(result).toEqual(['[&>svg]:w-4', '[&:hover]:bg-blue-500'])
    })

    it('handles empty and whitespace-only strings', () => {
      expect(splitClasses('')).toEqual([])
      expect(splitClasses('   ')).toEqual([])
    })
  })

  describe('floating-point regression (better-tailwindcss#320)', () => {
    it('rounds floating-point artifacts in rem values', () => {
      // JS floating point: 0.1 + 0.2 = 0.30000000000000004
      expect(roundRemValue('p-[0.30000000000000004rem]')).toBe('p-[0.3rem]')
      expect(roundRemValue('m-[1.0000000000000002rem]')).toBe('m-[1rem]')
    })

    it('preserves correct values', () => {
      expect(roundRemValue('p-[0.5rem]')).toBe('p-[0.5rem]')
      expect(roundRemValue('m-[1.25rem]')).toBe('m-[1.25rem]')
    })

    it('handles em and px units', () => {
      expect(roundRemValue('text-[0.87500000000001em]')).toBe('text-[0.875em]')
      expect(roundRemValue('w-[100.0000000001px]')).toBe('w-[100px]')
    })
  })

  describe('design system cache correctness', () => {
    it('arbitrary values are accepted as valid', () => {
      const result = getLoadedDesignSystem(ENTRY_POINT)!
      const { cache } = result
      expect(cache.isValid('bg-[#ff0000]')).toBe(true)
      expect(cache.isValid('w-[calc(100%-2rem)]')).toBe(true)
      expect(cache.isValid('hover:bg-[#ff0000]')).toBe(true)
    })

    it('variant-prefixed classes are valid', () => {
      const result = getLoadedDesignSystem(ENTRY_POINT)!
      const { cache } = result
      expect(cache.isValid('hover:flex')).toBe(true)
      expect(cache.isValid('dark:bg-gray-900')).toBe(true)
      expect(cache.isValid('sm:hidden')).toBe(true)
      expect(cache.isValid('focus:ring-2')).toBe(true)
    })

    it('stacked variants are valid', () => {
      const result = getLoadedDesignSystem(ENTRY_POINT)!
      const { cache } = result
      expect(cache.isValid('dark:hover:bg-gray-800')).toBe(true)
      expect(cache.isValid('sm:dark:text-white')).toBe(true)
    })

    it('important modifier is handled by the rule, not cache', () => {
      const result = getLoadedDesignSystem(ENTRY_POINT)!
      const { cache } = result
      // Cache receives class WITH ! stripped by the rule
      expect(cache.isValid('flex')).toBe(true)
    })

    it('negative values in getClassList work', () => {
      const result = getLoadedDesignSystem(ENTRY_POINT)!
      const { cache } = result
      // Negative classes like -m-4 should be in the class list
      expect(cache.isValid('-m-4')).toBe(true)
      expect(cache.isValid('-translate-x-1')).toBe(true)
    })

    it('order data exists for common classes', () => {
      const result = getLoadedDesignSystem(ENTRY_POINT)!
      const { cache } = result
      // Layout classes should come before typography
      const flexOrder = cache.getOrder('flex')
      const textOrder = cache.getOrder('text-red-500')
      expect(flexOrder).not.toBeNull()
      expect(textOrder).not.toBeNull()
    })
  })
})
