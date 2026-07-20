import { describe, expect, it } from 'vitest'
import {
  parseClass,
  extractVariants,
  extractUtility,
  getVariantPrefix,
  splitUtilityAndVariant,
  hasArbitraryValue,
  getArbitraryValue,
  utilityHasDynamicValue,
  splitImportant,
  reattachImportant,
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

// #76: the boundary scanners must track `()` depth, not just `[]`. The `:` in
// Tailwind v4's typed CSS-variable shorthand (`border-(length:--stroke)`,
// `bg-(color:--c)`) is a type hint, not a variant separator — mistaking it for
// one mangled the utility and made `no-unknown-classes` reject a valid class it
// `enforce-canonical` even recommends.
describe('typed CSS-variable shorthand is paren-aware (#76)', () => {
  it('extractVariants ignores the type-hint colon inside parens', () => {
    expect(extractVariants('border-(length:--stroke)')).toEqual([])
    expect(extractVariants('bg-(color:--c)')).toEqual([])
    expect(extractVariants('hover:border-(length:--stroke)')).toEqual(['hover'])
    expect(extractVariants('sm:focus:text-(length:--fs)')).toEqual(['sm', 'focus'])
  })

  it('extractUtility keeps the typed shorthand intact', () => {
    expect(extractUtility('border-(length:--stroke)')).toBe('border-(length:--stroke)')
    expect(extractUtility('hover:border-(length:--stroke)')).toBe('border-(length:--stroke)')
    // plain (--var) form (no type hint) was already fine — regression guard
    expect(extractUtility('border-(--stroke)')).toBe('border-(--stroke)')
  })

  it('getVariantPrefix / splitUtilityAndVariant split before the utility, not inside the parens', () => {
    expect(getVariantPrefix('hover:border-(length:--stroke)')).toBe('hover:')
    expect(getVariantPrefix('border-(length:--stroke)')).toBe('')
    expect(splitUtilityAndVariant('sm:bg-(color:--c)')).toEqual({
      utility: 'bg-(color:--c)',
      variant: 'sm:',
    })
  })

  it('parseClass resolves variants and utility for the typed shorthand', () => {
    const result = parseClass('hover:border-(length:--stroke)')
    expect(result.variants).toEqual(['hover'])
    expect(result.variantPrefix).toBe('hover:')
    expect(result.utility).toBe('border-(length:--stroke)')
  })

  it('utilityHasDynamicValue still routes the shorthand to the DS path', () => {
    expect(utilityHasDynamicValue('border-(length:--stroke)')).toBe(true)
    expect(utilityHasDynamicValue('bg-(color:--c)')).toBe(true)
  })
})

describe('splitImportant / reattachImportant', () => {
  it.each([
    ['!flex', 'flex', 'prefix'],
    ['flex!', 'flex', 'suffix'],
    ['flex', 'flex', null],
    ['!bg-red-500', 'bg-red-500', 'prefix'],
    ['bg-red-500!', 'bg-red-500', 'suffix'],
    ['p-[2px]', 'p-[2px]', null],
    ['!p-[2px]', 'p-[2px]', 'prefix'],
    ['p-[2px]!', 'p-[2px]', 'suffix'],
  ] as const)('splitImportant("%s")', (input, expectedBare, expectedPos) => {
    expect(splitImportant(input)).toEqual({ bare: expectedBare, position: expectedPos })
  })

  it('round-trips through reattachImportant', () => {
    for (const input of ['!flex', 'flex!', 'flex', '!bg-red-500', 'p-[2px]!']) {
      const { bare, position } = splitImportant(input)
      expect(reattachImportant(bare, position)).toBe(input)
    }
  })

  it('treats !something! as prefix-only (suffix never wins on a prefix-set utility)', () => {
    // Defensive case: malformed input. We don't normalize — prefix wins.
    expect(splitImportant('!flex!')).toEqual({ bare: 'flex!', position: 'prefix' })
  })
})
