import { resolve } from 'node:path'
import { RuleTester } from 'oxlint/plugins-dev'
import { noDeprecatedClasses, DEPRECATED_MAP } from '../../src/rules/no-deprecated-classes'

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
    // Generated from DEPRECATED_MAP — every entry is covered
    ...Object.entries(DEPRECATED_MAP).map(([deprecated, replacement]) => ({
      code: `<div className="${deprecated}" />`,
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' as const }],
      output: `<div className="${replacement}" />`,
    })),
    // With variant
    {
      code: '<div className="hover:flex-grow" />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className="hover:grow" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex flex-grow ${x}`} />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className={`flex grow ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} flex-grow`} />',
      filename: 'test.tsx',
      options: [{ entryPoint: ENTRY_POINT }],
      errors: [{ messageId: 'deprecated' }],
      output: '<div className={`${base} grow`} />',
    },
  ],
})
