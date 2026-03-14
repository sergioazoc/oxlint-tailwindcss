import { resolve } from 'node:path'
import { beforeAll } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforceSortOrder } from '../../src/rules/enforce-sort-order'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

ruleTester.run('enforce-sort-order', enforceSortOrder, {
  valid: [
    {
      code: '<div className="flex items-center p-4 text-red-500" />',
      filename: 'test.tsx',
    },
    { code: '<div className="flex" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="text-red-500 flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unsorted' }],
      output: '<div className="flex text-red-500" />',
    },
    {
      code: '<div className="p-4 flex items-center" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unsorted' }],
      output: '<div className="flex items-center p-4" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`text-red-500 flex ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unsorted' }],
      output: '<div className={`flex text-red-500 ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} text-red-500 flex`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unsorted' }],
      output: '<div className={`${base} flex text-red-500`} />',
    },
  ],
})

// Strict mode: groups by variant, sorts within groups, then sorts groups
ruleTester.run('enforce-sort-order (strict)', enforceSortOrder, {
  valid: [
    // Already sorted: no-variant first, then hover group
    {
      code: '<div className="flex p-4 hover:bg-blue-500 hover:text-white" />',
      filename: 'test.tsx',
      options: [{ mode: 'strict' }],
    },
    // Single class
    {
      code: '<div className="flex" />',
      filename: 'test.tsx',
      options: [{ mode: 'strict' }],
    },
  ],
  invalid: [
    // Variant classes interleaved with base classes
    {
      code: '<div className="hover:text-red-500 p-4 hover:bg-blue-500 m-2" />',
      filename: 'test.tsx',
      options: [{ mode: 'strict' }],
      errors: [{ messageId: 'unsorted' }],
      output: '<div className="m-2 p-4 hover:bg-blue-500 hover:text-red-500" />',
    },
  ],
})
