import { RuleTester } from 'oxlint/plugins-dev'
import { noDarkWithoutLight } from '../../src/rules/no-dark-without-light'

const ruleTester = new RuleTester()

// Default: watches dark variant
ruleTester.run('no-dark-without-light', noDarkWithoutLight, {
  valid: [
    { code: '<div className="bg-white text-black" />', filename: 'test.tsx' },
    { code: '<div className="bg-white dark:bg-gray-900" />', filename: 'test.tsx' },
    { code: '<div className="text-black dark:text-white" />', filename: 'test.tsx' },
    {
      code: '<div className="bg-white dark:bg-gray-900 text-black dark:text-white" />',
      filename: 'test.tsx',
    },
    { code: '<div className="hover:bg-blue-500" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="dark:bg-gray-900" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingBase' }],
    },
    {
      code: '<div className="bg-white dark:bg-gray-900 dark:text-white" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingBase' }],
    },
    {
      code: 'cn("dark:bg-gray-900")',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingBase' }],
    },
  ],
})

// Custom variants: watch both dark and contrast-more
ruleTester.run('no-dark-without-light (custom variants)', noDarkWithoutLight, {
  valid: [
    // dark: not watched → no error
    {
      code: '<div className="dark:bg-gray-900" />',
      filename: 'test.tsx',
      options: [{ variants: ['contrast-more'] }],
    },
    // contrast-more: with matching base → OK
    {
      code: '<div className="bg-white contrast-more:bg-black" />',
      filename: 'test.tsx',
      options: [{ variants: ['contrast-more'] }],
    },
  ],
  invalid: [
    {
      code: '<div className="contrast-more:bg-black" />',
      filename: 'test.tsx',
      options: [{ variants: ['contrast-more'] }],
      errors: [{ messageId: 'missingBase' }],
    },
  ],
})
