import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  canonicalizeClassesSync,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'

/**
 * Why a canonical rewrite is NOT equivalent (R5). `safe: false` used to be all
 * the rule knew; now the worker also says what differs:
 *
 *   'variant'  — the declarations are the same, only the selector differs,
 *                and stock Tailwind says the two ARE the same: the project
 *                defines the canonical variant differently (shadcn's
 *                `data-disabled:` is `:where([data-disabled="true"]), …`, not
 *                `[data-disabled]`), so the two select different elements;
 *   'selector' — only the selector differs, but stock Tailwind emits different
 *                selectors too (`has-[[data-slot=x]]:` vs `has-data-[slot=x]:`):
 *                a spelling difference, nothing the project defined;
 *   'value'   — the declarations differ (`p-[2px]` → `p-0.5` reads
 *               `--spacing`, which the theme can change: #78).
 */
const SHADCN_VARIANTS = resolve(__dirname, '../fixtures/with-shadcn-variants.css')
const DEFAULT = resolve(__dirname, '../fixtures/default.css')

describe('canonicalize: why a rewrite is not equivalent', () => {
  beforeEach(() => resetCanonicalizeService())

  it('a project-defined variant: same declarations, different selector', () => {
    const [disabled, open] = canonicalizeClassesSync(SHADCN_VARIANTS, [
      'data-[disabled]:opacity-50',
      'data-[open]:flex',
    ])
    expect(disabled).toEqual({
      canonical: 'data-disabled:opacity-50',
      safe: false,
      reason: 'variant',
    })
    expect(open).toEqual({ canonical: 'data-open:flex', safe: false, reason: 'variant' })
  })

  it('a selector that differs in stock Tailwind too is not a project variant', () => {
    // shadcn apps/v4, verbatim.
    const [r] = canonicalizeClassesSync(SHADCN_VARIANTS, [
      'has-[[data-slot=rtl-components]]:bg-transparent',
    ])
    expect(r).toEqual({
      canonical: 'has-data-[slot=rtl-components]:bg-transparent',
      safe: false,
      reason: 'selector',
    })
  })

  it('a value that reads the theme: different declarations', () => {
    // With a root font size (the rule always passes one), p-[2px] → p-0.5.
    expect(canonicalizeClassesSync(DEFAULT, ['p-[2px]'], 16)[0]).toMatchObject({
      safe: false,
      reason: 'value',
    })
  })

  it('an equivalent rewrite carries no reason', () => {
    // Stock Tailwind: data-[disabled]: and data-disabled: are the same selector.
    expect(canonicalizeClassesSync(DEFAULT, ['data-[disabled]:opacity-50'])[0]).toEqual({
      canonical: 'data-disabled:opacity-50',
      safe: true,
    })
  })
})
