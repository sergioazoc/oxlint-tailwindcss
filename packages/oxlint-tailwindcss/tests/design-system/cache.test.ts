import { describe, it, expect } from 'vitest'
import { DesignSystemCache } from '../../src/design-system/cache'
import { type PrecomputedData } from '../../src/design-system/sync-loader'

function makeData(overrides: Partial<PrecomputedData> = {}): PrecomputedData {
  return {
    validClasses: ['flex', 'p-4', 'bg-blue-500', 'items-center', 'group', '-m-0'],
    canonical: { '-m-0': 'm-0', 'flex-grow': 'grow' },
    order: {
      flex: '100',
      'p-4': '200',
      'bg-blue-500': '300',
      'items-center': '150',
    },
    cssProps: {
      flex: ['display'],
      'p-4': ['padding'],
      'bg-blue-500': ['background-color'],
      'items-center': ['align-items'],
    },
    variantOrder: { hover: 10, focus: 20, dark: 30, sm: 40, md: 50 },
    componentClasses: ['prose', 'not-prose'],
    arbitraryEquivalents: { 'p-[1rem]': 'p-4', 'bg-[#3b82f6]': 'bg-blue-500' },
    ...overrides,
  }
}

describe('DesignSystemCache.fromPrecomputed', () => {
  it('builds cache from complete data', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.validClasses).toContain('flex')
    expect(cache.validClasses).toContain('p-4')
    expect(cache.maxOrder).toBeGreaterThan(0n)
  })

  it('handles empty canonical and arbitraryEquivalents', () => {
    const cache = DesignSystemCache.fromPrecomputed(
      makeData({ canonical: {}, arbitraryEquivalents: {} }),
    )
    expect(cache.canonicalize('flex')).toBe('flex')
    expect(cache.getNamedEquivalent('p-[1rem]')).toBeNull()
  })

  it('handles missing optional fields', () => {
    const data = makeData()
    // @ts-expect-error — simulate missing optional fields
    delete data.variantOrder
    // @ts-expect-error
    delete data.componentClasses
    // @ts-expect-error
    delete data.arbitraryEquivalents

    const cache = DesignSystemCache.fromPrecomputed(data)
    expect(cache.hasVariantOrder()).toBe(false)
    expect(cache.getNamedEquivalent('p-[1rem]')).toBeNull()
  })

  it('merges componentClasses into validitySet', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.isValid('prose')).toBe(true)
    expect(cache.isValid('not-prose')).toBe(true)
  })
})

describe('canonicalize', () => {
  it('returns canonical form for known diff', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.canonicalize('-m-0')).toBe('m-0')
    expect(cache.canonicalize('flex-grow')).toBe('grow')
  })

  it('returns identity for already-canonical class', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.canonicalize('flex')).toBe('flex')
    expect(cache.canonicalize('p-4')).toBe('p-4')
  })

  it('canonicalizes variant-prefixed classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.canonicalize('hover:-m-0')).toBe('hover:m-0')
  })

  it('handles ! prefix', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.canonicalize('!-m-0')).toBe('!m-0')
  })

  it('handles ! suffix', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.canonicalize('-m-0!')).toBe('m-0!')
  })

  it('returns identity for unknown classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.canonicalize('totally-unknown')).toBe('totally-unknown')
  })

  it('returns identity when canonical map is empty', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData({ canonical: {} }))
    expect(cache.canonicalize('-m-0')).toBe('-m-0')
  })
})

describe('isValid', () => {
  it('validates direct class names', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.isValid('flex')).toBe(true)
    expect(cache.isValid('p-4')).toBe(true)
  })

  it('rejects unknown classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.isValid('not-a-class')).toBe(false)
    expect(cache.isValid('fex')).toBe(false)
  })

  it('validates component classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.isValid('prose')).toBe(true)
    expect(cache.isValid('not-prose')).toBe(true)
  })

  it('validates arbitrary values', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.isValid('bg-[#123]')).toBe(true)
    expect(cache.isValid('w-[200px]')).toBe(true)
  })

  it('validates classes with ! modifier', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.isValid('!flex')).toBe(true)
    expect(cache.isValid('flex!')).toBe(true)
  })
})

describe('getOrder', () => {
  it('returns order for known classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getOrder('flex')).toBe(100n)
    expect(cache.getOrder('p-4')).toBe(200n)
  })

  it('returns null for unknown classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getOrder('not-a-class')).toBeNull()
  })

  it('handles ! modifier', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getOrder('!flex')).toBe(100n)
    expect(cache.getOrder('flex!')).toBe(100n)
  })
})

describe('getClassOrder', () => {
  it('returns order for a batch of classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    const result = cache.getClassOrder(['flex', 'p-4', 'unknown'])
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(['flex', 100n])
    expect(result[1]).toEqual(['p-4', 200n])
    expect(result[2]).toEqual(['unknown', null])
  })
})

describe('getCssProperties', () => {
  it('returns props for known classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getCssProperties('p-4')).toEqual(['padding'])
    expect(cache.getCssProperties('flex')).toEqual(['display'])
  })

  it('returns empty array for unknown classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getCssProperties('unknown')).toEqual([])
  })

  it('handles ! modifier', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getCssProperties('!p-4')).toEqual(['padding'])
    expect(cache.getCssProperties('p-4!')).toEqual(['padding'])
  })
})

describe('getNamedEquivalent', () => {
  it('returns named class for known arbitrary form', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getNamedEquivalent('p-[1rem]')).toBe('p-4')
  })

  it('returns null for unknown arbitrary form', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getNamedEquivalent('p-[999px]')).toBeNull()
  })

  it('returns null when map is empty', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData({ arbitraryEquivalents: {} }))
    expect(cache.getNamedEquivalent('p-[1rem]')).toBeNull()
  })

  it('handles ! modifier', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getNamedEquivalent('!p-[1rem]')).toBe('p-4')
    expect(cache.getNamedEquivalent('p-[1rem]!')).toBe('p-4')
  })
})

describe('getVariantPriority', () => {
  it('returns priority for known variants', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getVariantPriority('hover')).toBe(10)
    expect(cache.getVariantPriority('dark')).toBe(30)
  })

  it('returns null for unknown variants', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.getVariantPriority('unknown-variant')).toBeNull()
  })
})

describe('hasVariantOrder', () => {
  it('returns true when variant order is populated', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.hasVariantOrder()).toBe(true)
  })

  it('returns false when variant order is empty', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData({ variantOrder: {} }))
    expect(cache.hasVariantOrder()).toBe(false)
  })
})
