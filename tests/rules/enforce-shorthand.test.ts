import { RuleTester } from 'oxlint/plugins-dev'
import { enforceShorthand } from '../../src/rules/enforce-shorthand'

const ruleTester = new RuleTester()

ruleTester.run('enforce-shorthand', enforceShorthand, {
  valid: [
    { code: '<div className="m-2" />', filename: 'test.tsx' },
    { code: '<div className="p-4 flex" />', filename: 'test.tsx' },
    { code: '<div className="mt-2 mr-4" />', filename: 'test.tsx' },
    { code: '<div className="size-full" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="mt-2 mr-2 mb-2 ml-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }, { messageId: 'shorthand' }, { messageId: 'shorthand' }],
      output: '<div className="m-2" />',
    },
    {
      code: '<div className="mt-2 mb-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="my-2" />',
    },
    {
      code: '<div className="ml-2 mr-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="mx-2" />',
    },
    {
      code: '<div className="pt-4 pr-4 pb-4 pl-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }, { messageId: 'shorthand' }, { messageId: 'shorthand' }],
      output: '<div className="p-4" />',
    },
    {
      code: '<div className="w-full h-full" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="size-full" />',
    },
  ],
})
