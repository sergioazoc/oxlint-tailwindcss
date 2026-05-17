import { resolve } from 'node:path'
import { beforeAll } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noUnnecessaryArbitraryValue } from '../../src/rules/no-unnecessary-arbitrary-value'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

ruleTester.run('no-unnecessary-arbitrary-value', noUnnecessaryArbitraryValue, {
  valid: [
    // Named classes — no issue
    { code: '<div className="w-full h-auto" />', filename: 'test.tsx' },
    // Arbitrary value with no named equivalent
    { code: '<div className="w-[200px]" />', filename: 'test.tsx' },
    // Custom arbitrary color — no named equivalent
    { code: '<div className="bg-[#custom]" />', filename: 'test.tsx' },
    // No arbitrary value at all
    { code: '<div className="flex items-center p-4" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="h-[auto]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryArbitrary' }],
      output: '<div className="h-auto" />',
    },
    // With variant prefix
    {
      code: '<div className="hover:h-[auto]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryArbitrary' }],
      output: '<div className="hover:h-auto" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex h-[auto] ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryArbitrary' }],
      output: '<div className={`flex h-auto ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} h-[auto]`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryArbitrary' }],
      output: '<div className={`${base} h-auto`} />',
    },
    // Important modifier with unnecessary arbitrary
    {
      code: '<div className="!h-[auto]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryArbitrary' }],
      output: '<div className="!h-auto" />',
    },
    // Multiple unnecessary arbitraries in same string
    {
      code: '<div className="h-[auto] w-[auto] flex" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'unnecessaryArbitrary' },
        {
          messageId: 'unnecessaryArbitrary',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'w-[auto]', replacement: 'w-auto' },
              output: '<div className="h-auto w-auto flex" />',
            },
          ],
        },
      ],
      output: '<div className="h-auto w-auto flex" />',
    },
    // Multi-segment utilities: arbitraryEquivalents must enumerate every
    // dash split point so `bg-red-500` registers `bg-[<value>]`.
    {
      code: '<div className="bg-[var(--color-red-500)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryArbitrary' }],
      output: '<div className="bg-red-500" />',
    },
    {
      code: '<div className="text-[var(--color-blue-700)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryArbitrary' }],
      output: '<div className="text-blue-700" />',
    },
    {
      code: '<div className="ring-offset-[var(--color-blue-500)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryArbitrary' }],
      output: '<div className="ring-offset-blue-500" />',
    },
  ],
})
