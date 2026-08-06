import { resolve } from 'node:path'
import { describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforceLogical, PHYSICAL_TO_LOGICAL_MAPPINGS } from '../../src/rules/enforce-logical'
import { makeFixtureRunner } from '../utils/with-fixture'

const ruleTester = new RuleTester()

ruleTester.run('enforce-logical', enforceLogical, {
  valid: [
    { code: '<div className="ms-4" />', filename: 'test.tsx' },
    { code: '<div className="me-4" />', filename: 'test.tsx' },
    { code: '<div className="ps-4 pe-4" />', filename: 'test.tsx' },
    { code: '<div className="start-0 end-0" />', filename: 'test.tsx' },
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
  ],
  invalid: [
    // Generated from the mapping table — every entry is covered. `exact` entries
    // carry the direction as their value (`float-left`), so they take no suffix.
    ...PHYSICAL_TO_LOGICAL_MAPPINGS.map(({ from, to, exact }) => {
      const suffix = exact ? '' : from.includes('left') || from.includes('right') ? '-0' : '-4'
      return {
        code: `<div className="${from}${suffix}" />`,
        filename: 'test.tsx',
        errors: [{ messageId: 'useLogical' as const }],
        output: `<div className="${to}${suffix}" />`,
      }
    }),
    // With variant
    {
      code: '<div className="hover:ml-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="hover:ms-4" />',
    },
    // R-M4: negative utilities keep their leading `-` through the conversion
    {
      code: '<div className="-ml-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="-ms-2" />',
    },
    {
      code: '<div className="-left-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="-start-4" />',
    },
    {
      code: '<div className="hover:-scroll-ml-3" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="hover:-scroll-ms-3" />',
    },
    // Multiple physical properties in same string
    {
      code: '<div className="ml-4 mr-4 flex" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'useLogical' },
        {
          messageId: 'useLogical',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'mr-4', replacement: 'me-4' },
              output: '<div className="ms-4 me-4 flex" />',
            },
          ],
        },
      ],
      output: '<div className="ms-4 me-4 flex" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex ml-4 ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className={`flex ms-4 ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} ml-4`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className={`${base} ms-4`} />',
    },
    // ! important modifier
    {
      code: '<div className="!ml-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="!ms-4" />',
    },
  ],
})

/**
 * With a design system, a rewrite has to land on a class that exists.
 *
 * The mapping table is pure name arithmetic: `ml-*` → `ms-*`. A project that
 * defines its own `@utility ml-huge` got an autofix to `ms-huge`, which emits
 * nothing at all — the margin silently disappeared.
 */
describe('replacement validity', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/custom-utility.css'))

  run('enforce-logical (validated replacement)', enforceLogical, {
    valid: [
      // `ms-huge` does not exist, so there is nothing to suggest.
      { code: '<div className="ml-huge" />', filename: 'test.tsx' },
      // Same guard, percentage edition. `ms-*` takes no percentage — only the 22
      // gradient/mask/font-stretch prefixes do — so widening the off-scale
      // heuristic to every known prefix would have this rewrite one dead class
      // into another.
      { code: '<div className="ml-33%" />', filename: 'test.tsx' },
    ],
    invalid: [
      // The scale utilities are unaffected: `ms-4` exists.
      {
        code: '<div className="ml-4" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'useLogical' }],
        output: '<div className="ms-4" />',
      },
      {
        code: '<div className="float-left text-right" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'useLogical' }, { messageId: 'useLogical' }],
        output: '<div className="float-start text-end" />',
      },
    ],
  })
})
