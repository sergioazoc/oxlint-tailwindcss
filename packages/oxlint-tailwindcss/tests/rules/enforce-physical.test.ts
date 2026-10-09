import { resolve } from 'node:path'
import { describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforcePhysical } from '../../src/rules/enforce-physical'
import { PHYSICAL_TO_LOGICAL_MAPPINGS, invertAxisMappings } from '../../src/rules/enforce-logical'
import { makeFixtureRunner } from '../utils/with-fixture'

const ruleTester = new RuleTester()

ruleTester.run('enforce-physical', enforcePhysical, {
  valid: [
    { code: '<div className="ml-4" />', filename: 'test.tsx' },
    { code: '<div className="mr-4" />', filename: 'test.tsx' },
    { code: '<div className="pl-4 pr-4" />', filename: 'test.tsx' },
    { code: '<div className="left-0 right-0" />', filename: 'test.tsx' },
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    // Sizes are only converted with `sizing: true`.
    { code: '<div className="inline-4 block-4" />', filename: 'test.tsx' },
    // `inline` and `block` are display utilities too, never sizes: an
    // `inline-*` prefix scan would have turned `inline-flex` into `w-flex`.
    {
      code: '<div className="inline block inline-block inline-flex inline-grid inline-table" />',
      filename: 'test.tsx',
      options: [{ sizing: true }],
    },
  ],
  invalid: [
    // Generated from the inverted mapping table — every entry is covered, both
    // spellings of the logical insets included (`inset-s-0` and `start-0`). The
    // physical targets exist in every v4, so no design system is needed to fix.
    // `exact` entries carry the direction as their value (`float-start`), so
    // they take no suffix.
    ...invertAxisMappings(PHYSICAL_TO_LOGICAL_MAPPINGS)
      .filter((m) => !m.sizing)
      .map(({ from, to, exact }) => {
        const suffix = exact ? '' : /start|end|inset/.test(from) ? '-0' : '-4'
        return {
          code: `<div className="${from}${suffix}" />`,
          filename: 'test.tsx',
          errors: [{ messageId: 'usePhysical' as const }],
          output: `<div className="${to as string}${suffix}" />`,
        }
      }),
    // Sizes, with `sizing: true`: one axis at a time.
    {
      code: '<div className="inline-4 block-4 min-inline-0 max-block-full" />',
      filename: 'test.tsx',
      options: [{ sizing: true }],
      errors: [
        { messageId: 'usePhysical' },
        { messageId: 'usePhysical' },
        { messageId: 'usePhysical' },
        { messageId: 'usePhysical' },
      ],
      output: '<div className="w-4 h-4 min-w-0 max-h-full" />',
    },
    // With variant
    {
      code: '<div className="hover:ms-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className="hover:ml-4" />',
    },
    // Multiple logical properties in same string
    {
      code: '<div className="ms-4 me-4 flex" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'usePhysical' },
        {
          messageId: 'usePhysical',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'me-4', replacement: 'mr-4' },
              output: '<div className="ml-4 mr-4 flex" />',
            },
          ],
        },
      ],
      output: '<div className="ml-4 mr-4 flex" />',
    },
    // ! important modifier
    {
      code: '<div className="!ms-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className="!ml-4" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex ms-4 ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className={`flex ml-4 ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} ms-4`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className={`${base} ml-4`} />',
    },
  ],
})

/**
 * The round trip through `enforce-canonical`.
 *
 * `enforce-logical` rewrites `left-2` → `start-2` (the spelling Tailwind's docs
 * use). `enforce-canonical` then rewrites that → `inset-s-2`, because that is what
 * the design system reports as canonical. So a codebase that runs both ends up
 * with `inset-s-*`, and this rule used to have no way back: its table only knew
 * `start`. Both spellings convert now.
 */
describe('both spellings of the logical insets', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/default.css'))

  run('enforce-physical (canonical spelling)', enforcePhysical, {
    valid: [
      { code: '<div className="left-2 right-2" />', filename: 'test.tsx' },
      // With a design system too, display utilities stay displays.
      {
        code: '<div className="inline-flex block inline-block" />',
        filename: 'test.tsx',
        options: [{ sizing: true }],
      },
    ],
    invalid: [
      {
        code: '<div className="inset-s-2" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'usePhysical' }],
        output: '<div className="left-2" />',
      },
      {
        code: '<div className="start-2" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'usePhysical' }],
        output: '<div className="left-2" />',
      },
      {
        code: '<div className="float-start text-end" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'usePhysical' }, { messageId: 'usePhysical' }],
        output: '<div className="float-left text-right" />',
      },
      // The block axis back, what enforce-logical writes on Tailwind 4.2+.
      {
        code: '<div className="mbs-2 inset-bs-0 border-be-red-500 -scroll-mbs-1" />',
        filename: 'test.tsx',
        errors: [
          { messageId: 'usePhysical' },
          { messageId: 'usePhysical' },
          { messageId: 'usePhysical' },
          { messageId: 'usePhysical' },
        ],
        output: '<div className="mt-2 top-0 border-b-red-500 -scroll-mt-1" />',
      },
    ],
  })
})
