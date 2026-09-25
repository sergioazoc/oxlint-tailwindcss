import { resolve } from 'node:path'
import { describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noArbitraryValue } from '../../src/rules/no-arbitrary-value'
import { makeFixtureRunner } from '../utils/with-fixture'

const ruleTester = new RuleTester()

// Default: all arbitrary values flagged
ruleTester.run('no-arbitrary-value', noArbitraryValue, {
  valid: [
    { code: '<div className="flex items-center p-4" />', filename: 'test.tsx' },
    { code: '<div className="bg-blue-500 text-white" />', filename: 'test.tsx' },
    // Arbitrary variants are NOT arbitrary values
    { code: '<div className="[&>svg]:w-4" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="w-[200px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
    {
      code: '<div className="bg-[#ff0000] text-white" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
    {
      code: '<div className="hover:w-[200px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
    {
      code: 'cn("p-[10px] m-4")',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
    // Important modifier with arbitrary value
    {
      code: '<div className="!w-[200px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
  ],
})

// With allow: bg- and text- prefixes allowed
ruleTester.run('no-arbitrary-value (allow)', noArbitraryValue, {
  valid: [
    {
      code: '<div className="bg-[#ff0000]" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-', 'text-'] }],
    },
    {
      code: '<div className="text-[14px]" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-', 'text-'] }],
    },
    // Important modifier with allowed prefix
    {
      code: '<div className="!bg-[#ff0000]" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-', 'text-'] }],
    },
  ],
  invalid: [
    {
      code: '<div className="w-[200px]" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-', 'text-'] }],
      errors: [{ messageId: 'noArbitrary' }],
    },
  ],
})

/**
 * `allowVariables` (R4): a value that is nothing but a CSS variable.
 *
 * `w-(--sidebar-width)`, `h-[var(--radix-select-trigger-height)]` read a value
 * that JavaScript or an inline `style` sets at runtime — there is no token to
 * use instead, so reporting it only teaches people to disable the rule. A
 * variable the stylesheet itself defines (`--primary`) is different: a named
 * utility exists (`prefer-theme-tokens` rewrites to it).
 *
 *   'none'    (default) — report every arbitrary value, as before;
 *   'runtime' — allow variables no CSS in the design system defines;
 *   'all'     — allow every pure variable reference.
 *
 * Only a PURE reference counts: `w-[calc(var(--x)*2)]` is still an arbitrary
 * value in every mode.
 */
ruleTester.run('no-arbitrary-value (allowVariables: all)', noArbitraryValue, {
  valid: [
    {
      code: '<div className="w-(--sidebar-width)" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'all' }],
    },
    {
      code: '<div className="h-[var(--radix-select-trigger-height)] max-h-(--available-height)" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'all' }],
    },
    // Type hints, fallbacks, modifiers and variants don't change what it is.
    {
      code: '<div className="text-(length:--size) w-[var(--w,16rem)]" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'all' }],
    },
    {
      code: '<div className="bg-(--c)/50 md:w-(--w)! -top-(--offset)" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'all' }],
    },
    {
      code: '<div className="bg-(--primary)" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'all' }],
    },
  ],
  invalid: [
    {
      code: '<div className="w-[calc(var(--x)*2)]" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'all' }],
      errors: [{ messageId: 'noArbitrary' }],
    },
    {
      code: '<div className="w-[200px] w-(--w)" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'all' }],
      errors: [{ messageId: 'noArbitrary', data: { className: 'w-[200px]' } }],
    },
  ],
})

ruleTester.run('no-arbitrary-value (allowVariables: none, the default)', noArbitraryValue, {
  valid: [],
  invalid: [
    {
      code: '<div className="w-(--sidebar-width)" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
    {
      code: '<div className="w-(--sidebar-width)" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'none' }],
      errors: [{ messageId: 'noArbitrary' }],
    },
  ],
})

// Without a design system 'runtime' can't prove a variable is undefined, so it
// keeps reporting — the safe side for a restriction rule.
ruleTester.run('no-arbitrary-value (allowVariables: runtime, no design system)', noArbitraryValue, {
  valid: [],
  invalid: [
    {
      code: '<div className="w-(--sidebar-width)" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'runtime' }],
      errors: [{ messageId: 'noArbitrary' }],
    },
    {
      // DS-optional: an entry point that can't load degrades to the static
      // answer — never to `designSystemUnavailable`.
      code: '<div className="w-(--sidebar-width)" />',
      filename: 'test.tsx',
      options: [{ allowVariables: 'runtime' }],
      settings: { tailwindcss: { entryPoint: '/nonexistent/for-no-arbitrary-value.css' } },
      errors: [{ messageId: 'noArbitrary' }],
    },
  ],
})

describe('no-arbitrary-value (allowVariables: runtime)', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/shadcn.css'))
  run('runtime variables', noArbitraryValue, {
    valid: [
      {
        code: '<div className="w-(--sidebar-width)" />',
        filename: 'test.tsx',
        options: [{ allowVariables: 'runtime' }],
      },
      {
        code: '<div className="h-[var(--radix-select-trigger-height)] min-w-(--radix-popper-anchor-width)" />',
        filename: 'test.tsx',
        options: [{ allowVariables: 'runtime' }],
      },
    ],
    invalid: [
      {
        // Defined by the stylesheet: there is a named utility for it.
        code: '<div className="bg-(--primary)" />',
        filename: 'test.tsx',
        options: [{ allowVariables: 'runtime' }],
        errors: [{ messageId: 'noArbitrary', data: { className: 'bg-(--primary)' } }],
      },
      {
        code: '<div className="border-[var(--border)]" />',
        filename: 'test.tsx',
        options: [{ allowVariables: 'runtime' }],
        errors: [{ messageId: 'noArbitrary' }],
      },
      {
        code: '<div className="w-[calc(var(--sidebar-width)+1rem)]" />',
        filename: 'test.tsx',
        options: [{ allowVariables: 'runtime' }],
        errors: [{ messageId: 'noArbitrary' }],
      },
    ],
  })
})
