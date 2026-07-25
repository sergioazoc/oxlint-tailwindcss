import { resolve } from 'node:path'
import { describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforceShorthand } from '../../src/rules/enforce-shorthand'
import { makeFixtureRunner } from '../utils/with-fixture'

const ruleTester = new RuleTester()

ruleTester.run('enforce-shorthand', enforceShorthand, {
  valid: [
    { code: '<div className="m-2" />', filename: 'test.tsx' },
    { code: '<div className="p-4 flex" />', filename: 'test.tsx' },
    { code: '<div className="mt-2 mr-4" />', filename: 'test.tsx' },
    { code: '<div className="size-full" />', filename: 'test.tsx' },
    // `w-screen` is 100vw and `h-screen` is 100vh — and `size-screen` doesn't
    // even exist. Rejected with no design system because `screen` is not one of
    // the keywords whose axes are known to agree.
    { code: '<div className="w-screen h-screen" />', filename: 'test.tsx' },
    // Shorthand with different variants should NOT be merged
    { code: '<div className="hover:mt-2 focus:mb-2" />', filename: 'test.tsx' },
    { code: '<div className="sm:h-4 md:w-4" />', filename: 'test.tsx' },
    // Partial axes with different values
    { code: '<div className="mt-2 mb-4" />', filename: 'test.tsx' },
    { code: '<div className="px-4 py-2" />', filename: 'test.tsx' },
    { code: '<div className="mx-4 my-2" />', filename: 'test.tsx' },
    { code: '<div className="px-4" />', filename: 'test.tsx' },
    { code: '<div className="py-4" />', filename: 'test.tsx' },
    { code: '<div className="p-4" />', filename: 'test.tsx' },
    { code: '<div className="m-4" />', filename: 'test.tsx' },
    // Axis shorthands with mismatched variants
    { code: '<div className="sm:px-4 md:py-4" />', filename: 'test.tsx' },
    { code: '<div className="hover:px-4 focus:py-4" />', filename: 'test.tsx' },
    // Single axis pair without its partner — no px+py → p-*
    { code: '<div className="px-4 pt-4" />', filename: 'test.tsx' },
    // `scale-110` also writes `--tw-scale-z`, which `scale-3d` reads, so this is
    // NOT a merge — see tests/integration/shorthand-families.test.ts.
    { code: '<div className="scale-x-110 scale-y-110" />', filename: 'test.tsx' },
    // Mismatched values across a new family
    { code: '<div className="border-t-2 border-b-4" />', filename: 'test.tsx' },
    // Adjacent sides are not an axis, so there is nothing to collapse them into.
    { code: '<div className="top-0 right-0" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="mt-2 mr-2 mb-2 ml-2" />',
      filename: 'test.tsx',
      // One diagnostic, not three: the four-side merge consumes the classes, so
      // the `my-2`/`mx-2` halves are no longer reported alongside it.
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="m-2" />',
    },
    {
      code: '<div className="mt-2 mb-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="my-2" />',
    },
    {
      code: '<div className="ml-2 mr-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="mx-2" />',
    },
    {
      code: '<div className="pt-4 pr-4 pb-4 pl-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="p-4" />',
    },
    // Axis pair shorthands → full shorthand (px+py, mx+my)
    {
      code: '<div className="px-4 py-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="p-4" />',
    },
    {
      code: '<div className="py-4 px-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="p-4" />',
    },
    {
      code: '<div className="mx-2 my-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="m-2" />',
    },
    {
      code: '<div className="flex px-4 py-4 gap-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="flex gap-2 p-4" />',
    },
    {
      code: '<div className="sm:px-4 sm:py-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="sm:p-4" />',
    },
    {
      code: '<div className="hover:mx-4 hover:my-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="hover:m-4" />',
    },
    {
      code: '<div className="!px-4 !py-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="!p-4" />',
    },
    {
      code: '<div className="px-4! py-4!" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="p-4!" />',
    },
    {
      code: '<div className={`px-4 py-4 ${extra}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className={`p-4 ${extra}`} />',
    },
    {
      code: '<div className="w-full h-full" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="size-full" />',
    },
    {
      code: '<div className="sm:h-4 sm:w-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="sm:size-4" />',
    },
    // `w-dvw`/`h-dvw` are both `100dvw`, and `size-dvw` sets both. It used to be
    // excluded by a blocklist that lumped every viewport unit in with `screen`.
    {
      code: '<div className="w-dvw h-dvw" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="size-dvw" />',
    },
    {
      code: '<div className="hover:mt-2 hover:mr-2 hover:mb-2 hover:ml-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="hover:m-2" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`h-3 w-3 ${iconClassName}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className={`size-3 ${iconClassName}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} h-4 w-4`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className={`${base} size-4`} />',
    },
    // The shorthand is already there: the fix must not duplicate it
    {
      code: '<div className="mt-2 mb-2 my-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="my-2" />',
    },
    // Scrambled order
    {
      code: '<div className="mb-2 ml-2 mt-2 mr-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="m-2" />',
    },
    // ! important modifier
    {
      code: '<div className="!mt-2 !mr-2 !mb-2 !ml-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="!m-2" />',
    },
  ],
})

describe('families beyond margin/padding/size', () => {
  const cases: [string, string][] = [
    // borders, widths and colours through the same entries
    ['border-t-2 border-r-2 border-b-2 border-l-2', 'border-2'],
    ['border-l-2 border-r-2', 'border-x-2'],
    ['border-s-2 border-e-2', 'border-x-2'],
    ['border-x-2 border-y-2', 'border-2'],
    ['border-t-red-500 border-b-red-500', 'border-y-red-500'],
    // inset
    ['top-0 right-0 bottom-0 left-0', 'inset-0'],
    ['left-4 right-4', 'inset-x-4'],
    ['start-4 end-4', 'inset-x-4'],
    ['inset-x-4 inset-y-4', 'inset-4'],
    // corners and edges
    ['rounded-tl-lg rounded-tr-lg', 'rounded-t-lg'],
    ['rounded-tl-lg rounded-bl-lg', 'rounded-l-lg'],
    ['rounded-t-lg rounded-b-lg', 'rounded-lg'],
    ['rounded-ss-lg rounded-es-lg', 'rounded-s-lg'],
    // single-property pairs
    ['gap-x-4 gap-y-4', 'gap-4'],
    ['overflow-x-hidden overflow-y-hidden', 'overflow-hidden'],
    ['overscroll-x-none overscroll-y-none', 'overscroll-none'],
    ['border-spacing-x-4 border-spacing-y-4', 'border-spacing-4'],
    ['translate-x-4 translate-y-4', 'translate-4'],
    // logical inline pairs
    ['ms-4 me-4', 'mx-4'],
    ['ps-4 pe-4', 'px-4'],
    ['scroll-mt-4 scroll-mb-4', 'scroll-my-4'],
    ['scroll-ps-4 scroll-pe-4', 'scroll-px-4'],
  ]

  new RuleTester().run('enforce-shorthand (new families)', enforceShorthand, {
    valid: [],
    invalid: cases.map(([code, replacement]) => ({
      code: `<div className="${code}" />`,
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: `<div className="${replacement}" />`,
    })),
  })
})

describe('with a design system: per-axis theme namespaces', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/axis-namespaces.css'))

  run('enforce-shorthand (axis namespaces)', enforceShorthand, {
    valid: [
      // `--width-brand` is 10rem, `--height-brand` is 20rem, and `size-brand`
      // does not exist. Merging deletes both dimensions.
      { code: '<div className="w-brand h-brand" />', filename: 'test.tsx' },
      // All three namespaces define `card` as 30rem, but each side reads its own
      // variable: a `:root` override of one makes them diverge, so the rewrite is
      // not value-equivalent and is left alone.
      { code: '<div className="w-card h-card" />', filename: 'test.tsx' },
      { code: '<div className="w-screen h-screen" />', filename: 'test.tsx' },
    ],
    invalid: [
      // The spacing scale is shared by all three namespaces.
      {
        code: '<div className="w-4 h-4" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'shorthand' }],
        output: '<div className="size-4" />',
      },
      // Literal keyword: both axes emit `100%`.
      {
        code: '<div className="w-full h-full" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'shorthand' }],
        output: '<div className="size-full" />',
      },
      // Arbitrary values carry the same literal into both axes.
      {
        code: '<div className="w-[10px] h-[10px]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'shorthand' }],
        output: '<div className="size-[10px]" />',
      },
      // Single-namespace families are unaffected by any of this.
      {
        code: '<div className="mt-2 mb-2" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'shorthand' }],
        output: '<div className="my-2" />',
      },
    ],
  })
})
