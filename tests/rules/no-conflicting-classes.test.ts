import { resolve } from 'node:path'
import { beforeAll } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

ruleTester.run('no-conflicting-classes', noConflictingClasses, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="p-4 m-2" />', filename: 'test.tsx' },
    // Different variants = no conflict
    { code: '<div className="hover:bg-red-500 focus:bg-blue-500" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="text-red-500 text-blue-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Same longhand properties conflict
    {
      code: '<div className="mt-2 mt-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
  ],
})
