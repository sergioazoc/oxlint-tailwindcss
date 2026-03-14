import { RuleTester } from 'oxlint/plugins-dev'
import { enforceConsistentImportantPosition } from '../../src/rules/enforce-consistent-important-position'

const ruleTester = new RuleTester()

// Default position: prefix
ruleTester.run('enforce-consistent-important-position', enforceConsistentImportantPosition, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="!font-bold" />', filename: 'test.tsx' },
    { code: '<div className="hover:!text-red-500" />', filename: 'test.tsx' },
    { code: '<div className="!font-bold !text-red-500" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="font-bold!" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePrefix' }],
      output: '<div className="!font-bold" />',
    },
    {
      code: '<div className="hover:text-red!" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePrefix' }],
      output: '<div className="hover:!text-red" />',
    },
    {
      code: '<div className="font-bold! text-red!" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePrefix' }, { messageId: 'usePrefix' }],
      output: '<div className="!font-bold !text-red" />',
    },
  ],
})

// Custom position: suffix
ruleTester.run(
  'enforce-consistent-important-position (suffix)',
  enforceConsistentImportantPosition,
  {
    valid: [
      {
        code: '<div className="font-bold!" />',
        filename: 'test.tsx',
        options: [{ position: 'suffix' }],
      },
      {
        code: '<div className="hover:text-red!" />',
        filename: 'test.tsx',
        options: [{ position: 'suffix' }],
      },
    ],
    invalid: [
      {
        code: '<div className="!font-bold" />',
        filename: 'test.tsx',
        options: [{ position: 'suffix' }],
        errors: [{ messageId: 'useSuffix' }],
        output: '<div className="font-bold!" />',
      },
      {
        code: '<div className="hover:!text-red" />',
        filename: 'test.tsx',
        options: [{ position: 'suffix' }],
        errors: [{ messageId: 'useSuffix' }],
        output: '<div className="hover:text-red!" />',
      },
    ],
  },
)
