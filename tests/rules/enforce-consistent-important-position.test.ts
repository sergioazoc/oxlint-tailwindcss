import { RuleTester } from 'oxlint/plugins-dev'
import { enforceConsistentImportantPosition } from '../../src/rules/enforce-consistent-important-position'

const ruleTester = new RuleTester()

// Default position: suffix (Tailwind v4 canonical form)
ruleTester.run('enforce-consistent-important-position', enforceConsistentImportantPosition, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="font-bold!" />', filename: 'test.tsx' },
    { code: '<div className="hover:text-red!" />', filename: 'test.tsx' },
    { code: '<div className="font-bold! text-red!" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="!font-bold" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useSuffix' }],
      output: '<div className="font-bold!" />',
    },
    {
      code: '<div className="hover:!text-red" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useSuffix' }],
      output: '<div className="hover:text-red!" />',
    },
    {
      code: '<div className="!font-bold !text-red" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useSuffix' }, { messageId: 'useSuffix' }],
      output: '<div className="font-bold! text-red!" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex !font-bold ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useSuffix' }],
      output: '<div className={`flex font-bold! ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} !font-bold`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useSuffix' }],
      output: '<div className={`${base} font-bold!`} />',
    },
  ],
})

// Custom position: prefix (legacy v3 form)
ruleTester.run(
  'enforce-consistent-important-position (prefix)',
  enforceConsistentImportantPosition,
  {
    valid: [
      {
        code: '<div className="!font-bold" />',
        filename: 'test.tsx',
        options: [{ position: 'prefix' }],
      },
      {
        code: '<div className="hover:!text-red" />',
        filename: 'test.tsx',
        options: [{ position: 'prefix' }],
      },
    ],
    invalid: [
      {
        code: '<div className="font-bold!" />',
        filename: 'test.tsx',
        options: [{ position: 'prefix' }],
        errors: [{ messageId: 'usePrefix' }],
        output: '<div className="!font-bold" />',
      },
      {
        code: '<div className="hover:text-red!" />',
        filename: 'test.tsx',
        options: [{ position: 'prefix' }],
        errors: [{ messageId: 'usePrefix' }],
        output: '<div className="hover:!text-red" />',
      },
    ],
  },
)
