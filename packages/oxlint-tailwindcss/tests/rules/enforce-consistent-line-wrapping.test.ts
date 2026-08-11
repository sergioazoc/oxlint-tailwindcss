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

// #110 — printWidth is measured against the LONGEST LINE, not the raw total.
ruleTester.run(
  'enforce-consistent-line-wrapping (#110 longest line)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // Already split: no single line exceeds 80 even though the raw total does.
      {
        code: 'const className = `\n  flex items-center justify-between p-4\n  m-2 bg-white text-black rounded shadow-lg\n`',
        filename: 'test.tsx',
      },
    ],
    invalid: [
      // Still one long line — reports.
      {
        code: `const className = \`${veryLongClass}\``,
        filename: 'test.tsx',
        errors: [{ messageId: 'tooLong' }],
      },
      // Wrapped, but one line is itself still too long — reports.
      {
        code: `const className = \`\n  ${veryLongClass}\n  p-4\n\``,
        filename: 'test.tsx',
        errors: [{ messageId: 'tooLong' }],
      },
    ],
  },
)

// #111 — classesPerLine counts PER LINE, and the autofix wraps into the block
// convention non-destructively.
ruleTester.run(
  'enforce-consistent-line-wrapping (#111 per-line + block autofix)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // 3 per line, classesPerLine 4 — no line exceeds the budget.
      {
        code: 'const className = `\n  class1 class2 class3\n  class4 class5 class6\n`',
        filename: 'test.tsx',
        options: [{ classesPerLine: 4 }],
      },
    ],
    invalid: [
      // Single line → converted to the block convention (exact issue output).
      {
        code: 'const className = `class1 class2 class3 class4 class5`',
        filename: 'test.tsx',
        options: [{ classesPerLine: 2 }],
        errors: [{ messageId: 'tooManyPerLine' }],
        output: 'const className = `\n  class1 class2\n  class3 class4\n  class5\n`',
      },
      // Already a block: only the overfull line is re-wrapped; conforming lines
      // (and the leading/trailing structure) are left verbatim.
      {
        code: 'const className = `\n  a b c d e\n  f g\n`',
        filename: 'test.tsx',
        options: [{ classesPerLine: 2 }],
        errors: [{ messageId: 'tooManyPerLine' }],
        output: 'const className = `\n  a b\n  c d\n  e\n  f g\n`',
      },
      // Nested JSX: base indent derived from the source line (exercises
      // context.sourceCode), so the block nests at the element's indentation.
      {
        code: 'function C() {\n  return <div className={`flex items-center justify-between p-4`} />\n}',
        filename: 'test.tsx',
        options: [{ classesPerLine: 2 }],
        errors: [{ messageId: 'tooManyPerLine' }],
        output:
          'function C() {\n  return <div className={`\n    flex items-center\n    justify-between p-4\n  `} />\n}',
      },
    ],
  },
)
