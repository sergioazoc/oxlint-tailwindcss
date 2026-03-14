import { RuleTester } from 'oxlint/plugins-dev'
import { enforceConsistentVariableSyntax } from '../../src/rules/enforce-consistent-variable-syntax'

const ruleTester = new RuleTester()

// Default syntax: shorthand
ruleTester.run('enforce-consistent-variable-syntax', enforceConsistentVariableSyntax, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="bg-(--primary)" />', filename: 'test.tsx' },
    { code: '<div className="text-(--text-color)" />', filename: 'test.tsx' },
    // Complex expressions should NOT be converted
    {
      code: '<div className="bg-[color-mix(in_srgb,var(--primary),transparent)]" />',
      filename: 'test.tsx',
    },
  ],
  invalid: [
    {
      code: '<div className="bg-[var(--primary)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useShorthand' }],
      output: '<div className="bg-(--primary)" />',
    },
    {
      code: '<div className="text-[var(--text-color)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useShorthand' }],
      output: '<div className="text-(--text-color)" />',
    },
    {
      code: '<div className="bg-[var(--primary)] text-[var(--text)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useShorthand' }, { messageId: 'useShorthand' }],
      output: '<div className="bg-(--primary) text-(--text)" />',
    },
    // With variants
    {
      code: '<div className="hover:bg-[var(--primary)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useShorthand' }],
      output: '<div className="hover:bg-(--primary)" />',
    },
    {
      code: '<div className="dark:hover:text-[var(--color)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useShorthand' }],
      output: '<div className="dark:hover:text-(--color)" />',
    },
  ],
})

// Custom syntax: explicit
ruleTester.run('enforce-consistent-variable-syntax (explicit)', enforceConsistentVariableSyntax, {
  valid: [
    {
      code: '<div className="bg-[var(--primary)]" />',
      filename: 'test.tsx',
      options: [{ syntax: 'explicit' }],
    },
  ],
  invalid: [
    {
      code: '<div className="bg-(--primary)" />',
      filename: 'test.tsx',
      options: [{ syntax: 'explicit' }],
      errors: [{ messageId: 'useExplicit' }],
      output: '<div className="bg-[var(--primary)]" />',
    },
    {
      code: '<div className="text-(--text-color)" />',
      filename: 'test.tsx',
      options: [{ syntax: 'explicit' }],
      errors: [{ messageId: 'useExplicit' }],
      output: '<div className="text-[var(--text-color)]" />',
    },
  ],
})
