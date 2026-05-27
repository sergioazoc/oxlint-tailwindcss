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
    // CSS variable is NOT a hardcoded color
    { code: '<div className="bg-[var(--primary)]" />', filename: 'test.tsx' },
    // CSS variable wrapped in a color function (e.g. theme tokens stored as
    // raw channels) is not hardcoded.
    { code: '<div className="bg-[hsl(var(--primary))]" />', filename: 'test.tsx' },
    { code: '<div className="text-[hsla(var(--fg),0.8)]" />', filename: 'test.tsx' },
    { code: '<div className="border-[rgb(var(--border))]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[rgb(var(--r),var(--g),var(--b))]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[rgba(var(--bg),0.5)]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[oklch(var(--bg))]" />', filename: 'test.tsx' },
    { code: '<div className="text-[lab(var(--fg))]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[lch(var(--bg))]" />', filename: 'test.tsx' },
    { code: '<div className="border-[hwb(var(--border))]" />', filename: 'test.tsx' },
    {
      code: '<div className="text-[color(display-p3_var(--r)_var(--g)_var(--b))]" />',
      filename: 'test.tsx',
    },
    // var() with fallback containing a color literal — still references a variable
    { code: '<div className="bg-[var(--primary,#fff)]" />', filename: 'test.tsx' },
    // Nested gradient stops are outside this rule's non-recursive scope.
    { code: '<div className="bg-[linear-gradient(hsl(var(--a)),#fff)]" />', filename: 'test.tsx' },
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
    // Important modifier with hardcoded color
    {
      code: '<div className="!bg-[#ff5733]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // oklch
    {
      code: '<div className="bg-[oklch(0.5_0.2_240)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // oklab
    {
      code: '<div className="text-[oklab(0.5_0.1_-0.1)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // hwb
    {
      code: '<div className="border-[hwb(120_10%_20%)]" />',
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
