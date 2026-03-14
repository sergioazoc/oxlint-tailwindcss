import { resolve } from 'node:path'
import { beforeAll } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

ruleTester.run('enforce-canonical', enforceCanonical, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="bg-blue-500 p-4" />', filename: 'test.tsx' },
    { code: '<div className="m-0" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="-m-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="m-0" />',
    },
    {
      code: '<div className="flex -mt-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="flex mt-0" />',
    },
  ],
})
