/**
 * Shadcn/ui compatibility matrix.
 *
 * Uses tests/fixtures/shadcn.css — the actual globals.css produced by
 *   pnpm dlx shadcn@latest init --preset b0 --template next --rtl
 * Both --base radix and --base base presets generate identical theme CSS.
 *
 * Asserts that the canonical shadcn class surface (border-border, bg-card,
 * text-muted-foreground, ring-ring, sidebar-*, chart-1..5, with /opacity
 * and dark variants) does not trigger false-positives on correctness rules,
 * and that bracket↔paren↔named convergence works for multi-segment tokens.
 */

import { resolve } from 'node:path'
import { afterAll, beforeAll, describe } from 'vitest'
import { makeFixtureRunner } from '../utils/with-fixture'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { noDeprecatedClasses } from '../../src/rules/no-deprecated-classes'
import { noDuplicateClasses } from '../../src/rules/no-duplicate-classes'
import { noHardcodedColors } from '../../src/rules/no-hardcoded-colors'
import { noUnnecessaryArbitraryValue } from '../../src/rules/no-unnecessary-arbitrary-value'
import { preferThemeTokens } from '../../src/rules/prefer-theme-tokens'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { resetCanonicalizeService } from '../../src/design-system/canonicalize-service'

const SHADCN_FIXTURE = resolve(__dirname, '../fixtures/shadcn.css')

// Class strings lifted verbatim from the button/card/dashboard components
// produced by `pnpm dlx shadcn@latest init`.
const SHADCN_CLASS_STRINGS = [
  // button base
  'inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none',
  // focus + aria-invalid
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
  'dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
  // button variants
  'bg-primary text-primary-foreground',
  'border-border bg-background hover:bg-muted hover:text-foreground',
  'dark:border-input dark:bg-input/30',
  'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  'bg-destructive/10 text-destructive hover:bg-destructive/20',
  'text-primary underline-offset-4 hover:underline',
  // sidebar + chart tokens
  'bg-sidebar text-sidebar-foreground border-sidebar-border',
  'bg-sidebar-primary text-sidebar-primary-foreground',
  'bg-sidebar-accent text-sidebar-accent-foreground',
  'ring-sidebar-ring',
  'fill-chart-1 stroke-chart-2 text-chart-3 bg-chart-4 border-chart-5',
  // card / popover / muted / accent
  'bg-card text-card-foreground rounded-lg border border-border shadow-sm',
  'bg-popover text-popover-foreground rounded-md',
  'bg-muted text-muted-foreground',
  'bg-accent text-accent-foreground',
]

const VALID_SHADCN_CASES = SHADCN_CLASS_STRINGS.map((s) => ({
  code: `<div className="${s}" />`,
  filename: 'test.tsx',
}))

describe('shadcn compatibility', () => {
  const run = makeFixtureRunner(SHADCN_FIXTURE)
  beforeAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
    getLoadedDesignSystem(SHADCN_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
  })

  run('no-unknown-classes', noUnknownClasses, {
    valid: VALID_SHADCN_CASES,
    invalid: [],
  })

  run('no-conflicting-classes', noConflictingClasses, {
    valid: VALID_SHADCN_CASES,
    invalid: [],
  })

  run('no-deprecated-classes', noDeprecatedClasses, {
    valid: VALID_SHADCN_CASES,
    invalid: [],
  })

  run('no-duplicate-classes', noDuplicateClasses, {
    valid: VALID_SHADCN_CASES,
    invalid: [],
  })

  // hsl(var(--…)) / rgb(var(--…)) / oklch(var(--…)) reference theme tokens
  // and must not be flagged as hardcoded.
  run('no-hardcoded-colors', noHardcodedColors, {
    valid: [
      ...VALID_SHADCN_CASES,
      { code: '<div className="bg-[hsl(var(--primary))]" />', filename: 'test.tsx' },
      { code: '<div className="text-[hsla(var(--foreground),0.8)]" />', filename: 'test.tsx' },
      { code: '<div className="border-[rgb(var(--border))]" />', filename: 'test.tsx' },
      { code: '<div className="bg-[oklch(var(--background))]" />', filename: 'test.tsx' },
    ],
    invalid: [],
  })

  run('no-unnecessary-arbitrary-value', noUnnecessaryArbitraryValue, {
    valid: VALID_SHADCN_CASES,
    invalid: [],
  })

  // Multi-segment shadcn tokens convert paren/bracket forms of raw vars
  // (--card-foreground) directly to the named utility.
  run('prefer-theme-tokens on multi-segment vars', preferThemeTokens, {
    valid: [{ code: '<div className="bg-card-foreground" />', filename: 'test.tsx' }],
    invalid: [
      {
        code: '<div className="bg-(--card-foreground)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-card-foreground" />',
      },
      {
        code: '<div className="text-(--muted-foreground)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="text-muted-foreground" />',
      },
    ],
  })

  // Theme-token references collapse to the named utility via canonicalizeCandidates.
  run('enforce-canonical on multi-segment tokens', enforceCanonical, {
    valid: [
      { code: '<div className="bg-card-foreground" />', filename: 'test.tsx' },
      { code: '<div className="text-muted-foreground" />', filename: 'test.tsx' },
      { code: '<div className="bg-(--card-foreground)" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="bg-[var(--color-card-foreground)]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="bg-card-foreground" />',
      },
      {
        code: '<div className="bg-(--color-card-foreground)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="bg-card-foreground" />',
      },
    ],
  })
})
