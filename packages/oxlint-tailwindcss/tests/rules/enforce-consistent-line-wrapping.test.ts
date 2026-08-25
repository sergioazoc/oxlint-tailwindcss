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
      // Already split (in the canonical packed layout): no single line exceeds
      // 80 even though the raw total does.
      {
        code: 'const className = `\n  flex items-center justify-between p-4 m-2 bg-white text-black rounded\n  shadow-lg\n`',
        filename: 'test.tsx',
      },
    ],
    invalid: [
      // Still one long line — reports, and (no classesPerLine set) autofixes
      // into the width-packed block.
      {
        code: `const className = \`${veryLongClass}\``,
        filename: 'test.tsx',
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  flex items-center justify-between p-4 m-2 bg-white text-black rounded\n  shadow-lg border w-full\n`',
      },
      // Wrapped, but one line is itself still too long — reports and repacks.
      {
        code: `const className = \`\n  ${veryLongClass}\n  p-4\n\``,
        filename: 'test.tsx',
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  flex items-center justify-between p-4 m-2 bg-white text-black rounded\n  shadow-lg border w-full p-4\n`',
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

// Width-based fixer (printWidth without classesPerLine): classes grouped
// into runs by variant chain (each run starts its own line), packed to the
// print width.
ruleTester.run(
  'enforce-consistent-line-wrapping (width fixer + variant groups)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // Single line within budget: untouched.
      {
        code: 'const className = `flex hover:underline`',
        filename: 'test.tsx',
        options: [{ printWidth: 40 }],
      },
      // Already in the canonical grouped layout: no report.
      {
        code: 'const className = `\n  flex items-center\n  hover:bg-red-500 hover:underline\n  focus:outline-none\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40 }],
      },
      // A single class can never be wrapped shorter, so an over-budget single
      // class is not counted against the print width.
      {
        code: '<div className="supercalifragilisticexpialidocious-classname" />',
        filename: 'test.tsx',
        options: [{ printWidth: 20 }],
      },
      {
        code: 'const className = `w-[calc(100vw-theme(spacing.24))]`',
        filename: 'test.tsx',
        options: [{ printWidth: 20 }],
      },
      // Fragment adjacent to `${}` already in the canonical hanging layout:
      // the preserved leading space must not read as "inconsistent".
      {
        code: 'const className = `${base} flex items-center gap-2\n  hover:bg-red-500 hover:underline`',
        filename: 'test.tsx',
        options: [{ printWidth: 40 }],
      },
    ],
    invalid: [
      // Group recognition: base, hover: and focus: runs each get their own
      // line even when two of them would fit together within the width.
      {
        code: 'const className = `flex items-center gap-2 hover:bg-red-500 hover:underline focus:outline-none`',
        filename: 'test.tsx',
        options: [{ printWidth: 40 }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  flex items-center gap-2\n  hover:bg-red-500 hover:underline\n  focus:outline-none\n`',
      },
      // Chained variants: `md:hover:` is one run, distinct from `md:`; a run
      // that exceeds the width packs across its own lines, never sharing one.
      {
        code: 'const className = `p-2 md:p-4 md:m-2 md:hover:bg-blue-500 md:hover:text-white`',
        filename: 'test.tsx',
        options: [{ printWidth: 40 }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  p-2\n  md:p-4 md:m-2\n  md:hover:bg-blue-500\n  md:hover:text-white\n`',
      },
      // Within the width but not grouped by variant: normalized to the
      // canonical layout under the inconsistentWrapping message.
      {
        code: 'const className = `\n  flex hover:underline\n  items-center\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40 }],
        errors: [{ messageId: 'inconsistentWrapping' }],
        output: 'const className = `\n  flex\n  hover:underline\n  items-center\n`',
      },
      // Fragment adjacent to `${}`: hanging join (no leading/trailing
      // newline), one character reserved for the preserved leading space.
      {
        code: 'const className = `${base} flex items-center gap-2 hover:bg-red-500 hover:underline`',
        filename: 'test.tsx',
        options: [{ printWidth: 40 }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `${base} flex items-center gap-2\n  hover:bg-red-500 hover:underline`',
      },
      // Nested JSX: base indent derived from the source line, and the indent
      // counts against the width budget when packing.
      {
        code: 'function C() {\n  return <div className={`flex items-center justify-between gap-2 p-4`} />\n}',
        filename: 'test.tsx',
        options: [{ printWidth: 40 }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'function C() {\n  return <div className={`\n    flex items-center justify-between\n    gap-2 p-4\n  `} />\n}',
      },
    ],
  },
)
