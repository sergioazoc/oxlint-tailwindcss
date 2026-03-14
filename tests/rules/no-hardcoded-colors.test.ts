import { RuleTester } from 'oxlint/plugins-dev'
import { noHardcodedColors } from '../../src/rules/no-hardcoded-colors'

const ruleTester = new RuleTester()

// Default: all hardcoded colors flagged
ruleTester.run('no-hardcoded-colors', noHardcodedColors, {
  valid: [
    { code: '<div className="bg-blue-500 text-white" />', filename: 'test.tsx' },
    { code: '<div className="w-[200px]" />', filename: 'test.tsx' },
    { code: '<div className="h-[calc(100%-2rem)]" />', filename: 'test.tsx' },
    { code: '<div className="tracking-[0.5em]" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="bg-[#ff5733]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="text-[#000]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="bg-[rgb(255,0,0)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="border-[rgba(0,0,0,0.5)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="text-[hsl(120,100%,50%)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="hover:bg-[#ff5733]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
  ],
})

// With allow list
ruleTester.run('no-hardcoded-colors (allow)', noHardcodedColors, {
  valid: [
    {
      code: '<div className="bg-[#000]" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-[#000]'] }],
    },
  ],
  invalid: [
    {
      code: '<div className="bg-[#fff]" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-[#000]'] }],
      errors: [{ messageId: 'noHardcoded' }],
    },
  ],
})
