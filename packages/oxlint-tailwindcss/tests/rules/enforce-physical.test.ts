import { resolve } from 'node:path'
import { describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforcePhysical } from '../../src/rules/enforce-physical'
import {
  LOGICAL_INSET_ALIASES,
  PHYSICAL_TO_LOGICAL_MAPPINGS,
} from '../../src/rules/enforce-logical'
import { makeFixtureRunner } from '../utils/with-fixture'

const ruleTester = new RuleTester()

ruleTester.run('enforce-physical', enforcePhysical, {
  valid: [
    { code: '<div className="ml-4" />', filename: 'test.tsx' },
    { code: '<div className="mr-4" />', filename: 'test.tsx' },
    { code: '<div className="pl-4 pr-4" />', filename: 'test.tsx' },
    { code: '<div className="left-0 right-0" />', filename: 'test.tsx' },
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
  ],
  invalid: [
    // Generated from the mapping table (inverted) plus the inset aliases — every
    // entry is covered. `exact` entries carry the direction as their value
    // (`float-start`), so they take no suffix.
    ...[
      ...PHYSICAL_TO_LOGICAL_MAPPINGS.map((m) => ({ ...m, from: m.to, to: m.from })),
      ...LOGICAL_INSET_ALIASES,
    ].map(({ from, to, exact }) => {
      const suffix = exact ? '' : from.includes('start') || from.includes('end') ? '-0' : '-4'
      return {
        code: `<div className="${from}${suffix}" />`,
        filename: 'test.tsx',
        errors: [{ messageId: 'usePhysical' as const }],
        output: `<div className="${to}${suffix}" />`,
      }
    }),
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
    valid: [{ code: '<div className="left-2 right-2" />', filename: 'test.tsx' }],
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
    ],
  })
})
