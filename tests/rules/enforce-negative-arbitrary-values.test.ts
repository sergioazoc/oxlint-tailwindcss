import { RuleTester } from 'oxlint/plugins-dev'
import { enforceNegativeArbitraryValues } from '../../src/rules/enforce-negative-arbitrary-values'

const ruleTester = new RuleTester()

ruleTester.run('enforce-negative-arbitrary-values', enforceNegativeArbitraryValues, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    // Negative without arbitrary value — fine
    { code: '<div className="-translate-x-1" />', filename: 'test.tsx' },
    // Already correct form
    { code: '<div className="top-[-5px]" />', filename: 'test.tsx' },
    // No negative prefix
    { code: '<div className="w-[200px]" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="-top-[5px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'moveNegative' }],
      output: '<div className="top-[-5px]" />',
    },
    {
      code: '<div className="-translate-x-[10px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'moveNegative' }],
      output: '<div className="translate-x-[-10px]" />',
    },
    {
      code: '<div className="hover:-mt-[8px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'moveNegative' }],
      output: '<div className="hover:mt-[-8px]" />',
    },
  ],
})
