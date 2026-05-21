import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { resolve } from 'node:path'
import {
  getLoadedDesignSystem,
  resetDesignSystem,
  type LoadResult,
} from '../../src/design-system/loader'
import { DesignSystemCache } from '../../src/design-system/cache'

const FIXTURE_PATH = resolve(__dirname, '../fixtures/default.css')
const ANIMATE_FIXTURE_PATH = resolve(__dirname, '../fixtures/with-tailwindcss-animate.css')
const TW_ANIMATE_CSS_FIXTURE_PATH = resolve(__dirname, '../fixtures/with-tw-animate-css.css')

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

  it('validates opacity modifiers', () => {
    const { cache } = result!
    expect(cache.isValid('bg-black/80')).toBe(true)
    expect(cache.isValid('bg-blue-500/50')).toBe(true)
    expect(cache.isValid('text-white/90')).toBe(true)
    expect(cache.isValid('hover:bg-black/80')).toBe(true)
    // Invalid base class with opacity is still invalid
    expect(cache.isValid('bg-fakecolor/80')).toBe(false)
  })

  it('validates dynamic numeric values via heuristic', () => {
    const { cache } = result!
    expect(cache.isValid('w-45')).toBe(true)
    expect(cache.isValid('min-h-17.5')).toBe(true)
    expect(cache.isValid('size-3.75')).toBe(true)
    expect(cache.isValid('gap-13')).toBe(true)
    expect(cache.isValid('fake-45')).toBe(false)
  })

  it('validates precomputed extra candidates', () => {
    const { cache } = result!
    // Bare utilities and screen breakpoints are expanded during precompute
    expect(cache.isValid('rounded')).toBe(true)
    expect(cache.isValid('shadow')).toBe(true)
    expect(cache.isValid('max-w-screen-lg')).toBe(true)
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

describe('tailwindcss-animate integration', () => {
  it('validates documented animation utility classes', () => {
    resetDesignSystem()
    const animateResult = getLoadedDesignSystem(ANIMATE_FIXTURE_PATH)
    expect(animateResult).not.toBeNull()

    const { cache } = animateResult!
    const documentedClasses = [
      'animate-in',
      'animate-out',
      'fade-in',
      'fade-in-50',
      'fade-out',
      'fade-out-75',
      'spin-in-90',
      'spin-out-90',
      'zoom-in',
      'zoom-in-95',
      'zoom-out',
      'zoom-out-95',
      'slide-in-from-top',
      'slide-in-from-bottom-48',
      'slide-out-to-left-72',
      'slide-out-to-right-96',
      'direction-alternate-reverse',
      'fill-mode-both',
      'repeat-infinite',
      'fill-mode-[forwards,backwards]',
      'running',
      'paused',
      'ease-in-out',
      'motion-safe:animate-in',
    ]

    for (const className of documentedClasses) {
      expect(cache.isValid(className), className).toBe(true)
    }
  })
})

describe('tw-animate-css integration', () => {
  it('validates documented animation utility classes', () => {
    resetDesignSystem()
    const animateResult = getLoadedDesignSystem(TW_ANIMATE_CSS_FIXTURE_PATH)
    expect(animateResult).not.toBeNull()

    const { cache } = animateResult!
    const documentedClasses = [
      'animate-in',
      'animate-out',
      'fade-in',
      'fade-in-50',
      'fade-out',
      'zoom-in',
      'zoom-in-95',
      'zoom-out',
      'slide-in-from-top',
      'slide-in-from-bottom-48',
      'slide-out-to-left-72',
      'slide-out-to-right-96',
      'direction-alternate-reverse',
      'fill-mode-both',
      'fill-mode-[forwards,backwards]',
      'repeat-infinite',
      'running',
      'paused',
      'motion-safe:animate-in',
      'blur-in',
      'blur-out',
      'blur-in-30',
      'blur-out-12',
      'slide-in-from-start',
      'slide-in-from-end-8',
      'slide-out-to-start',
      'slide-out-to-end-8',
      'play-state-initial',
      'animate-accordion-down',
      'animate-accordion-up',
      'animate-collapsible-down',
      'animate-collapsible-up',
      'animate-caret-blink',
    ]

    for (const className of documentedClasses) {
      expect(cache.isValid(className), className).toBe(true)
    }
  })
})
