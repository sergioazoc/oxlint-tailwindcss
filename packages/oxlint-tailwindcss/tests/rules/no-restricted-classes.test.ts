import { RuleTester } from 'oxlint/plugins-dev'
import { noRestrictedClasses } from '../../src/rules/no-restricted-classes'

const ruleTester = new RuleTester()

// Without options: rule is a no-op
ruleTester.run('no-restricted-classes (no options)', noRestrictedClasses, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="hidden" />', filename: 'test.tsx' },
  ],
  invalid: [],
})

// With exact class restrictions
ruleTester.run('no-restricted-classes (exact)', noRestrictedClasses, {
  valid: [
    {
      code: '<div className="flex items-center" />',
      filename: 'test.tsx',
      options: [{ classes: ['hidden', 'block'] }],
    },
  ],
  invalid: [
    {
      code: '<div className="hidden" />',
      filename: 'test.tsx',
      options: [{ classes: ['hidden'] }],
      errors: [{ messageId: 'restricted' }],
    },
    {
      code: '<div className="flex hidden items-center" />',
      filename: 'test.tsx',
      options: [{ classes: ['hidden'] }],
      errors: [{ messageId: 'restricted' }],
    },
  ],
})

// With pattern restrictions
ruleTester.run('no-restricted-classes (patterns)', noRestrictedClasses, {
  valid: [
    {
      code: '<div className="flex items-center" />',
      filename: 'test.tsx',
      options: [{ patterns: [{ pattern: '^float-' }] }],
    },
  ],
  invalid: [
    {
      code: '<div className="float-left" />',
      filename: 'test.tsx',
      options: [{ patterns: [{ pattern: '^float-', message: 'Use flexbox' }] }],
      errors: [{ messageId: 'restrictedWithMessage' }],
    },
    {
      code: 'cn("float-right")',
      filename: 'test.tsx',
      options: [{ patterns: [{ pattern: '^float-' }] }],
      errors: [{ messageId: 'restricted' }],
    },
  ],
})
