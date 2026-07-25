/**
 * Variant behaviour derived from the selectors the design system reports, rather
 * than from a list of variant names.
 *
 * Two things a name list cannot know: a project's own `@custom-variant` (its name
 * is whatever the author chose), and that `group-*` / `peer-*` wrap the element
 * in an ancestor or sibling selector — so reordering a state variant across one
 * of them changes which element the selector matches.
 */

import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { consistentVariantOrder } from '../../src/rules/consistent-variant-order'
import { noContradictingVariants } from '../../src/rules/no-contradicting-variants'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { loadDesignSystemSync } from '../../src/design-system/sync-loader'
import { DesignSystemCache } from '../../src/design-system/cache'
import { runWithFixture } from '../utils/with-fixture'

const CUSTOM = resolve(__dirname, '../fixtures/with-custom-variants.css')

describe('derived variant facts', () => {
  let cache: DesignSystemCache

  beforeAll(() => {
    const data = loadDesignSystemSync(CUSTOM)
    expect(data).not.toBeNull()
    cache = DesignSystemCache.fromPrecomputed(data!)
  })

  it('recognizes a project variant that targets a generated box', () => {
    expect(cache.getVariantFacts('thumb')?.pseudoElement).toBe(true)
  })

  it('recognizes a project variant that introduces a combinator', () => {
    expect(cache.getVariantFacts('child')?.structural).toBe(true)
  })

  it('does NOT flag ancestor/sibling variants, because they do not retarget', () => {
    // Measured in Tailwind 4.3.3: `group-hover` compiles to
    // `&:is(:where(.group):hover *)` — an `:is()` on the element itself, not a
    // nesting of selectors. So `peer-checked:group-hover:x` and
    // `group-hover:peer-checked:x` differ only in the order of two `:is()`
    // compounds and match exactly the same elements. Reordering them is safe,
    // and marking them as barriers would stop the rule doing its job.
    expect(cache.getVariantFacts('group-hover')).toBeUndefined()
    expect(cache.getVariantFacts('peer-checked')).toBeUndefined()
  })

  it('keeps a pseudo-element variant out of the structural bucket', () => {
    // `marker` emits both `& ::marker` and `&::marker`. It belongs innermost, so
    // the pseudo-element reading has to win over the descendant one.
    const marker = cache.getVariantFacts('marker')
    expect(marker?.pseudoElement).toBe(true)
    expect(marker?.structural ?? false).toBe(false)
  })

  it('leaves plain state variants unflagged', () => {
    const hover = cache.getVariantFacts('hover')
    expect(hover?.pseudoElement ?? false).toBe(false)
    expect(hover?.structural ?? false).toBe(false)
  })

  it('flags Tailwind pseudo-element variants too', () => {
    expect(cache.getVariantFacts('before')?.pseudoElement).toBe(true)
    expect(cache.getVariantFacts('placeholder')?.pseudoElement).toBe(true)
  })
})

describe('no-contradicting-variants with derived facts', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(CUSTOM)
  })

  runWithFixture(
    new RuleTester(),
    'no-contradicting-variants (custom)',
    noContradictingVariants,
    CUSTOM,
    {
      valid: [
        // Both style a different box than the base class does.
        { code: '<div className="size-4 thumb:size-4" />', filename: 'test.tsx' },
        { code: '<div className="mt-4 child:mt-4" />', filename: 'test.tsx' },
      ],
      invalid: [
        // A plain condition on the same element is still redundant.
        {
          code: '<div className="flex hover:flex" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'redundantVariant' }],
        },
        {
          // And so is an ancestor condition: `group-hover` compiles to an `:is()`
          // on this element, so it does not retarget anything — `flex` already
          // applies unconditionally.
          code: '<div className="flex group-hover:flex" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'redundantVariant' }],
        },
      ],
    },
  )
})

describe('consistent-variant-order with derived facts', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(CUSTOM)
  })

  runWithFixture(
    new RuleTester(),
    'consistent-variant-order (derived barriers)',
    consistentVariantOrder,
    CUSTOM,
    {
      valid: [
        // `child` introduces a combinator, so a state variant must not cross it:
        // `hover:child:*` (`&:hover > *`) is not `child:hover:*` (`& > *:hover`).
        { code: '<div className="hover:child:underline" />', filename: 'test.tsx' },
        { code: '<div className="child:hover:underline" />', filename: 'test.tsx' },
      ],
      invalid: [
        {
          // `thumb` targets a generated box, so it belongs innermost — exactly
          // like Tailwind's own `before`, which the static list knows and this
          // project-defined variant it cannot.
          code: '<div className="thumb:hover:size-4" />',
          filename: 'test.tsx',
          output: '<div className="hover:thumb:size-4" />',
          errors: [{ messageId: 'wrongOrder' }],
        },
      ],
    },
  )
})
