import { describe, it, expect } from 'vitest'
import { DesignSystemCache } from '../../src/design-system/cache'
import { type PrecomputedData } from '../../src/design-system/sync-loader'
import { makeDeclarations } from '../utils/declarations'

function makeData(overrides: Partial<PrecomputedData> = {}): PrecomputedData {
  return {
    validClasses: ['flex', 'p-4', 'bg-blue-500', 'items-center', 'group', 'peer', '-m-0'],
    canonical: { '-m-0': 'm-0', 'flex-grow': 'grow' },
    order: {
      flex: '100',
      'p-4': '200',
      'bg-blue-500': '300',
      'items-center': '150',
    },
    cssDeclarations: makeDeclarations(
      {
        flex: [['', 'display', 'flex']],
        'p-4': [['', 'padding', 'calc(var(--spacing) * 4)']],
        'bg-blue-500': [['', 'background-color', 'var(--color-blue-500)']],
        'items-center': [['', 'align-items', 'center']],
        // Scope coverage: a pseudo-element box, a descendant box, and a class
        // that declares the same property twice (plainly, then under @supports).
        'placeholder-red-500': [['::placeholder', 'color', 'var(--color-red-500)']],
        'space-x-4': [
          ['>', '--tw-space-x-reverse', '0'],
          ['>', 'margin-inline-start', 'calc(var(--spacing) * 4)'],
        ],
        'bg-linear-to-r': [
          ['', '--tw-gradient-position', 'to right'],
          ['@', '--tw-gradient-position', 'to right in oklab'],
          ['', 'background-image', 'linear-gradient(var(--tw-gradient-stops))'],
        ],
        container: [
          ['', 'width', '100%'],
          ['@', 'max-width', '40rem'],
        ],
      },
      { partial: ['bg-linear-to-r', 'container'] },
    ),
    variantOrder: { hover: 10, focus: 20, dark: 30, sm: 40, md: 50 },
    componentClasses: ['prose', 'not-prose'],
    arbitraryEquivalents: { 'p-[1rem]': 'p-4', 'bg-[#3b82f6]': 'bg-blue-500' },
    prefix: '',
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

/**
 * Named group/peer markers (#102).
 *
 * Derived rather than listed: a marker is a precomputed class that emits ZERO
 * declarations. Across every fixture in this suite that resolves to exactly
 * `group` and `peer` (2 of ~23.6k classes), so the predicate self-prunes if
 * Tailwind stops shipping the variants and self-extends if a new CSS-less marker
 * appears — and `@container/main` is excluded for free, because it HAS
 * declarations.
 *
 * The component set has to be subtracted, though: a component class referenced
 * only through `[class~="…"]` (`not-prose`) also lands in the validity set with
 * no declarations of its own, and `not-prose/x` is not Tailwind syntax.
 */
describe('isMarkerClass', () => {
  it('recognizes named markers', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.isMarkerClass('group/menu-item')).toBe(true)
    expect(cache.isMarkerClass('peer/menu-button')).toBe(true)
    // Any non-empty name: Tailwind never checks the name exists, and an
    // arbitrary modifier on the consumer can reference shapes the bare syntax
    // cannot spell.
    expect(cache.isMarkerClass('group/1')).toBe(true)
    expect(cache.isMarkerClass('group/*')).toBe(true)
    expect(cache.isMarkerClass('peer//x')).toBe(true)
    expect(cache.isMarkerClass('group/a/b')).toBe(true)
  })

  it('rejects the empty name, which compiles to nothing', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.isMarkerClass('group/')).toBe(false)
    expect(cache.isMarkerClass('peer/')).toBe(false)
    expect(cache.isMarkerClass('/menu-item')).toBe(false)
  })

  it('rejects utilities that merely carry a slash modifier', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    // `bg-blue-500` emits declarations, so it is not a marker.
    expect(cache.isMarkerClass('bg-blue-500/50')).toBe(false)
    expect(cache.isMarkerClass('flex')).toBe(false)
    expect(cache.isMarkerClass('group')).toBe(false)
    expect(cache.isMarkerClass('grup/menu-item')).toBe(false)
  })

  it('rejects CSS-less component classes', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    // `not-prose` is in the validity set with zero declarations, exactly like a
    // marker — but it is a component class, and `not-prose/x` is not syntax.
    expect(cache.isMarkerClass('not-prose/x')).toBe(false)
  })

  it('honours the project prefix', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData({ prefix: 'tw' }))
    expect(cache.isMarkerClass('tw:group/menu-item')).toBe(true)
    expect(cache.isMarkerClass('group/menu-item')).toBe(true)
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

// Tailwind v4 project prefix (`@import "tailwindcss" prefix(tw)`). All stored
// structures remain prefix-free; the cache strips/re-applies the prefix at the
// public-method boundary. These unit tests use synthetic prefix-free data with
// `prefix: 'tw'` to lock the boundary behavior independently of a real DS load.
describe('project prefix', () => {
  const prefixed = () => DesignSystemCache.fromPrecomputed(makeData({ prefix: 'tw' }))

  it('exposes the prefix and keeps validClasses prefix-free', () => {
    const cache = prefixed()
    expect(cache.prefix).toBe('tw')
    expect(cache.validClasses).toContain('flex')
    expect(cache.validClasses).not.toContain('tw:flex')
  })

  it('defaults prefix to empty string', () => {
    expect(DesignSystemCache.fromPrecomputed(makeData()).prefix).toBe('')
  })

  describe('classValidity (strict, prefix configured)', () => {
    it('accepts correctly prefixed Tailwind utilities', () => {
      const cache = prefixed()
      expect(cache.classValidity('tw:flex')).toBe('valid')
      expect(cache.classValidity('tw:items-center')).toBe('valid')
      expect(cache.classValidity('tw:hover:flex')).toBe('valid')
      expect(cache.classValidity('tw:!flex')).toBe('valid')
      expect(cache.classValidity('tw:flex!')).toBe('valid')
    })

    it('flags Tailwind utilities written without the prefix', () => {
      const cache = prefixed()
      expect(cache.classValidity('flex')).toBe('missing-prefix')
      expect(cache.classValidity('items-center')).toBe('missing-prefix')
      expect(cache.classValidity('hover:flex')).toBe('missing-prefix')
    })

    it('treats component classes as valid with or without the prefix', () => {
      const cache = prefixed()
      expect(cache.classValidity('prose')).toBe('valid')
      expect(cache.classValidity('not-prose')).toBe('valid')
      expect(cache.classValidity('tw:prose')).toBe('valid')
      expect(cache.classValidity('hover:prose')).toBe('valid')
    })

    it('reports genuinely unknown classes', () => {
      const cache = prefixed()
      expect(cache.classValidity('tw:totally-fake')).toBe('unknown')
      expect(cache.classValidity('totally-fake')).toBe('unknown')
    })
  })

  it('classValidity collapses to tolerant isValid when no prefix is set', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    expect(cache.classValidity('flex')).toBe('valid')
    expect(cache.classValidity('totally-fake')).toBe('unknown')
  })

  it('canonicalize preserves the prefix', () => {
    const cache = prefixed()
    expect(cache.canonicalize('tw:flex-grow')).toBe('tw:grow')
    expect(cache.canonicalize('tw:flex')).toBe('tw:flex')
  })

  it('getOrder resolves prefixed classes and orders variants after base', () => {
    const cache = prefixed()
    const base = cache.getOrder('tw:flex')
    const variant = cache.getOrder('tw:hover:flex')
    expect(base).not.toBeNull()
    expect(variant).not.toBeNull()
    expect(variant! > base!).toBe(true)
  })
})

/**
 * Lint-time interning must not write into the cache artifact.
 *
 * `PrecomputedData.cssDeclarations` is held by reference, so a value appended to
 * its `values` array would be visible to every cache built from the same object
 * — while each cache keeps its OWN text→id map. The second cache would not see
 * the first one's append, hand out a fresh id for the same text, and then
 * `decidePair` (which compares ids, not strings) would read two identical values
 * as a conflict.
 *
 * Unreachable through the loader today, which parses the JSON per entry point,
 * but it is one shared object away from being a false positive nobody could
 * explain.
 */
describe('internDeclarations isolation', () => {
  const RAWS: [string, string, string][] = [['', 'padding', '5px']]
  const FACTS = { '5px': { p: [], f: [], u: false } }

  it('does not append to the shared value table', () => {
    const data = makeData()
    const before = data.cssDeclarations.values.length
    const cache = DesignSystemCache.fromPrecomputed(data)

    cache.internDeclarations('p-[5px]', RAWS, FACTS)

    expect(data.cssDeclarations.values.length).toBe(before)
  })

  it('gives the same value the same id in each cache built from one artifact', () => {
    const data = makeData()
    const a = DesignSystemCache.fromPrecomputed(data)
    const b = DesignSystemCache.fromPrecomputed(data)

    // Interleaved on purpose. Each cache has to have built its text→id map, and
    // to have interned something of its own, BEFORE they meet on a shared value —
    // that is the ordering in which a shared, appended array hands out two
    // different ids for one text. Interning in both caches back to back would
    // pass either way, because the second cache builds its map lazily and would
    // simply see the first one's append.
    b.internDeclarations('mt-[7px]', [['', 'margin-top', '7px']], {
      '7px': { p: [], f: [], u: false },
    })
    a.internDeclarations('mb-[9px]', [['', 'margin-bottom', '9px']], {
      '9px': { p: [], f: [], u: false },
    })

    const fromB = b.internDeclarations('p-[5px]', RAWS, FACTS)
    const fromA = a.internDeclarations('p-[5px]', RAWS, FACTS)

    expect(fromA[0].valueId).toBe(fromB[0].valueId)
  })

  it('still shares ids with the precomputed values it interns against', () => {
    const cache = DesignSystemCache.fromPrecomputed(makeData())
    // `p-4` is precomputed with this exact value; the lint-time class has to land
    // on the SAME id or the two would never compare equal.
    const precomputed = cache.getCssDeclarations('p-4')[0]
    const interned = cache.internDeclarations('p-[1rem]', [['', 'padding', precomputed.value]], {
      [precomputed.value]: { p: [], f: [], u: false },
    })
    expect(interned[0].valueId).toBe(precomputed.valueId)
  })
})
