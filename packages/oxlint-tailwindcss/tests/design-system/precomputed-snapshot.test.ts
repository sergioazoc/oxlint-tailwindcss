/**
 * Snapshot tests for precomputed design system data.
 *
 * These tests capture key metrics and known values from the precomputed
 * output to detect regressions when optimizing the PRECOMPUTE_SCRIPT.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { loadDesignSystemSync, type PrecomputedData } from '../../src/design-system/sync-loader'
import { DesignSystemCache } from '../../src/design-system/cache'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

let data: PrecomputedData
let cache: DesignSystemCache

beforeAll(() => {
  const result = loadDesignSystemSync(ENTRY_POINT)
  expect(result).not.toBeNull()
  data = result!
  cache = DesignSystemCache.fromPrecomputed(data)
})

/** The single declaration a class emits for `prop` on its own box. */
function elementDecl(cls: string, prop: string) {
  return cache
    .getCssDeclarations(cls)
    .find((d) => d.prop === prop && d.scope === 'element' && !d.conditional)
}

describe('Precomputed Data Snapshot', () => {
  describe('validClasses', () => {
    it('has more than 22000 classes', () => {
      expect(data.validClasses.length).toBeGreaterThan(22000)
    })

    it('contains core utility classes', () => {
      const coreClasses = [
        'flex',
        'block',
        'hidden',
        'grid',
        'inline',
        'p-4',
        'p-0',
        'm-4',
        'm-0',
        'w-full',
        'h-full',
        'text-center',
        'font-bold',
        'bg-blue-500',
        'text-red-500',
        'border',
        'rounded',
        'shadow',
        'items-center',
        'justify-center',
        'gap-4',
        'absolute',
        'relative',
        'sticky',
        'overflow-hidden',
      ]
      for (const cls of coreClasses) {
        expect(data.validClasses).toContain(cls)
      }
    })

    it('contains marker classes', () => {
      expect(data.validClasses).toContain('group')
      expect(data.validClasses).toContain('peer')
    })

    it('contains expanded bare utilities', () => {
      expect(data.validClasses).toContain('rounded')
      expect(data.validClasses).toContain('shadow')
    })
  })

  describe('canonical', () => {
    it('has known canonical mappings', () => {
      // Negative zero → positive zero
      expect(data.canonical['-m-0']).toBe('m-0')
    })

    it('has a reasonable number of diffs (not all classes)', () => {
      const diffCount = Object.keys(data.canonical).length
      expect(diffCount).toBeGreaterThan(0)
      // Should be a small fraction of total classes
      expect(diffCount).toBeLessThan(data.validClasses.length / 10)
    })
  })

  describe('order', () => {
    it('has entries for core classes', () => {
      expect(data.order['flex']).toBeDefined()
      expect(data.order['p-4']).toBeDefined()
      expect(data.order['bg-blue-500']).toBeDefined()
      expect(data.order['items-center']).toBeDefined()
    })

    it('has more than 20000 entries', () => {
      expect(Object.keys(data.order).length).toBeGreaterThan(20000)
    })

    it('order values are serialized BigInts (string numbers)', () => {
      const val = data.order['flex']
      expect(typeof val).toBe('string')
      expect(() => BigInt(val)).not.toThrow()
    })
  })

  describe('cssDeclarations', () => {
    it('maps padding classes correctly', () => {
      expect(cache.getCssProperties('p-4')).toContain('padding')
    })

    it('maps display classes correctly', () => {
      expect(cache.getCssProperties('flex')).toContain('display')
    })

    it('maps background classes correctly', () => {
      expect(cache.getCssProperties('bg-blue-500')).toContain('background-color')
    })

    it('maps alignment classes correctly', () => {
      expect(cache.getCssProperties('items-center')).toContain('align-items')
    })

    it('has more than 5000 entries', () => {
      expect(Object.keys(data.cssDeclarations.byClass).length).toBeGreaterThan(5000)
    })

    it('keeps the declaration value alongside the property', () => {
      expect(elementDecl('p-4', 'padding')?.value).toBe('calc(var(--spacing) * 4)')
      expect(elementDecl('flex', 'display')?.value).toBe('flex')
    })

    it('interns values, so equal declarations share an id', () => {
      // `filter` is emitted with a byte-identical var chain by every filter
      // utility — that shared id is what tells "same declaration" from a conflict.
      const a = elementDecl('blur-sm', 'filter')
      const b = elementDecl('brightness-50', 'filter')
      expect(a?.valueId).toBe(b?.valueId)
      expect(data.cssDeclarations.values.length).toBeLessThan(
        Object.keys(data.cssDeclarations.table).length,
      )
    })

    it('records the variables a value reads, keeping fallbacks apart', () => {
      // text-sm READS --tw-leading (which leading-* writes) and only falls back
      // to the size token when nothing supplies it.
      const lineHeight = elementDecl('text-sm', 'line-height')
      expect(lineHeight?.readsVars).toContain('--tw-leading')
      expect(lineHeight?.readsFallbackVars).toContain('--text-sm--line-height')
      expect(lineHeight?.pureVarRead).toBe(true)
      expect(cache.getCssProperties('leading-6')).toContain('--tw-leading')
    })

    it('marks pure var() forwarding, but not values with content of their own', () => {
      expect(elementDecl('scale-3d', 'scale')?.pureVarRead).toBe(true)
      // transform-gpu prepends translateZ(0), so it contributes a value.
      const gpu = elementDecl('transform-gpu', 'transform')
      expect(gpu?.pureVarRead).toBe(false)
      expect(gpu?.readsVars).toContain('--tw-rotate-x')
    })

    it('scopes pseudo-element declarations away from the element', () => {
      const placeholder = cache.getCssDeclarations('placeholder-gray-400')
      expect(placeholder).toHaveLength(1)
      expect(placeholder[0].scope).toBe('pseudo')
      expect(placeholder[0].pseudo).toBe('::placeholder')
      expect(placeholder[0].prop).toBe('color')
      // The element itself declares nothing: `text-gray-900 placeholder-gray-400`
      // is not a conflict.
      expect(cache.getCssProperties('placeholder-gray-400')).toEqual([])
    })

    it('scopes descendant declarations away from the element', () => {
      const spacing = cache.getCssDeclarations('space-x-4')
      expect(spacing.length).toBeGreaterThan(0)
      expect(spacing.every((d) => d.scope === 'descendant')).toBe(true)
      expect(spacing.some((d) => d.prop === 'margin-inline-start')).toBe(true)
      // `ms-2 space-x-4` styles two different boxes.
      expect(cache.getCssProperties('space-x-4')).toEqual([])
      expect(cache.getCssProperties('ms-2')).toEqual(['margin-inline-start'])
    })

    it('keeps a property declared twice, marking the conditional one', () => {
      const positions = cache
        .getCssDeclarations('bg-linear-to-r')
        .filter((d) => d.prop === '--tw-gradient-position')
      expect(positions).toHaveLength(2)
      expect(positions[0].conditional).toBe(false)
      expect(positions[1].conditional).toBe(true)
      expect(positions[0].value).not.toBe(positions[1].value)
    })

    it('reports classes whose CSS is only partially modelled', () => {
      // container's breakpoint max-widths live in @media, so it must never be
      // called redundant against a plain `w-full`.
      expect(cache.isPartial('container')).toBe(true)
      expect(cache.getCssProperties('container')).toEqual(['width'])
      expect(cache.isPartial('p-4')).toBe(false)
    })

    it('covers the classes recovered outside getClassList()', () => {
      // These used to be pushed into validClasses with their CSS discarded, so
      // `rounded rounded-lg` and `blur blur-sm` were silently never compared.
      expect(cache.getCssProperties('rounded')).toEqual(['border-radius'])
      expect(cache.getCssProperties('blur')).toContain('--tw-blur')
      expect(cache.getCssProperties('break-words')).toEqual(['overflow-wrap'])
      expect(cache.getCssProperties('-col-1')).toEqual(['grid-column'])
      expect(cache.getCssProperties('@container-size')).toContain('container-type')
    })

    it('leaves only the CSS-less marker classes without declarations', () => {
      const missing = data.validClasses.filter((cls) => !(cls in data.cssDeclarations.byClass))
      expect(missing.sort()).toEqual(['group', 'peer'])
    })
  })

  describe('variantOrder', () => {
    it('contains core variants', () => {
      const coreVariants = ['hover', 'focus', 'active', 'dark', 'sm', 'md', 'lg', 'xl', '2xl']
      for (const v of coreVariants) {
        expect(data.variantOrder[v]).toBeDefined()
      }
    })

    it('has variant indices as numbers', () => {
      expect(typeof data.variantOrder['hover']).toBe('number')
    })

    it('has more than 30 variants', () => {
      expect(Object.keys(data.variantOrder).length).toBeGreaterThan(30)
    })
  })

  describe('arbitraryEquivalents', () => {
    it('has more than 3000 equivalents', () => {
      expect(Object.keys(data.arbitraryEquivalents).length).toBeGreaterThan(3000)
    })

    it('keys are arbitrary form, values are named classes', () => {
      const entries = Object.entries(data.arbitraryEquivalents)
      // Arbitrary forms contain brackets
      const sample = entries.slice(0, 20)
      for (const [arb, named] of sample) {
        expect(arb).toContain('[')
        expect(arb).toContain(']')
        expect(named).not.toContain('[')
      }
    })
  })

  describe('componentClasses', () => {
    it('is an array', () => {
      expect(Array.isArray(data.componentClasses)).toBe(true)
    })
  })
})

/**
 * The two derivations `prefer-scale-token` rests on.
 *
 * Neither is a table anyone maintains: the spacing granularity comes from the
 * steps Tailwind itself enumerates, and the token values come from the emitted
 * CSS plus the theme. If a Tailwind release changes either, the rule silently
 * starts reporting more or less — so the derived shape is pinned here.
 */
describe('derived scale and token values', () => {
  it('derives the spacing unit, its granularity and which prefixes read it', () => {
    expect(data.scale).toBeDefined()
    expect(data.scale!.unit).toBe('0.25rem')
    // Every step getClassList() enumerates (0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4,
    // 5…96) is a multiple of this. It is what keeps the rule from reporting
    // `w-[33.7px]` → `w-8.425`, which Tailwind compiles but never proposes.
    expect(data.scale!.step).toBe(0.5)
    // Utilities whose `<prefix>-1` reads `var(--spacing)`.
    expect(data.scale!.prefixes).toContain('w')
    expect(data.scale!.prefixes).toContain('p')
    expect(data.scale!.prefixes).toContain('gap')
    expect(data.scale!.prefixes).toContain('size')
    expect(data.scale!.prefixes).toContain('scroll-mt')
    // …and not the ones whose `-1` is a plain number or a length of its own.
    expect(data.scale!.prefixes).not.toContain('z')
    expect(data.scale!.prefixes).not.toContain('opacity')
    expect(data.scale!.prefixes).not.toContain('border')
    expect(data.scale!.prefixes).not.toContain('order')
  })

  it('maps numeric theme tokens back to their literal value', () => {
    const rounded = new Map(data.tokenValues?.rounded ?? [])
    expect(rounded.get('0.5rem')).toBe('rounded-lg')
    expect(rounded.get('0.125rem')).toBe('rounded-xs')

    const basis = new Map(data.tokenValues?.basis ?? [])
    expect(basis.get('28rem')).toBe('basis-md')
  })

  it('excludes tokens whose class declares more than the literal would', () => {
    // `text-sm` sets `font-size` AND `line-height`, so `text-[14px]` is not it —
    // the single-declaration requirement drops the whole `text` family without
    // anyone having to list it.
    expect(data.tokenValues?.text).toBeUndefined()
  })

  it('excludes non-numeric tokens, which no literal could match', () => {
    // 7 000 of the ~7 200 pure-`var()` classes are colours; none can be compared
    // against a value a human typed, so none are stored.
    expect(data.tokenValues?.['accent-amber']).toBeUndefined()
    expect(data.tokenValues?.['bg-red']).toBeUndefined()
  })
})
