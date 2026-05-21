import { describe, expect, it } from 'vitest'
import {
  parseClass,
  extractVariants,
  extractUtility,
  getVariantPrefix,
  hasArbitraryValue,
  getArbitraryValue,
} from '../../src/utils/class-parser'

describe('extractVariants', () => {
  it('returns empty array for no variants', () => {
    expect(extractVariants('flex')).toEqual([])
    expect(extractVariants('bg-blue-500')).toEqual([])
  })

  it('extracts simple variants', () => {
    expect(extractVariants('hover:flex')).toEqual(['hover'])
    expect(extractVariants('dark:hover:flex')).toEqual(['dark', 'hover'])
  })

  it('handles arbitrary variants', () => {
    expect(extractVariants('[&>svg]:w-4')).toEqual(['[&>svg]'])
    expect(extractVariants('[&>svg]:hover:w-4')).toEqual(['[&>svg]', 'hover'])
  })

  it('handles nested brackets in variants', () => {
    expect(extractVariants('[&[data-active="true"]]:flex')).toEqual(['[&[data-active="true"]]'])
  })
})

describe('extractUtility', () => {
  it('returns the full class when no variants', () => {
    expect(extractUtility('flex')).toBe('flex')
    expect(extractUtility('bg-blue-500')).toBe('bg-blue-500')
  })

  it('strips variants', () => {
    expect(extractUtility('hover:flex')).toBe('flex')
    expect(extractUtility('dark:hover:bg-blue-500')).toBe('bg-blue-500')
  })

  it('handles arbitrary variants', () => {
    expect(extractUtility('[&>svg]:w-4')).toBe('w-4')
    expect(extractUtility('[&>svg]:hover:w-4')).toBe('w-4')
  })
})

describe('getVariantPrefix', () => {
  it('returns empty string for no variants', () => {
    expect(getVariantPrefix('flex')).toBe('')
  })

  it('returns variant prefix with colon', () => {
    expect(getVariantPrefix('hover:flex')).toBe('hover:')
    expect(getVariantPrefix('dark:hover:flex')).toBe('dark:hover:')
  })

  it('handles arbitrary variants', () => {
    expect(getVariantPrefix('[&>svg]:w-4')).toBe('[&>svg]:')
  })
})

describe('hasArbitraryValue', () => {
  it('returns false for regular classes', () => {
    expect(hasArbitraryValue('flex')).toBe(false)
    expect(hasArbitraryValue('bg-blue-500')).toBe(false)
  })

  it('returns true for arbitrary values', () => {
    expect(hasArbitraryValue('w-[200px]')).toBe(true)
    expect(hasArbitraryValue('bg-[#ff0000]')).toBe(true)
  })

  it('returns false for arbitrary variants without arbitrary value', () => {
    expect(hasArbitraryValue('[&>svg]:w-4')).toBe(false)
  })

  it('returns true for arbitrary variant + arbitrary value', () => {
    expect(hasArbitraryValue('[&>svg]:w-[200px]')).toBe(true)
  })
})

describe('getArbitraryValue', () => {
  it('returns null for regular classes', () => {
    expect(getArbitraryValue('flex')).toBeNull()
    expect(getArbitraryValue('bg-blue-500')).toBeNull()
  })

  it('returns the arbitrary value', () => {
    expect(getArbitraryValue('w-[200px]')).toBe('200px')
    expect(getArbitraryValue('bg-[#ff0000]')).toBe('#ff0000')
    expect(getArbitraryValue('text-[rgb(255,0,0)]')).toBe('rgb(255,0,0)')
  })

  it('returns null for arbitrary variants without value', () => {
    expect(getArbitraryValue('[&>svg]:w-4')).toBeNull()
  })
})

describe('parseClass', () => {
  it('parses a simple class', () => {
    const result = parseClass('flex')
    expect(result).toEqual({
      variants: [],
      variantPrefix: '',
      important: false,
      importantPosition: null,
      negative: false,
      utility: 'flex',
      arbitraryValue: null,
    })
  })

  it('parses a class with variants', () => {
    const result = parseClass('dark:hover:bg-blue-500')
    expect(result.variants).toEqual(['dark', 'hover'])
    expect(result.variantPrefix).toBe('dark:hover:')
    expect(result.utility).toBe('bg-blue-500')
  })

  it('parses important prefix', () => {
    const result = parseClass('!font-bold')
    expect(result.important).toBe(true)
    expect(result.importantPosition).toBe('prefix')
    expect(result.utility).toBe('font-bold')
  })

  it('parses important suffix', () => {
    const result = parseClass('font-bold!')
    expect(result.important).toBe(true)
    expect(result.importantPosition).toBe('suffix')
    expect(result.utility).toBe('font-bold')
  })

  it('parses important with variants', () => {
    const result = parseClass('hover:!text-red-500')
    expect(result.variants).toEqual(['hover'])
    expect(result.important).toBe(true)
    expect(result.importantPosition).toBe('prefix')
    expect(result.utility).toBe('text-red-500')
  })

  it('parses negative prefix', () => {
    const result = parseClass('-translate-x-1')
    expect(result.negative).toBe(true)
    expect(result.utility).toBe('translate-x-1')
  })

  it('parses arbitrary values', () => {
    const result = parseClass('w-[200px]')
    expect(result.arbitraryValue).toBe('200px')
    expect(result.utility).toBe('w-[200px]')
  })

  it('parses complex class with all features', () => {
    const result = parseClass('hover:!-translate-x-[10px]')
    expect(result.variants).toEqual(['hover'])
    expect(result.important).toBe(true)
    expect(result.importantPosition).toBe('prefix')
    expect(result.negative).toBe(true)
    expect(result.utility).toBe('translate-x-[10px]')
    expect(result.arbitraryValue).toBe('10px')
  })
})
