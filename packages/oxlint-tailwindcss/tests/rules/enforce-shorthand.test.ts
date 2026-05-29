import { RuleTester } from 'oxlint/plugins-dev'
import { enforceShorthand } from '../../src/rules/enforce-shorthand'

const ruleTester = new RuleTester()

ruleTester.run('enforce-shorthand', enforceShorthand, {
  valid: [
    { code: '<div className="m-2" />', filename: 'test.tsx' },
    { code: '<div className="p-4 flex" />', filename: 'test.tsx' },
    { code: '<div className="mt-2 mr-4" />', filename: 'test.tsx' },
    { code: '<div className="size-full" />', filename: 'test.tsx' },
    // w-screen + h-screen should NOT merge to size-screen (different CSS units)
    { code: '<div className="w-screen h-screen" />', filename: 'test.tsx' },
    // Shorthand with different variants should NOT be merged
    { code: '<div className="hover:mt-2 focus:mb-2" />', filename: 'test.tsx' },
    { code: '<div className="sm:h-4 md:w-4" />', filename: 'test.tsx' },
    // Partial axes with different values
    { code: '<div className="mt-2 mb-4" />', filename: 'test.tsx' },
    { code: '<div className="px-4 py-2" />', filename: 'test.tsx' },
    { code: '<div className="mx-4 my-2" />', filename: 'test.tsx' },
    { code: '<div className="px-4" />', filename: 'test.tsx' },
    { code: '<div className="py-4" />', filename: 'test.tsx' },
    { code: '<div className="p-4" />', filename: 'test.tsx' },
    { code: '<div className="m-4" />', filename: 'test.tsx' },
    // Axis shorthands with mismatched variants
    { code: '<div className="sm:px-4 md:py-4" />', filename: 'test.tsx' },
    { code: '<div className="hover:px-4 focus:py-4" />', filename: 'test.tsx' },
    // Single axis pair without its partner — no px+py → p-*
    { code: '<div className="px-4 pt-4" />', filename: 'test.tsx' },
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
    // Axis pair shorthands → full shorthand (px+py, mx+my)
    {
      code: '<div className="px-4 py-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="p-4" />',
    },
    {
      code: '<div className="py-4 px-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="p-4" />',
    },
    {
      code: '<div className="mx-2 my-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="m-2" />',
    },
    {
      code: '<div className="flex px-4 py-4 gap-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="flex gap-2 p-4" />',
    },
    {
      code: '<div className="sm:px-4 sm:py-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="sm:p-4" />',
    },
    {
      code: '<div className="hover:mx-4 hover:my-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="hover:m-4" />',
    },
    {
      code: '<div className="!px-4 !py-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="!p-4" />',
    },
    {
      code: '<div className="px-4! py-4!" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="p-4!" />',
    },
    {
      code: '<div className={`px-4 py-4 ${extra}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className={`p-4 ${extra}`} />',
    },
    {
      code: '<div className="w-full h-full" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="size-full" />',
    },
    {
      code: '<div className="sm:h-4 sm:w-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }],
      output: '<div className="sm:size-4" />',
    },
    {
      code: '<div className="hover:mt-2 hover:mr-2 hover:mb-2 hover:ml-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'shorthand' }, { messageId: 'shorthand' }, { messageId: 'shorthand' }],
      output: '<div className="hover:m-2" />',
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
