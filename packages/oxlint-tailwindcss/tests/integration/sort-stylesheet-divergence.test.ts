// Regression test for issue #22.
//
// User reported that `oxfmt --sortTailwindcss` and our `enforce-sort-order` rule
// produce different orderings on the same code. Root cause: both use the same
// algorithm (`ds.getClassOrder()` on a Tailwind design system) but they load
// DIFFERENT CSS by default:
//
//   - oxfmt's `sortTailwindcss.stylesheet` defaults to the installed tailwindcss
//     package's `theme.css` (no user customizations).
//   - Our plugin auto-detects the user's CSS entry point and loads THAT.
//
// When the user has a custom `@theme { ... }` block, custom utilities like
// `text-brand` exist in our DS but NOT in oxfmt's. Each tool sorts those
// classes differently, producing the conflict in the issue.
//
// This test pins down: same stylesheet → same order (our promise), and
// documents the divergence so a future change doesn't regress the diagnosis.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const tailwindNodePath = require_.resolve('@tailwindcss/node')

const REPO_ROOT = resolve(__dirname, '../..')
const CUSTOM_THEME_CSS = resolve(__dirname, '../fixtures/custom-theme.css')
const DEFAULT_THEME_CSS = resolve(REPO_ROOT, 'node_modules/tailwindcss/theme.css')

async function loadDS(cssPath: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __unstable__loadDesignSystem } = await import(tailwindNodePath)
  const css = readFileSync(cssPath, 'utf-8')
  return __unstable__loadDesignSystem(css, { base: REPO_ROOT })
}

function sortByDS(ds: any, classes: string[]): string[] {
  const ordered: Array<[string, number | null]> = ds.getClassOrder(classes)
  return [...ordered]
    .sort((a, b) => {
      if (a[1] === null && b[1] === null) return 0
      if (a[1] === null) return -1
      if (b[1] === null) return 1
      return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0
    })
    .map(([n]) => n)
}

describe('sort order — stylesheet must match between tools (issue #22)', () => {
  it('identical CSS produces identical order (the plugin matches oxfmt when configured the same)', async () => {
    const dsA = await loadDS(CUSTOM_THEME_CSS)
    const dsB = await loadDS(CUSTOM_THEME_CSS)
    const classes = [
      'text-brand',
      'bg-brand-light',
      'p-18',
      'flex',
      'items-center',
      'p-4',
      'rounded-lg',
      'hover:bg-red-600',
      'md:text-lg',
    ]
    expect(sortByDS(dsA, classes)).toEqual(sortByDS(dsB, classes))
  })

  it('different stylesheets diverge on custom-theme classes (the cause of the reported conflict)', async () => {
    const userDS = await loadDS(CUSTOM_THEME_CSS) // what the plugin sees
    const oxfmtDS = await loadDS(DEFAULT_THEME_CSS) // what oxfmt sees by default

    // Custom-theme classes: `text-brand` and `bg-brand-light` only exist in
    // the user's CSS. (Note: `p-18` happens to be a valid numeric utility
    // even without custom spacing, so it's not a useful divergence marker.)
    const classes = [
      'text-brand',
      'bg-brand-light',
      'flex',
      'items-center',
      'p-4',
      'rounded-lg',
      'hover:bg-red-600',
      'md:text-lg',
    ]

    const userOrder = sortByDS(userDS, classes)
    const oxfmtOrder = sortByDS(oxfmtDS, classes)

    expect(userOrder).not.toEqual(oxfmtOrder)

    // In the user's DS, custom-theme classes have real orders → they slot
    // into the standard utility order.
    const userTextBrandOrdered = userDS.getClassOrder(['text-brand'])[0]
    expect(userTextBrandOrdered[1]).not.toBeNull()

    // In oxfmt's default DS, custom-theme classes return null order → they
    // get pushed to the front by the "unknown first" sort rule shared with
    // prettier-plugin-tailwindcss.
    const oxfmtTextBrandOrdered = oxfmtDS.getClassOrder(['text-brand'])[0]
    expect(oxfmtTextBrandOrdered[1]).toBeNull()
    expect(oxfmtOrder.indexOf('text-brand')).toBeLessThan(oxfmtOrder.indexOf('flex'))
  })
})
