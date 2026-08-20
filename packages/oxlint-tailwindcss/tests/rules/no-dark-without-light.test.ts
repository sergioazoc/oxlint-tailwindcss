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
        errors: [{ messageId: 'missingBase' }],
      },
      // A property match has to be with an UNCONDITIONAL class: `dark:underline`
      // is not a base for `dark:no-underline`.
      {
        code: '<div className="dark:no-underline" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'missingBase' }],
      },
    ],
  })
})
