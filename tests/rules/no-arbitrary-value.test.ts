import { RuleTester } from 'oxlint/plugins-dev'
import { noArbitraryValue } from '../../src/rules/no-arbitrary-value'

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
