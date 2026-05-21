import { RuleTester } from 'oxlint/plugins-dev'
import { enforceConsistentLineWrapping } from '../../src/rules/enforce-consistent-line-wrapping'

const ruleTester = new RuleTester()

const veryLongClass =
  'flex items-center justify-between p-4 m-2 bg-white text-black rounded shadow-lg border w-full'

// Default printWidth: 80
ruleTester.run('enforce-consistent-line-wrapping', enforceConsistentLineWrapping, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    {
      code: '<div className="flex items-center justify-between p-4 m-2 bg-white text-lg" />',
      filename: 'test.tsx',
    },
  ],
  invalid: [
    {
      code: `<div className="${veryLongClass}" />`,
      filename: 'test.tsx',
      errors: [{ messageId: 'tooLong' }],
    },
    {
      code: `cn("${veryLongClass}")`,
      filename: 'test.tsx',
      errors: [{ messageId: 'tooLong' }],
    },
  ],
})

// Custom printWidth: 40
ruleTester.run('enforce-consistent-line-wrapping (printWidth: 40)', enforceConsistentLineWrapping, {
  valid: [
    {
      code: '<div className="flex items-center p-4" />',
      filename: 'test.tsx',
      options: [{ printWidth: 40 }],
    },
  ],
  invalid: [
    {
      code: '<div className="flex items-center justify-between p-4 m-2" />',
      filename: 'test.tsx',
      options: [{ printWidth: 40 }],
      errors: [{ messageId: 'tooLong' }],
    },
  ],
})

// classesPerLine option
ruleTester.run('enforce-consistent-line-wrapping (classesPerLine)', enforceConsistentLineWrapping, {
  valid: [
    {
      code: '<div className="flex items-center p-4" />',
      filename: 'test.tsx',
      options: [{ classesPerLine: 5 }],
    },
    {
      code: 'cn("flex items-center p-4")',
      filename: 'test.tsx',
      options: [{ classesPerLine: 5 }],
    },
  ],
  invalid: [
    // String literal: reports but no autofix
    {
      code: '<div className="flex items-center justify-between p-4 m-2 bg-white" />',
      filename: 'test.tsx',
      options: [{ classesPerLine: 3 }],
      errors: [{ messageId: 'tooManyPerLine' }],
    },
    // Function call with string: reports but no autofix
    {
      code: 'cn("flex items-center justify-between p-4 m-2 bg-white")',
      filename: 'test.tsx',
      options: [{ classesPerLine: 3 }],
      errors: [{ messageId: 'tooManyPerLine' }],
    },
  ],
})
