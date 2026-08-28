import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { preferThemeTokens } from '../../src/rules/prefer-theme-tokens'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { resetExtractorConfig } from '../../src/utils/extractors'
import { runWithFixture } from '../utils/with-fixture'

// Per-test extractor reset — settings are read once and cached on module scope,
// so tests that toggle `settings.tailwindcss.attributes` need a clean slate.
beforeEach(() => {
  resetExtractorConfig()
})

const SHADCN_FIXTURE = resolve(__dirname, '../fixtures/shadcn.css')
const DEFAULT_FIXTURE = resolve(__dirname, '../fixtures/default.css')

describe('prefer-theme-tokens (shadcn-style theme)', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(SHADCN_FIXTURE)
  })

  const ruleTester = new RuleTester()

  runWithFixture(ruleTester, 'prefer-theme-tokens', preferThemeTokens, SHADCN_FIXTURE, {
    valid: [
      // Already using the named token
      { code: '<div className="border-border bg-primary" />', filename: 'test.tsx' },
      // Raw variable with no matching named utility — leave as-is
      { code: '<div className="border-(--no-such-token)" />', filename: 'test.tsx' },
      { code: '<div className="bg-[var(--no-such-token)]" />', filename: 'test.tsx' },
      // Plain Tailwind classes
      { code: '<div className="flex items-center p-4" />', filename: 'test.tsx' },
      // Arbitrary value that is not a CSS variable reference
      { code: '<div className="bg-[#ff0000] w-[200px]" />', filename: 'test.tsx' },
      // Variable name does not produce a valid named candidate
      // `rounded-(--radius)` → `rounded-radius` is not a utility (the named is `rounded-sm`),
      // so the rule must not fire.
      { code: '<div className="rounded-(--radius)" />', filename: 'test.tsx' },
      // `rounded-(--radius-sm)` is CSS-equivalent to `rounded-sm` and handled by
      // enforce-canonical / no-unnecessary-arbitrary-value. The named candidate
      // `rounded-radius-sm` is not a real utility, so this rule must not fire.
      { code: '<div className="rounded-(--radius-sm)" />', filename: 'test.tsx' },
      // Unknown prefix
      { code: '<div className="nonexistent-(--border)" />', filename: 'test.tsx' },
      // Directional sub-utility with unknown variable
      { code: '<div className="border-l-(--no-such-token)" />', filename: 'test.tsx' },
      // Bracket form is CSS-equivalent to `border-border` with this fixture —
      // owned by no-unnecessary-arbitrary-value; the getNamedEquivalent guard silences this rule.
      { code: '<div className="border-[var(--border)]" />', filename: 'test.tsx' },
      // The color side has no named token (`fill-color` does not exist), so the class is valid
      // Tailwind and must NEVER be rewritten — regardless of the opacity-modifier form. Deciding
      // by the base token (not the modifier) covers every modifier shape at once: the CSS-variable
      // forms and the arbitrary-bracket forms that a tolerant validity check would leak through.
      { code: '<svg className="fill-(--color)/(--opacity)" />', filename: 'test.tsx' },
      { code: '<svg className="fill-[var(--color)]/(--opacity)" />', filename: 'test.tsx' },
      { code: '<svg className="fill-(--color)/[var(--opacity)]" />', filename: 'test.tsx' },
      { code: '<svg className="fill-(--color)/[0.8]" />', filename: 'test.tsx' },
      { code: '<svg className="fill-(--color)/[50%]" />', filename: 'test.tsx' },
      { code: '<svg className="fill-[var(--color)]/[0.8]" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Paren shorthand — the case from the issue
      {
        code: '<div className="border-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="border-border" />',
      },
      // Two offenders in same string — first gets the auto-fix, the rest get a suggestion
      {
        code: '<div className="bg-(--primary) text-(--background)" />',
        filename: 'test.tsx',
        errors: [
          { messageId: 'preferNamed' },
          {
            messageId: 'preferNamed',
            suggestions: [
              {
                messageId: 'suggestReplace',
                data: { className: 'text-(--background)', replacement: 'text-background' },
                output: '<div className="bg-primary text-background" />',
              },
            ],
          },
        ],
        output: '<div className="bg-primary text-background" />',
      },
      // Variant prefix preserved
      {
        code: '<div className="hover:border-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="hover:border-border" />',
      },
      // Multiple variants
      {
        code: '<div className="dark:hover:border-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="dark:hover:border-border" />',
      },
      // Arbitrary variant
      {
        code: '<div className="[&>svg]:border-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="[&>svg]:border-border" />',
      },
      // Important prefix preserved
      {
        code: '<div className="!border-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="!border-border" />',
      },
      // Important suffix preserved
      {
        code: '<div className="border-(--border)!" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="border-border!" />',
      },
      // Variant + important prefix
      {
        code: '<div className="hover:!border-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="hover:!border-border" />',
      },
      // Opacity modifier preserved
      {
        code: '<div className="bg-(--primary)/80" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-primary/80" />',
      },
      // Bracket form with modifier
      {
        code: '<div className="bg-[var(--primary)]/50" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-primary/50" />',
      },
      // Color side HAS a named token (`bg-primary`) and the opacity is a CSS variable — the
      // rewrite is legitimate and must still fire, keeping the variable modifier verbatim.
      // Deciding by the base token (not the modifier shape) preserves these.
      {
        code: '<div className="bg-(--primary)/(--opacity)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-primary/(--opacity)" />',
      },
      {
        code: '<div className="bg-[var(--primary)]/(--opacity)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-primary/(--opacity)" />',
      },
      {
        code: '<div className="bg-(--primary)/[0.5]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-primary/[0.5]" />',
      },
      // Directional sub-utility (border-l, border-x, etc.)
      {
        code: '<div className="border-l-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="border-l-border" />',
      },
      // Mix of valid and invalid in same string
      {
        code: '<div className="flex border-(--border) p-4" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="flex border-border p-4" />',
      },
      // Extractor: cn() callee
      {
        code: 'cn("border-(--border) flex")',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: 'cn("border-border flex")',
      },
      // Extractor: cva() with variants
      {
        code: 'cva("base", { variants: { color: { primary: "border-(--border)" } } })',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: 'cva("base", { variants: { color: { primary: "border-border" } } })',
      },
      // Extractor: tv() with slots — each slot is a separate ClassLocation,
      // so each gets its own auto-fix (no suggestions).
      {
        code: 'tv({ slots: { root: "border-(--border)", label: "bg-(--primary)" } })',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }, { messageId: 'preferNamed' }],
        output: 'tv({ slots: { root: "border-border", label: "bg-primary" } })',
      },
      // Extractor: variable named className
      {
        code: 'const className = "border-(--border)"',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: 'const className = "border-border"',
      },
      // Extractor: JSX object value (classNames prop). Requires opting `classNames`
      // into settings.attributes — `className`/`class` are the only attributes by default.
      {
        code: '<div classNames={{ root: "border-(--border)" }} />',
        filename: 'test.tsx',
        settings: { tailwindcss: { attributes: ['classNames'] } },
        errors: [{ messageId: 'preferNamed' }],
        output: '<div classNames={{ root: "border-border" }} />',
      },
      // Template literal: preserve trailing space before expression
      {
        code: '<div className={`flex border-(--border) ${x}`} />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className={`flex border-border ${x}`} />',
      },
    ],
  })
})

describe('prefer-theme-tokens (no overlap with other rules)', () => {
  // Default Tailwind theme defines --color-red-500 directly, so
  // bg-[var(--color-red-500)] is CSS-equivalent to bg-red-500. That case is
  // owned by no-unnecessary-arbitrary-value — prefer-theme-tokens must NOT
  // also fire on it (avoid double-reports for the exact same fix).
  //
  // The paren form `bg-(--color-red-500)` is owned by enforce-canonical
  // (canonicalizeCandidates resolves theme-token references with the standard
  // utility prefix). prefer-theme-tokens stays silent on these too — its
  // candidate `bg-color-red-500` isn't a real utility.
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(DEFAULT_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  const ruleTester = new RuleTester()

  runWithFixture(ruleTester, 'prefer-theme-tokens', preferThemeTokens, DEFAULT_FIXTURE, {
    valid: [
      // Bracket form CSS-equivalent — handled by no-unnecessary-arbitrary-value
      { code: '<div className="bg-[var(--color-red-500)]" />', filename: 'test.tsx' },
      { code: '<div className="text-[var(--color-blue-700)]" />', filename: 'test.tsx' },
      // Paren form for a theme-prefixed token — handled by enforce-canonical
      { code: '<div className="bg-(--color-red-500)" />', filename: 'test.tsx' },
    ],
    invalid: [
      // When the user references the variable WITHOUT the standard `color-`
      // prefix and a matching utility exists, this rule fires. enforce-canonical
      // would not transform this case (the CSS differs), so prefer-theme-tokens
      // is the only rule that catches it.
      {
        code: '<div className="bg-(--red-500)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: '<div className="bg-red-500" />',
      },
    ],
  })
})

describe('prefer-theme-tokens (fail-loud when entryPoint is missing)', () => {
  beforeAll(() => {
    resetDesignSystem()
  })

  const ruleTester = new RuleTester()

  // No `settings.tailwindcss.entryPoint` provided. v1 surfaces a single
  // `designSystemUnavailable` diagnostic per location instead of silently
  // skipping. The graceful-degradation behavior was removed.
  ruleTester.run('prefer-theme-tokens', preferThemeTokens, {
    valid: [],
    invalid: [
      {
        code: '<div className="border-(--border)" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'designSystemUnavailable' }],
      },
    ],
  })
})
