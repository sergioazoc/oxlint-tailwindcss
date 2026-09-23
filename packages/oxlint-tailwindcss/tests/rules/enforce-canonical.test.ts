import { resolve } from 'node:path'
import { beforeAll } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

runWithFixture(ruleTester, 'enforce-canonical', enforceCanonical, ENTRY_POINT, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="bg-blue-500 p-4" />', filename: 'test.tsx' },
    { code: '<div className="m-0" />', filename: 'test.tsx' },
    // Important modifier: position is not enforce-canonical's concern
    { code: '<div className="!rounded-lg" />', filename: 'test.tsx' },
    { code: '<div className="rounded-lg!" />', filename: 'test.tsx' },
    // #78: a literal arbitrary value is NOT canonicalized to a var-backed token.
    // `p-0.5` compiles to `calc(var(--spacing) * 0.5)`, `rounded-sm` to
    // `var(--radius-sm)`, etc. — canonicalizeCandidates matches them against the
    // compile-time theme, but a `:root` override (the standard shadcn `--radius`
    // /`--spacing` pattern) makes them non-equivalent, so autofixing would
    // silently change the design. Only value-preserving (byte-equal CSS)
    // conversions are enforced; these literal→token ones are left as written.
    { code: '<div className="p-[2px]" />', filename: 'test.tsx' },
    { code: '<div className="max-w-[400px]" />', filename: 'test.tsx' },
    { code: '<div className="rounded-[4px]" />', filename: 'test.tsx' },
    { code: '<div className="start-[10px]" />', filename: 'test.tsx' },
    { code: '<div className="hover:p-[2px]" />', filename: 'test.tsx' },
    { code: '<div className="!p-[2px]" />', filename: 'test.tsx' },
    { code: '<div className="p-[2px] max-w-[400px] flex" />', filename: 'test.tsx' },
    // theme(spacing.1) (compile-time literal 0.25rem) → --spacing(1) (runtime
    // var(--spacing)) is the same literal→var hazard, so it is left as written.
    { code: '<div className="[--w-padding:theme(spacing.1)]" />', filename: 'test.tsx' },
    // #156: the #78 guard still holds under a variant — `text-white` reads
    // `var(--color-white)`, not the literal `#fff`.
    { code: '<div className="dark:text-[#fff]" />', filename: 'test.tsx' },
    { code: '<div className="md:rounded-[4px]" />', filename: 'test.tsx' },
    // A variant canonicalization that changes the SELECTOR is not
    // value-preserving: `has-checked:` drops the `:is()` wrapper, `*:` wraps
    // the rule in `:is()` (different specificity). Left as written.
    { code: '<div className="has-[:checked]:flex" />', filename: 'test.tsx' },
    { code: '<div className="[&>*]:flex" />', filename: 'test.tsx' },
    // Already canonical: Tailwind has no shorthand for a valued data attribute.
    { code: '<div className="data-[state=open]:flex" />', filename: 'test.tsx' },
    // #152 under a variant: the pure var-syntax swap is ceded to
    // enforce-consistent-variable-syntax, same as the bare form.
    { code: '<div className="hover:bg-[var(--x)]" />', filename: 'test.tsx' },
  ],
  invalid: [
    // #156: the value-preserving rewrite applies under a variant too. The
    // safe gate used to slice between the first `{` and the last `}`, which
    // under a variant's wrapping at-rule kept the (always differing) escaped
    // class name in the comparison — so no variant-prefixed rewrite ever fired.
    ...(
      [
        ['dark:bg-white/[.08]', 'dark:bg-white/8'],
        ['hover:bg-black/[.06]', 'hover:bg-black/6'],
        ['sm:dark:bg-white/[.08]', 'sm:dark:bg-white/8'],
        ['hover:z-[10]', 'hover:z-10'],
        // Leading digit: the selector escapes it as `\32 xl\:…`.
        ['2xl:z-[10]', '2xl:z-10'],
        ['md:!z-[10]', 'md:!z-10'],
        ['md:z-[10]!', 'md:z-10!'],
        ['[&>svg]:z-[10]', '[&>svg]:z-10'],
        ['group-hover/item:z-[10]', 'group-hover/item:z-10'],
        // Arbitrary VARIANTS Tailwind canonicalizes — never reached the worker
        // before, since only the utility was checked for brackets.
        ['data-[open]:flex', 'data-open:flex'],
        ['aria-[checked=true]:flex', 'aria-checked:flex'],
        ['min-[40rem]:flex', 'sm:flex'],
        ['data-[open]:z-[10]', 'data-open:z-10'],
      ] as const
    ).map(([cls, canonical]) => ({
      code: `<div className="${cls}" />`,
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' as const }],
      output: `<div className="${canonical}" />`,
    })),
    {
      code: '<div className="bg-black dark:bg-white/[.08] hover:bg-black/[.06]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }, { messageId: 'nonCanonical' }],
      output: '<div className="bg-black dark:bg-white/8 hover:bg-black/6" />',
    },
    {
      code: '<div className="-m-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="m-0" />',
    },
    {
      code: '<div className="flex -mt-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="flex mt-0" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex -m-0 ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className={`flex m-0 ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} -m-0`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className={`${base} m-0`} />',
    },
    // Important prefix preserved when bare class is canonicalized
    {
      code: '<div className="!-m-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="!m-0" />',
    },
    // Important suffix preserved when bare class is canonicalized
    {
      code: '<div className="-m-0!" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="m-0!" />',
    },
    // Issue #11: var() syntax canonicalization with opacity modifier. Value-safe
    // (#78): both sides emit `color: color-mix(in oklab, var(--color-text) …)`,
    // so this is a byte-equal syntax normalization, not a literal→token change.
    {
      code: '<div className="text-[var(--color-text)]/90" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="text-(--color-text)/90" />',
    },
    // Multiple non-canonical classes in same string
    {
      code: '<div className="-m-0 -mt-0 flex" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'nonCanonical' },
        {
          messageId: 'nonCanonical',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: '-mt-0', replacement: 'mt-0' },
              output: '<div className="m-0 mt-0 flex" />',
            },
          ],
        },
      ],
      output: '<div className="m-0 mt-0 flex" />',
    },
    // start-*/end-* (logical inset) → inset-s-*/inset-e-*
    //
    // These are the legacy spellings this rule still owns: `start-2` is current
    // Tailwind (what the docs use), just not the canonical form. The v3 RENAMES
    // that used to be tested here — `break-words`, `order-none`,
    // `overflow-ellipsis`, `flex-grow*`, `decoration-*`, `bg-gradient-to-*`, the
    // reordered position spellings — moved to `no-deprecated-classes`; see
    // tests/integration/deprecated-canonical-coexistence.test.ts.
    {
      code: '<div className="start-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="inset-s-2" />',
    },
    {
      code: '<div className="end-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="inset-e-4" />',
    },
    {
      code: '<div className="-start-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="-inset-s-2" />',
    },
    {
      code: '<div className="start-1/2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="inset-s-1/2" />',
    },
    // Arbitrary forms route through the worker (canonicalize-service). This one
    // is value-safe (#78): both `flex-grow-[2]` and `grow-2` emit
    // `flex-grow: 2` (a literal), so the byte-equal check keeps the autofix.
    //
    // It stays this rule's business even though bare `flex-grow` is now
    // `no-deprecated-classes`': the deprecation map holds renamed SPELLINGS, and
    // `flex-grow-[2]` is a value this rule canonicalizes.
    // (`start-[10px]` → `inset-s-2.5` is NOT enforced — 10px vs
    // `calc(var(--spacing) * 2.5)` differ — see the valid block above.)
    {
      code: '<div className="flex-grow-[2]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="grow-2" />',
    },
  ],
})

// #78 regression on a real shadcn theme: `@theme inline { --radius-lg:
// var(--radius); … }` + `:root { --radius: 0.625rem }`. canonicalizeCandidates
// still maps `rounded-[4px]` → `rounded-lg` against the compile-time default,
// but `rounded-lg` resolves to 10px here — so the rule must NOT rewrite it.
// Value-preserving conversions (the var-reference form) still fire.
const SHADCN_ENTRY_POINT = resolve(__dirname, '../fixtures/shadcn.css')

// Pre-warm shadcn alongside default WITHOUT resetting — the loader keeps
// multiple design systems cached (keyed by entry point), and runWithFixture
// injects each case's own entryPoint, so both fixtures coexist.
beforeAll(() => {
  getLoadedDesignSystem(SHADCN_ENTRY_POINT)
})

runWithFixture(
  ruleTester,
  'enforce-canonical (shadcn :root override)',
  enforceCanonical,
  SHADCN_ENTRY_POINT,
  {
    valid: [
      // The design-corrupting conversion from the issue — must stay untouched.
      { code: '<div className="rounded-[4px]" />', filename: 'test.tsx' },
      { code: '<div className="rounded-[10px]" />', filename: 'test.tsx' },
      { code: '<div className="p-[2px]" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Value-preserving (byte-equal) canonicalization still fires: the user
      // already wrote the var, and `rounded-sm` emits the same `var(--radius-sm)`.
      {
        code: '<div className="rounded-[var(--radius-sm)]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="rounded-sm" />',
      },
    ],
  },
)
