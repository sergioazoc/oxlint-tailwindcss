/**
 * Coexistence matrix between prefer-theme-tokens and the two related rules
 * (enforce-canonical, no-unnecessary-arbitrary-value).
 *
 * Each input class is run against every rule separately, asserting which rule
 * fires and which stays silent. The goal is to lock in the boundary so future
 * changes don't introduce double-reports or missed cases.
 *
 * Default theme matrix:
 *
 *   ┌────────────────────────────┬──────────┬─────────────┬────────────┐
 *   │ input                      │ canon    │ no-unnec    │ prefer-tt  │
 *   ├────────────────────────────┼──────────┼─────────────┼────────────┤
 *   │ rounded-[var(--radius-sm)] │ fires    │ fires       │ silent     │ (a)
 *   │ rounded-(--radius-sm)      │ fires    │ silent      │ silent     │ (b)
 *   │ bg-(--red-500)             │ silent   │ silent      │ fires      │ (c)
 *   │ bg-[var(--red-500)]        │ fires*   │ silent      │ fires      │ (d)
 *   └────────────────────────────┴──────────┴─────────────┴────────────┘
 *   *enforce-canonical only changes the bracket→paren syntax.
 *
 *   (a) Bracket form CSS-equivalent to the named utility — both canon and
 *       no-unnec produce `rounded-sm`. prefer-theme-tokens stays silent
 *       because its candidate `rounded-radius-sm` is not a real utility.
 *   (b) Paren form is owned by canonicalizeCandidates (theme-token resolution).
 *       no-unnec only handles bracket form. prefer-theme-tokens silent for
 *       the same reason as (a).
 *   (c) Raw variable matching utility suffix — only prefer-theme-tokens catches
 *       it (canonicalizeCandidates only resolves theme-token names).
 *   (d) Bracket form of (c) — canonicalizeCandidates rewrites the syntax,
 *       prefer-theme-tokens rewrites to the named utility directly.
 *
 * Theme-token matrix where `--color-X` exposes the raw variable directly
 * (e.g. `@theme inline { --color-border: var(--border); }`, no wrapping
 * color function):
 *
 *   ┌────────────────────────────┬──────────┬─────────────┬────────────┐
 *   │ input                      │ canon    │ no-unnec    │ prefer-tt  │
 *   ├────────────────────────────┼──────────┼─────────────┼────────────┤
 *   │ border-(--border)          │ silent   │ silent      │ fires      │
 *   │ border-[var(--border)]     │ fires*   │ fires       │ silent     │
 *   │ border-(--no-such-var)     │ silent   │ silent      │ silent     │
 *   └────────────────────────────┴──────────┴─────────────┴────────────┘
 *   *Only the bracket→paren syntax change. no-unnec fires because the
 *   bracket form is CSS-equivalent to border-border (both compile to
 *   `border-color: var(--border)`). prefer-tt stays silent on the bracket
 *   form thanks to its getNamedEquivalent guard — no-unnec owns it.
 */

import { resolve } from 'node:path'
import { afterAll, beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { preferThemeTokens } from '../../src/rules/prefer-theme-tokens'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { noUnnecessaryArbitraryValue } from '../../src/rules/no-unnecessary-arbitrary-value'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { resetCanonicalizeService } from '../../src/design-system/canonicalize-service'

const SHADCN_FIXTURE = resolve(__dirname, '../fixtures/shadcn.css')
const DEFAULT_FIXTURE = resolve(__dirname, '../fixtures/default.css')

describe('prefer-theme-tokens coexistence (default theme)', () => {
  beforeAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
    getLoadedDesignSystem(DEFAULT_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
  })

  // ── enforce-canonical ────────────────────────────────────────────
  new RuleTester().run('enforce-canonical (default theme)', enforceCanonical, {
    valid: [
      // Already canonical
      { code: '<div className="rounded-sm" />', filename: 'test.tsx' },
      { code: '<div className="bg-red-500" />', filename: 'test.tsx' },
      // Variable name does not match a theme token — left as-is
      { code: '<div className="bg-(--red-500)" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Theme-token bracket → named (a)
      {
        code: '<div className="rounded-[var(--radius-sm)]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="rounded-sm" />',
      },
      // Theme-token paren → named (b)
      {
        code: '<div className="rounded-(--radius-sm)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="rounded-sm" />',
      },
      // Non-theme-token bracket → only the syntax canonicalizes (d)
      {
        code: '<div className="bg-[var(--red-500)]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="bg-(--red-500)" />',
      },
    ],
  })

  // ── no-unnecessary-arbitrary-value ──────────────────────────────
  new RuleTester().run(
    'no-unnecessary-arbitrary-value (default theme)',
    noUnnecessaryArbitraryValue,
    {
      valid: [
        // Paren shorthand is owned by enforce-canonical
        { code: '<div className="rounded-(--radius-sm)" />', filename: 'test.tsx' },
        { code: '<div className="bg-(--red-500)" />', filename: 'test.tsx' },
        // Bracket form whose CSS does not match any named utility
        { code: '<div className="bg-[var(--red-500)]" />', filename: 'test.tsx' },
      ],
      invalid: [
        // Bracket form CSS-equivalent to named utility (a)
        {
          code: '<div className="rounded-[var(--radius-sm)]" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'unnecessaryArbitrary' }],
          output: '<div className="rounded-sm" />',
        },
      ],
    },
  )

  // ── prefer-theme-tokens ─────────────────────────────────────────
  new RuleTester().run('prefer-theme-tokens (default theme)', preferThemeTokens, {
    valid: [
      // Theme-prefixed token cases are owned by enforce-canonical / no-unnec.
      // prefer-theme-tokens' candidate `rounded-radius-sm` isn't a real utility.
      { code: '<div className="rounded-(--radius-sm)" />', filename: 'test.tsx' },
      { code: '<div className="rounded-[var(--radius-sm)]" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Raw variable matching utility suffix → only this rule catches it (c, d)
      {
        code: '<div className="bg-(--red-500)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-red-500" />',
      },
      {
        code: '<div className="bg-[var(--red-500)]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-red-500" />',
      },
    ],
  })
})

describe('prefer-theme-tokens coexistence (shadcn-style theme)', () => {
  beforeAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
    getLoadedDesignSystem(SHADCN_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
  })

  // ── enforce-canonical ────────────────────────────────────────────
  // With this fixture, `--border` is NOT itself a theme token (`--color-border`
  // is, and it points to `--border`). canonicalizeCandidates therefore only
  // changes the bracket→paren syntax — it does not produce border-border.
  new RuleTester().run('enforce-canonical (shadcn theme)', enforceCanonical, {
    valid: [
      { code: '<div className="border-(--border)" />', filename: 'test.tsx' },
      { code: '<div className="border-border" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="border-[var(--border)]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="border-(--border)" />',
      },
    ],
  })

  // ── no-unnecessary-arbitrary-value ──────────────────────────────
  // With this fixture, `--color-border` resolves directly to `var(--border)`,
  // so border-[var(--border)] is CSS-equivalent to border-border.
  new RuleTester().run(
    'no-unnecessary-arbitrary-value (shadcn theme)',
    noUnnecessaryArbitraryValue,
    {
      valid: [{ code: '<div className="border-(--border)" />', filename: 'test.tsx' }],
      invalid: [
        {
          code: '<div className="border-[var(--border)]" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'unnecessaryArbitrary' }],
          output: '<div className="border-border" />',
        },
      ],
    },
  )

  // ── prefer-theme-tokens ─────────────────────────────────────────
  // Bracket form is owned by no-unnecessary-arbitrary-value (CSS-equivalent),
  // so prefer-theme-tokens' getNamedEquivalent guard silences it here.
  new RuleTester().run('prefer-theme-tokens (shadcn theme)', preferThemeTokens, {
    valid: [
      { code: '<div className="border-(--no-such-var)" />', filename: 'test.tsx' },
      { code: '<div className="border-border" />', filename: 'test.tsx' },
      { code: '<div className="border-[var(--border)]" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="border-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="border-border" />',
      },
    ],
  })
})

// Convergence property
// ─────────────────────
// Both rules + enforce-canonical converge on `border-border` regardless of
// which fix oxlint applies first:
//
//   border-[var(--border)]
//     → no-unnec → border-border  (single step)
//     → enforce-canonical → border-(--border) → prefer-tt → border-border
//
// The valid/invalid blocks above lock down each rule's behavior on both the
// intermediate (`border-(--border)`) and the input (`border-[var(--border)]`)
// shapes, so any future regression that breaks convergence will fail one of
// those test cases.
