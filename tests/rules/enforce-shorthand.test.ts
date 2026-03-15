import { RuleTester } from 'oxlint/plugins-dev'
import { enforceShorthand } from '../../src/rules/enforce-shorthand'

const ruleTester = new RuleTester()

ruleTester.run('enforce-shorthand', enforceShorthand, {
  valid: [
    { code: '<div className="m-2" />', filename: 'test.tsx' },
    { code: '<div className="p-4 flex" />', filename: 'test.tsx' },
    { code: '<div className="mt-2 mr-4" />', filename: 'test.tsx' },
    { code: '<div className="size-full" />', filename: 'test.tsx' },
    // Shorthand with different variants should NOT be merged
    { code: '<div className="hover:mt-2 focus:mb-2" />', filename: 'test.tsx' },
    // Partial axes with different values
    { code: '<div className="mt-2 mb-4" />', filename: 'test.tsx' },
    // Same variant on all axes — rule does not handle variants, so this is valid
    {
      code: '<div className="hover:mt-2 hover:mr-2 hover:mb-2 hover:ml-2" />',
      filename: 'test.tsx',
    },
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
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`h-3 w-3 ${iconClassName}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className={`size-3 ${iconClassName}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} h-4 w-4`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className={`${base} size-4`} />',
    },
    // Scrambled order
    {
      code: '<div className="mb-2 ml-2 mt-2 mr-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }, { messageId: 'shorthand' }, { messageId: 'shorthand' }],
      output: '<div className="m-2" />',
    },
    // ! important modifier
    {
      code: '<div className="!mt-2 !mr-2 !mb-2 !ml-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }, { messageId: 'shorthand' }, { messageId: 'shorthand' }],
      output: '<div className="!m-2" />',
    },
  ],
})
