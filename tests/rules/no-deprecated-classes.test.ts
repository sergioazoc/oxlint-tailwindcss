import { resolve } from 'node:path'
import { RuleTester } from 'oxlint/plugins-dev'
import { noDeprecatedClasses } from '../../src/rules/no-deprecated-classes'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

const ruleTester = new RuleTester()

ruleTester.run('no-deprecated-classes', noDeprecatedClasses, {
  valid: [
    {
      code: '<div className="grow shrink" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
    },
    {
      code: '<div className="grow-0 shrink-0" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
    },
    {
      code: '<div className="text-ellipsis" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
    },
    {
      code: '<div className="flex items-center" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
    },
  ],
  invalid: [
    {
      code: '<div className="flex-grow" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className="grow" />',
    },
    {
      code: '<div className="flex-shrink" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className="shrink" />',
    },
    {
      code: '<div className="flex-grow-0" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className="grow-0" />',
    },
    {
      code: '<div className="overflow-ellipsis" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className="text-ellipsis" />',
    },
    {
      code: '<div className="decoration-slice" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className="box-decoration-slice" />',
    },
    // With variant
    {
      code: '<div className="hover:flex-grow" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className="hover:grow" />',
    },
  ],
})
