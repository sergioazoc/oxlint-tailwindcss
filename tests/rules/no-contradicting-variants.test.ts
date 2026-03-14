import { RuleTester } from 'oxlint/plugins-dev'
import { noContradictingVariants } from '../../src/rules/no-contradicting-variants'

const ruleTester = new RuleTester()

ruleTester.run('no-contradicting-variants', noContradictingVariants, {
  valid: [
    // No variants
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    // Different utilities — not contradicting
    { code: '<div className="text-white dark:text-black" />', filename: 'test.tsx' },
    // Different values for same prefix
    { code: '<div className="bg-white hover:bg-blue-500" />', filename: 'test.tsx' },
    // Only variant classes, no base
    { code: '<div className="hover:flex dark:flex" />', filename: 'test.tsx' },
  ],
  invalid: [
    // Base flex + dark:flex → dark:flex is redundant
    {
      code: '<div className="flex dark:flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'redundantVariant' }],
    },
    // Base hidden + hover:hidden
    {
      code: '<div className="hidden hover:hidden" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'redundantVariant' }],
    },
    // Multiple redundant
    {
      code: '<div className="flex hover:flex dark:flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'redundantVariant' }, { messageId: 'redundantVariant' }],
    },
  ],
})
