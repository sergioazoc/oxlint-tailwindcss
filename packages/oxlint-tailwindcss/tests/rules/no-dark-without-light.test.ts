import { resolve } from 'node:path'
import { describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noDarkWithoutLight } from '../../src/rules/no-dark-without-light'
import { makeFixtureRunner } from '../utils/with-fixture'

const ruleTester = new RuleTester()

// Default: watches dark variant
ruleTester.run('no-dark-without-light', noDarkWithoutLight, {
  valid: [
    { code: '<div className="bg-white text-black" />', filename: 'test.tsx' },
    { code: '<div className="bg-white dark:bg-gray-900" />', filename: 'test.tsx' },
    { code: '<div className="text-black dark:text-white" />', filename: 'test.tsx' },
    {
      code: '<div className="bg-white dark:bg-gray-900 text-black dark:text-white" />',
      filename: 'test.tsx',
    },
    { code: '<div className="hover:bg-blue-500" />', filename: 'test.tsx' },
    // R-M5: display/position utilities share a property under different bare
    // names — `block`/`hidden` group together, so the idiomatic show/hide
    // pattern must NOT report a missing base.
    { code: '<div className="block dark:hidden" />', filename: 'test.tsx' },
    { code: '<div className="hidden dark:block" />', filename: 'test.tsx' },
    { code: '<div className="flex dark:hidden" />', filename: 'test.tsx' },
    { code: '<div className="relative dark:absolute" />', filename: 'test.tsx' },
    // Composition guard (issue #117): a dark-only string is only "missing a
    // base" when it is the element's FINAL class list. In a `cn`/`twMerge`
    // fragment or a custom component's `className`, the light base routinely
    // lives in another argument or in the component's own `cva`, so these must
    // NOT report — acting on the finding removes a load-bearing dark override.
    { code: 'cn("dark:bg-gray-900")', filename: 'test.tsx' },
    { code: 'twMerge(fieldVariants(), "dark:bg-transparent")', filename: 'test.tsx' },
    { code: '<Field className="dark:bg-transparent" />', filename: 'test.tsx' },
    { code: '<Card.Body className="dark:bg-gray-900" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="dark:bg-gray-900" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingBase' }],
    },
    {
      code: '<div className="bg-white dark:bg-gray-900 dark:text-white" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingBase' }],
    },
    // The limit of the static fallback, stated rather than hidden: with no
    // entryPoint the rule cannot know these two spellings write the same
    // property, so it still reports them. Configuring one fixes it — see the
    // derived-groups block at the bottom of this file.
    {
      code: '<div className="underline dark:no-underline" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingBase' }],
    },
    {
      code: '<div className="italic dark:not-italic" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingBase' }],
    },
  ],
})

// Custom variants: watch both dark and contrast-more
ruleTester.run('no-dark-without-light (custom variants)', noDarkWithoutLight, {
  valid: [
    // dark: not watched → no error
    {
      code: '<div className="dark:bg-gray-900" />',
      filename: 'test.tsx',
      options: [{ variants: ['contrast-more'] }],
    },
    // contrast-more: with matching base → OK
    {
      code: '<div className="bg-white contrast-more:bg-black" />',
      filename: 'test.tsx',
      options: [{ variants: ['contrast-more'] }],
    },
  ],
  invalid: [
    {
      code: '<div className="contrast-more:bg-black" />',
      filename: 'test.tsx',
      options: [{ variants: ['contrast-more'] }],
      errors: [{ messageId: 'missingBase' }],
    },
  ],
})

/**
 * With a design system, the base is also matched by the CSS property each class
 * declares — not just by the leading token.
 *
 * The prefix heuristic reported the idiomatic "light does X, dark undoes X" pairs
 * as missing a base, because the two spellings share no prefix: `underline` and
 * `no-underline` both write `text-decoration-line`, and the rule could not know.
 * A hardcoded equivalence table covered exactly two groups (`display`,
 * `position`) and would have had to grow one entry per pair forever.
 *
 * The property check is additive: a class that matched by prefix before still
 * matches, so this can only ever report LESS than it used to.
 */
describe('property grouping with a design system', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/default.css'))

  run('no-dark-without-light (derived groups)', noDarkWithoutLight, {
    valid: [
      // Same property, different spelling — the false positives this fixes.
      { code: '<div className="underline dark:no-underline" />', filename: 'test.tsx' },
      { code: '<div className="italic dark:not-italic" />', filename: 'test.tsx' },
      { code: '<div className="visible dark:invisible" />', filename: 'test.tsx' },
      { code: '<div className="uppercase dark:normal-case" />', filename: 'test.tsx' },
      { code: '<div className="truncate dark:text-clip" />', filename: 'test.tsx' },
      { code: '<div className="sr-only dark:not-sr-only" />', filename: 'test.tsx' },
      // Derived, so the two hardcoded groups are covered by the same mechanism.
      { code: '<div className="block dark:hidden" />', filename: 'test.tsx' },
      { code: '<div className="absolute dark:fixed" />', filename: 'test.tsx' },
      // Prefix matches keep working, including for user-written values.
      { code: '<div className="bg-white dark:bg-black" />', filename: 'test.tsx' },
      { code: '<div className="bg-[#fff] dark:bg-[#111]" />', filename: 'test.tsx' },
      { code: '<div className="text-gray-900 dark:text-white" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Nothing on the element declares `background-color`.
      {
        code: '<div className="flex dark:bg-black" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'missingBaseProperty',
            data: { className: 'dark:bg-black', variant: 'dark', property: 'background-color' },
          },
        ],
      },
    ],
  })
})

/**
 * Only COLOUR needs a light-mode base (R3).
 *
 * The rule exists because a dark-only colour leaves light mode with whatever the
 * element inherits — usually not what was meant. A dark-only filter, display,
 * border width or opacity is different: light mode keeps the element's normal
 * rendering, which is exactly the intent (`dark:brightness-[0.2]` dims an image
 * in dark mode only). Those used to be reported as a "missing base" nobody
 * should add. With a design system, "colour" is read from the CSS each class
 * emits: a colour property, a read of a `--color-*` theme variable, or a colour
 * literal. `dark:text-*` stays in scope — text colour is colour.
 */
describe('only colour needs a light base (with a design system)', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/default.css'))

  run('no-dark-without-light (colour only)', noDarkWithoutLight, {
    valid: [
      // shadcn apps/v4, verbatim: dim and desaturate an image in dark mode only.
      {
        code: '<img className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale" />',
        filename: 'test.tsx',
      },
      // shadcn apps/v4, verbatim: hide a decorative gradient in dark mode only.
      {
        code: '<div className="absolute inset-x-0 top-0 z-1 h-120 bg-linear-to-b from-background via-muted to-transparent dark:hidden" />',
        filename: 'test.tsx',
      },
      // shadcn apps/v4, verbatim: a border width that only dark mode draws.
      {
        code: '<div className="relative hidden h-full flex-col p-10 text-primary lg:flex dark:border-r" />',
        filename: 'test.tsx',
      },
      { code: '<div className="dark:opacity-50" />', filename: 'test.tsx' },
      { code: '<div className="dark:shadow-lg" />', filename: 'test.tsx' },
      { code: '<div className="dark:no-underline" />', filename: 'test.tsx' },
      { code: '<div className="dark:backdrop-blur-sm" />', filename: 'test.tsx' },
      { code: '<div className="dark:ring-2" />', filename: 'test.tsx' },
      // A colour with its base, matched by property or by prefix.
      { code: '<div className="shadow-sm dark:shadow-white/10" />', filename: 'test.tsx' },
      { code: '<div className="border-gray-200 dark:border-gray-700" />', filename: 'test.tsx' },
      // Same prefix counts as a base, as it always has: the light border keeps
      // its default colour on purpose.
      { code: '<div className="border dark:border-gray-700" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="dark:text-white" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'missingBaseProperty',
            data: { className: 'dark:text-white', variant: 'dark', property: 'color' },
          },
        ],
      },
      {
        code: '<div className="p-4 dark:bg-black" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'missingBaseProperty',
            data: { className: 'dark:bg-black', variant: 'dark', property: 'background-color' },
          },
        ],
      },
      {
        // A colour literal is colour, however it's written.
        code: '<div className="dark:bg-[#111]" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'missingBaseProperty',
            data: { className: 'dark:bg-[#111]', variant: 'dark', property: 'background-color' },
          },
        ],
      },
      {
        code: '<div className="p-4 dark:border-gray-700" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'missingBaseProperty',
            data: { className: 'dark:border-gray-700', variant: 'dark', property: 'border-color' },
          },
        ],
      },
      {
        code: '<svg className="dark:fill-white" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'missingBaseProperty',
            data: { className: 'dark:fill-white', variant: 'dark', property: 'fill' },
          },
        ],
      },
      {
        code: '<div className="bg-linear-to-r dark:from-gray-900" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'missingBaseProperty' }],
      },
    ],
  })
})

describe('only colour needs a light base (project tokens)', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/shadcn.css'))

  run('no-dark-without-light (shadcn tokens)', noDarkWithoutLight, {
    valid: [
      {
        code: '<a className="text-muted-foreground dark:text-foreground" />',
        filename: 'test.tsx',
      },
    ],
    invalid: [
      {
        // shadcn apps/v4, verbatim: text colour is colour.
        code: '<a className="dark:text-foreground" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'missingBaseProperty',
            data: { className: 'dark:text-foreground', variant: 'dark', property: 'color' },
          },
        ],
      },
    ],
  })
})

/**
 * Without a design system the rule can't read what a class emits, so it keeps
 * reporting by prefix — minus the families that are never colour: filters,
 * backdrop filters, opacity, display, visibility, position, `sr-only`, and
 * border / outline / ring widths.
 */
ruleTester.run('no-dark-without-light (colour only, no design system)', noDarkWithoutLight, {
  valid: [
    {
      code: '<img className="object-cover dark:brightness-[0.2] dark:grayscale" />',
      filename: 'test.tsx',
    },
    { code: '<div className="absolute dark:hidden" />', filename: 'test.tsx' },
    { code: '<div className="flex-col dark:border-r" />', filename: 'test.tsx' },
    { code: '<div className="dark:border-2" />', filename: 'test.tsx' },
    { code: '<div className="dark:border-[3px]" />', filename: 'test.tsx' },
    { code: '<div className="dark:ring" />', filename: 'test.tsx' },
    { code: '<div className="dark:outline-0" />', filename: 'test.tsx' },
    { code: '<div className="dark:opacity-75" />', filename: 'test.tsx' },
    { code: '<div className="dark:invisible" />', filename: 'test.tsx' },
    { code: '<div className="dark:sr-only" />', filename: 'test.tsx' },
    {
      code: '<div className="dark:backdrop-blur-sm dark:blur-sm dark:invert" />',
      filename: 'test.tsx',
    },
  ],
  invalid: [
    {
      code: '<div className="dark:text-white" />',
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'missingBase',
          data: { className: 'dark:text-white', variant: 'dark', prefix: 'text' },
        },
      ],
    },
    {
      code: '<div className="dark:border-gray-700" />',
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'missingBase',
          data: { className: 'dark:border-gray-700', variant: 'dark', prefix: 'border' },
        },
      ],
    },
    {
      code: '<div className="dark:border-[#333]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingBase' }],
    },
  ],
})
