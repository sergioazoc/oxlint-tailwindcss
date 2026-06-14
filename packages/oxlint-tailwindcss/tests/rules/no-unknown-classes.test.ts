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
