import { resolve } from 'node:path'
import { beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const COMPONENTS_ENTRY_POINT = resolve(__dirname, '../fixtures/with-components.css')
const ANIMATE_ENTRY_POINT = resolve(__dirname, '../fixtures/with-tailwindcss-animate.css')
const TW_ANIMATE_CSS_ENTRY_POINT = resolve(__dirname, '../fixtures/with-tw-animate-css.css')

// Pre-load the design system singleton so rules find it
beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

runWithFixture(ruleTester, 'no-unknown-classes', noUnknownClasses, ENTRY_POINT, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="bg-blue-500 text-white p-4" />', filename: 'test.tsx' },
    { code: '<div className="hover:bg-blue-700" />', filename: 'test.tsx' },
    { code: '<div className="bg-[#123456]" />', filename: 'test.tsx' },
    { code: '<div className="w-[200px]" />', filename: 'test.tsx' },
    // Typed CSS-variable shorthand (#76): `(type:--var)` is a valid v4 utility
    // (the `:` is a type hint, not a variant separator) — and it's the exact
    // form enforce-canonical rewrites the `[type:var(--x)]` long form into, so
    // no-unknown-classes must accept it or the two rules contradict each other.
    { code: '<div className="border-(length:--stroke)" />', filename: 'test.tsx' },
    { code: '<div className="bg-(color:--brand)" />', filename: 'test.tsx' },
    { code: '<div className="text-(length:--fs)" />', filename: 'test.tsx' },
    { code: '<div className="border-(--stroke)" />', filename: 'test.tsx' },
    { code: '<div className="hover:border-(length:--stroke)" />', filename: 'test.tsx' },
    { code: 'cn("flex", "items-center")', filename: 'test.tsx' },
    // Variable: name doesn't match pattern — should be ignored
    { code: 'const foo = "fex"', filename: 'test.tsx' },
    // Important modifier on valid class
    { code: '<div className="!flex" />', filename: 'test.tsx' },
    { code: '<div className="!items-center" />', filename: 'test.tsx' },
    // Suffix ! (Tailwind CSS v4 important syntax)
    { code: '<div className="flex!" />', filename: 'test.tsx' },
    { code: '<div className="items-center!" />', filename: 'test.tsx' },
    // Opacity modifiers
    { code: '<div className="bg-black/80" />', filename: 'test.tsx' },
    { code: '<div className="bg-blue-500/50 text-white/90" />', filename: 'test.tsx' },
    // Container query marking utilities (#37). Tailwind's getClassList() omits
    // @container-size (container-type: size), but it is a valid v4 utility.
    { code: '<div className="@container" />', filename: 'test.tsx' },
    { code: '<div className="@container-normal" />', filename: 'test.tsx' },
    { code: '<div className="@container-size" />', filename: 'test.tsx' },
    {
      code: '<div className="@container-size pointer-events-none absolute inset-0" />',
      filename: 'test.tsx',
    },
    // Named containers via the /name slash modifier
    { code: '<div className="@container/main" />', filename: 'test.tsx' },
    { code: '<div className="@container-size/main" />', filename: 'test.tsx' },
    // Container query variants resolve through their base utility
    { code: '<div className="@sm:flex @max-md:flex-row" />', filename: 'test.tsx' },
    // Other utilities valid in v4 but missing from getClassList() (#37):
    // special-cased compiler utilities (filter:none reset, max-width:100vw)…
    { code: '<div className="filter-none backdrop-filter-none" />', filename: 'test.tsx' },
    { code: '<div className="max-w-screen" />', filename: 'test.tsx' },
    // …negative utilities whose negative form getClassList() omits…
    { code: '<div className="-hue-rotate-45 -backdrop-hue-rotate-30" />', filename: 'test.tsx' },
    { code: '<div className="-col-1 -row-2 -col-13" />', filename: 'test.tsx' },
    // …and v3 position spellings (still valid CSS; enforce-canonical rewrites them)
    { code: '<div className="bg-left-top object-right-bottom" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="fex items-center" />',
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'unknownWithSuggestion',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'fex', replacement: 'flex' },
              output: '<div className="flex items-center" />',
            },
          ],
        },
      ],
    },
    {
      code: '<div className="itms-center" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknownWithSuggestion' }],
    },
    {
      code: '<div className="not-a-real-class" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknown' }],
    },
    // Variable detection: typo in className variable
    {
      code: 'const classes = "fex"',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknownWithSuggestion' }],
    },
    // Important modifier on invalid class
    {
      code: '<div className="!itms-center" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknownWithSuggestion' }],
    },
    // R-M2: suffix `!` must be preserved on the suggestion, not dropped
    {
      code: '<div className="flexx!" />',
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'unknownWithSuggestion',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'flexx!', replacement: 'flex!' },
              output: '<div className="flex!" />',
            },
          ],
        },
      ],
    },
    // R-M2: a typo behind a variant must still get a suggestion (look up the
    // bare utility, not the variant-prefixed string), and keep the variant
    {
      code: '<div className="hover:flexx" />',
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'unknownWithSuggestion',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'hover:flexx', replacement: 'hover:flex' },
              output: '<div className="hover:flex" />',
            },
          ],
        },
      ],
    },
    // Multiple unknown classes in same string
    {
      code: '<div className="itms-center fex bg-blu-500" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'unknownWithSuggestion' },
        { messageId: 'unknownWithSuggestion' },
        { messageId: 'unknownWithSuggestion' },
      ],
    },
  ],
})

// --- tw-classed: template literal as first arg (#9) ---

describe('tw-classed template literal', () => {
  const classedTester = new RuleTester()

  runWithFixture(
    classedTester,
    'no-unknown-classes (classed template literal)',
    noUnknownClasses,
    ENTRY_POINT,
    {
      valid: [
        // First arg as string literal — element type skipped
        { code: 'classed("div", "truncate")', filename: 'test.tsx' },
        // First arg as template literal — element type should also be skipped (#9)
        { code: 'classed(`div`, "truncate")', filename: 'test.tsx' },
        { code: 'classed(`button`, "flex items-center")', filename: 'test.tsx' },
        // Component reference as first arg
        { code: 'classed(Button, "flex")', filename: 'test.tsx' },
      ],
      invalid: [
        // Unknown class in second arg should still be detected
        {
          code: 'classed(`div`, "fex")',
          filename: 'test.tsx',
          errors: [{ messageId: 'unknownWithSuggestion' }],
        },
        {
          code: 'classed("div", "fex")',
          filename: 'test.tsx',
          errors: [{ messageId: 'unknownWithSuggestion' }],
        },
      ],
    },
  )
})

// Test with component classes
describe('component classes', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(COMPONENTS_ENTRY_POINT)
  })

  const componentTester = new RuleTester()

  runWithFixture(
    componentTester,
    'no-unknown-classes (with components)',
    noUnknownClasses,
    COMPONENTS_ENTRY_POINT,
    {
      valid: [
        // Component classes should be recognized as valid
        { code: '<div className="btn" />', filename: 'test.tsx' },
        { code: '<div className="card" />', filename: 'test.tsx' },
        // Regular Tailwind classes still valid
        { code: '<div className="flex p-4" />', filename: 'test.tsx' },
      ],
      invalid: [
        {
          code: '<div className="fake-component" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'unknown' }],
        },
      ],
    },
  )
})

describe('tailwindcss-animate classes', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ANIMATE_ENTRY_POINT)
  })

  const animateTester = new RuleTester()

  runWithFixture(
    animateTester,
    'no-unknown-classes (tailwindcss-animate)',
    noUnknownClasses,
    ANIMATE_ENTRY_POINT,
    {
      valid: [
        { code: '<div className="animate-in fade-in zoom-in" />', filename: 'test.tsx' },
        {
          code: '<div className="animate-out fade-out slide-out-to-right-96" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="direction-alternate-reverse fill-mode-both repeat-infinite" />',
          filename: 'test.tsx',
        },
        { code: '<div className="fill-mode-[forwards,backwards]" />', filename: 'test.tsx' },
        { code: '<div className="running paused motion-safe:animate-in" />', filename: 'test.tsx' },
      ],
      invalid: [
        {
          code: '<div className="animate-ins fade-in" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'unknownWithSuggestion' }],
        },
      ],
    },
  )
})

describe('tw-animate-css classes', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(TW_ANIMATE_CSS_ENTRY_POINT)
  })

  const tester = new RuleTester()

  runWithFixture(
    tester,
    'no-unknown-classes (tw-animate-css)',
    noUnknownClasses,
    TW_ANIMATE_CSS_ENTRY_POINT,
    {
      valid: [
        { code: '<div className="animate-in fade-in zoom-in spin-in" />', filename: 'test.tsx' },
        {
          code: '<div className="animate-out fade-out zoom-out slide-out-to-right-96" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="direction-alternate-reverse fill-mode-both repeat-infinite" />',
          filename: 'test.tsx',
        },
        { code: '<div className="running paused motion-safe:animate-in" />', filename: 'test.tsx' },
        {
          code: '<div className="blur-in blur-out blur-in-30 blur-out-12" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="slide-in-from-start slide-out-to-end-8" />',
          filename: 'test.tsx',
        },
        { code: '<div className="play-state-initial" />', filename: 'test.tsx' },
        {
          code: '<div className="animate-accordion-down animate-accordion-up" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="animate-collapsible-down animate-collapsible-up" />',
          filename: 'test.tsx',
        },
        { code: '<div className="animate-caret-blink" />', filename: 'test.tsx' },
      ],
      invalid: [
        {
          code: '<div className="animate-ins blur-in" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'unknownWithSuggestion' }],
        },
      ],
    },
  )
})

/**
 * Classes the tolerant validity check used to wave through.
 *
 * Two holes, both of which looked like coverage: `isValid` strips the variants
 * before validating (so a typo'd variant was never seen at all), and it accepts
 * anything SHAPED like a dynamic value (so `bg-red-5000` passed for the same
 * reason `w-45` legitimately does). Both are now settled by asking the design
 * system, which is also why the valid lists below matter more than the invalid
 * ones: reporting a real variant would be far worse than missing a typo.
 */
describe('exact validation against the design system', () => {
  runWithFixture(new RuleTester(), 'unknown variants', noUnknownClasses, ENTRY_POINT, {
    valid: [
      // Static, functional, compound, arbitrary, container and structural
      // variants — none of these are in `variantOrder`, and all of them compile.
      { code: '<div className="hover:flex" />', filename: 'test.tsx' },
      { code: '<div className="dark:md:flex" />', filename: 'test.tsx' },
      { code: '<div className="group-hover:flex" />', filename: 'test.tsx' },
      { code: '<div className="peer-checked:flex" />', filename: 'test.tsx' },
      { code: '<div className="data-[state=open]:flex" />', filename: 'test.tsx' },
      { code: '<div className="aria-checked:flex" />', filename: 'test.tsx' },
      { code: '<div className="supports-[display:grid]:flex" />', filename: 'test.tsx' },
      { code: '<div className="@md:flex" />', filename: 'test.tsx' },
      { code: '<div className="@min-[400px]:flex" />', filename: 'test.tsx' },
      { code: '<div className="max-md:flex" />', filename: 'test.tsx' },
      { code: '<div className="min-[600px]:flex" />', filename: 'test.tsx' },
      { code: '<div className="nth-3:flex" />', filename: 'test.tsx' },
      { code: '<div className="not-hover:flex" />', filename: 'test.tsx' },
      { code: '<div className="has-[a]:flex" />', filename: 'test.tsx' },
      { code: '<div className="in-[.sidebar]:flex" />', filename: 'test.tsx' },
      { code: '<div className="starting:flex" />', filename: 'test.tsx' },
      { code: '<div className="open:flex" />', filename: 'test.tsx' },
      { code: '<div className="[&>svg]:flex" />', filename: 'test.tsx' },
      { code: '<div className="*:flex" />', filename: 'test.tsx' },
      { code: '<div className="**:flex" />', filename: 'test.tsx' },
      { code: '<div className="group-hover:before:flex" />', filename: 'test.tsx' },
      // Silly but valid: Tailwind compiles a repeated variant.
      { code: '<div className="hover:hover:flex" />', filename: 'test.tsx' },
      { code: '<div className="hover:w-[200px]" />', filename: 'test.tsx' },
    ],
    invalid: [
      // The typo is in the variant, and its neighbour is confirmed against the
      // design system before being suggested.
      {
        code: '<div className="hoverr:flex" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'unknownVariantWithSuggestion',
            data: { className: 'hoverr:flex', variant: 'hoverr', suggestion: 'hover' },
            suggestions: [
              {
                messageId: 'suggestReplace',
                data: { className: 'hoverr:flex', replacement: 'hover:flex' },
                output: '<div className="hover:flex" />',
              },
            ],
          },
        ],
      },
      {
        code: '<div className="darkk:size-4" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownVariantWithSuggestion' }],
      },
      {
        code: '<div className="opne:flex" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownVariantWithSuggestion' }],
      },
      // Compound variants keep their root: only the tail is corrected.
      {
        code: '<div className="group-hoverr:flex" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'unknownVariantWithSuggestion',
            data: {
              className: 'group-hoverr:flex',
              variant: 'group-hoverr',
              suggestion: 'group-hover',
            },
            suggestions: [
              {
                messageId: 'suggestReplace',
                data: { className: 'group-hoverr:flex', replacement: 'group-hover:flex' },
                output: '<div className="group-hover:flex" />',
              },
            ],
          },
        ],
      },
      {
        code: '<div className="peer-cheked:flex" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownVariantWithSuggestion' }],
      },
      // A bad variant in the middle of a chain is still the reported one.
      {
        code: '<div className="dark:mdd:flex" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownVariantWithSuggestion' }],
      },
      // No neighbour close enough to offer.
      {
        code: '<div className="zzzzzz:flex" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownVariant' }],
      },
    ],
  })

  runWithFixture(new RuleTester(), 'dynamic values', noUnknownClasses, ENTRY_POINT, {
    valid: [
      // Off-scale numbers, fractions and modifiers Tailwind does compile.
      { code: '<div className="w-45 min-h-17.5 gap-13" />', filename: 'test.tsx' },
      { code: '<div className="grow-999" />', filename: 'test.tsx' },
      { code: '<div className="aspect-3/2" />', filename: 'test.tsx' },
      { code: '<div className="bg-red-500/50" />', filename: 'test.tsx' },
      { code: '<div className="w-1/2 h-1/3" />', filename: 'test.tsx' },
      // Tailwind passes an arbitrary value through verbatim, so this compiles
      // (to nonsense CSS, which is not this rule's call to make).
      { code: '<div className="w-[garbage]" />', filename: 'test.tsx' },
      { code: '<div className="border-1 underline-offset-3" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Same shape as `w-45`, but the design system compiles nothing for it.
      {
        code: '<div className="bg-red-5000" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownWithSuggestion' }],
      },
      // No neighbour: the modifier puts it too far from every known class.
      {
        code: '<div className="bg-red-500/foo" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknown' }],
      },
      {
        code: '<div className="w-[]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownWithSuggestion' }],
      },
    ],
  })
})

/** Project-defined variants: only the design system knows they exist. */
describe('custom variants', () => {
  const CUSTOM_VARIANTS = resolve(__dirname, '../fixtures/with-custom-variants.css')

  runWithFixture(new RuleTester(), 'custom variants', noUnknownClasses, CUSTOM_VARIANTS, {
    valid: [
      { code: '<div className="thumb:size-4" />', filename: 'test.tsx' },
      { code: '<div className="child:mt-4" />', filename: 'test.tsx' },
      // The class a `@custom-variant` selector names is a marker for that
      // variant: it declares nothing, but removing it stops `sidebar-open:*`
      // from matching. Read from the at-rule's selector, so it stays valid.
      { code: '<div className="sidebar-open" />', filename: 'test.tsx' },
      { code: '<div className="sidebar-open:flex" />', filename: 'test.tsx' },
    ],
    invalid: [
      // The suggestion comes from the variants the design system reports, so a
      // project's own `@custom-variant` is spell-checked like a built-in one.
      {
        code: '<div className="thumbb:size-4" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownVariantWithSuggestion' }],
      },
    ],
  })
})

/**
 * Named group/peer markers (#102).
 *
 * `group/menu-item` binds `group-hover/menu-item:` to ONE specific ancestor, and
 * the consumer's compiled selector hard-codes the marker as a class selector —
 * `:is(:where(.group\/menu-item):hover *)`. A class selector matches whole
 * tokens, so bare `group` does not satisfy it: the named marker is required
 * markup, not decoration. Tailwind emits no CSS for the marker itself, which is
 * exactly what made the exact validation of 1.5.0 report it.
 *
 * The `/name` half is user-chosen and Tailwind never checks that it exists, so
 * any NON-EMPTY name is legitimate — including shapes only an arbitrary modifier
 * can reach (`group/*`, `group/a/b`, `peer//x`). The one genuinely dead spelling
 * is the EMPTY name: `group-hover/` compiles to nothing.
 */
describe('named group/peer markers', () => {
  runWithFixture(new RuleTester(), 'markers', noUnknownClasses, ENTRY_POINT, {
    valid: [
      // Bare markers — the case that already worked, kept as the symmetry anchor.
      { code: '<div className="peer group" />', filename: 'test.tsx' },
      // Named markers: the regression.
      { code: '<div className="peer/menu-button" />', filename: 'test.tsx' },
      { code: '<div className="group/menu-item" />', filename: 'test.tsx' },
      { code: '<div className="group/menu-item flex items-center" />', filename: 'test.tsx' },
      // `!` in both positions, and behind a variant chain.
      { code: '<div className="!peer/menu-button" />', filename: 'test.tsx' },
      { code: '<div className="peer/menu-button!" />', filename: 'test.tsx' },
      { code: '<div className="hover:group/menu-item" />', filename: 'test.tsx' },
      // A short name must not be "corrected" to the bare marker: the quick-fix
      // would drop the name and leave every `peer-*/a:` consumer matching
      // nothing. This is the destructive half of the bug.
      { code: '<div className="peer/a" />', filename: 'test.tsx' },
      { code: '<div className="group/1" />', filename: 'test.tsx' },
      // Names reachable only through an arbitrary modifier on the consumer.
      { code: '<div className="group/*" />', filename: 'test.tsx' },
      { code: '<div className="peer//x" />', filename: 'test.tsx' },
      { code: '<div className="group/a/b" />', filename: 'test.tsx' },
      // The other half: the consumers that read the marker. These always
      // compiled, and must keep doing so.
      { code: '<div className="peer-data-[size=sm]/menu-button:top-1" />', filename: 'test.tsx' },
      { code: '<div className="group-hover/menu-item:underline" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Empty name: Tailwind compiles nothing for it, so the existing
      // `Did you mean "peer"?` quick-fix is the right answer.
      {
        code: '<div className="peer/" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'unknownWithSuggestion',
            suggestions: [
              {
                messageId: 'suggestReplace',
                data: { className: 'peer/', replacement: 'peer' },
                output: '<div className="peer" />',
              },
            ],
          },
        ],
      },
      {
        code: '<div className="group/" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownWithSuggestion' }],
      },
      // A typo in the marker itself is not a marker.
      {
        code: '<div className="peerr/menu-button" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknown' }],
      },
      // Still the exact answer for a slash modifier that is NOT a marker: the
      // base produces CSS, so `/foo` has to resolve — and it doesn't.
      {
        code: '<div className="bg-red-500/foo" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknown' }],
      },
    ],
  })

  /**
   * A component class with no CSS of its own (`not-prose` is referenced only
   * through `[class~="not-prose"]` in typography's output) is NOT a marker:
   * `not-prose/x` is not Tailwind syntax. The predicate has to tell the two
   * apart, because both are "in the validity set with zero declarations".
   */
  const TYPOGRAPHY = resolve(__dirname, '../fixtures/with-typography.css')

  runWithFixture(new RuleTester(), 'markers vs component classes', noUnknownClasses, TYPOGRAPHY, {
    valid: [
      { code: '<div className="prose not-prose" />', filename: 'test.tsx' },
      { code: '<div className="group/menu-item peer/menu-button" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="not-prose/x" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknown' }],
      },
    ],
  })
})

/**
 * Class strings copied from real shadcn/ui components.
 *
 * The validation this rule does is now exact rather than tolerant, and the way
 * that goes wrong is by reporting something real. These are the shapes a modern
 * Tailwind codebase actually writes — compound data variants, `has-[…]`,
 * arbitrary selectors, `in-*`, `supports-[…]`, child selectors, colour modifiers —
 * each against the fixture that defines what it needs.
 */
describe('real-world variant chains', () => {
  runWithFixture(
    new RuleTester(),
    'shadcn tokens',
    noUnknownClasses,
    resolve(__dirname, '../fixtures/shadcn.css'),
    {
      valid: [
        { code: '<div className="peer-data-[variant=inset]:bg-sidebar" />', filename: 'test.tsx' },
        {
          code: '<div className="focus-visible:ring-[3px] aria-invalid:ring-destructive/20" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="dark:aria-invalid:ring-destructive/40 md:max-w-[420px]" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="group-data-[collapsible=icon]:opacity-0" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="has-[>svg]:px-3 [&_svg:not([class*=size-])]:size-4" />',
          filename: 'test.tsx',
        },
        { code: '<div className="in-data-[side=left]:cursor-w-resize" />', filename: 'test.tsx' },
        {
          code: '<div className="supports-[backdrop-filter]:bg-white/60" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="[&>[data-slot=x]]:h-4 *:data-[slot=y]:mt-2" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="motion-reduce:transition-none print:hidden" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="[&:has([role=checkbox])]:pr-0 first:*:rounded-l-md" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="bg-primary/90 text-primary-foreground shadow-xs" />',
          filename: 'test.tsx',
        },
      ],
      invalid: [],
    },
  )

  runWithFixture(
    new RuleTester(),
    'animation plugin classes under data variants',
    noUnknownClasses,
    TW_ANIMATE_CSS_ENTRY_POINT,
    {
      valid: [
        {
          code: '<div className="data-[state=open]:animate-in data-[state=closed]:animate-out" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="data-[side=bottom]:slide-in-from-top-2" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="data-[state=open]:zoom-in-95 duration-200" />',
          filename: 'test.tsx',
        },
      ],
      invalid: [],
    },
  )
})
