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
// Without `wrapLines`, printWidth is warn-only: no autofix, and multiline templates
// are never re-laid-out.
ruleTester.run(
  'enforce-consistent-line-wrapping (#110 longest line, default warn-only)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // Already split (in the canonical packed layout): no single line exceeds
      // 80 even though the raw total does.
      {
        code: 'const className = `\n  flex items-center justify-between p-4 m-2 bg-white text-black rounded\n  shadow-lg\n`',
        filename: 'test.tsx',
      },
      // Hand-formatted multiline template, every line well under 80: untouched
      // and unreported under the default config — the width-based re-layout is
      // opt-in via `wrapLines`.
      {
        code: 'const className = `\n  flex\n  items-center\n  p-4\n`',
        filename: 'test.tsx',
      },
      // Same, non-canonical grouping within the width: still untouched.
      {
        code: 'const className = `\n  flex hover:underline\n  items-center\n`',
        filename: 'test.tsx',
      },
    ],
    invalid: [
      // Still one long line — reports, but does NOT autofix (wrapLines
      // is unset).
      {
        code: `const className = \`${veryLongClass}\``,
        filename: 'test.tsx',
        errors: [{ messageId: 'tooLong' }],
      },
      // Wrapped, but one line is itself still too long — reports, no fix.
      {
        code: `const className = \`\n  ${veryLongClass}\n  p-4\n\``,
        filename: 'test.tsx',
        errors: [{ messageId: 'tooLong' }],
      },
    ],
  },
)

// wrapLines: 'overWidth' — only the lines that actually exceed the
// budget are greedily re-packed (no variant grouping); everything else,
// including conforming lines of a touched template, stays verbatim.
ruleTester.run(
  'enforce-consistent-line-wrapping (wrapLines: over-width)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // Multiline, within budget, NOT in the canonical grouped layout: left
      // exactly as hand-formatted (this is the difference from 'all').
      {
        code: 'const className = `\n  flex hover:underline\n  items-center\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
      },
    ],
    invalid: [
      // Single long line — no hand layout to preserve, so it converts to the
      // block convention (greedily packed).
      {
        code: `const className = \`${veryLongClass}\``,
        filename: 'test.tsx',
        options: [{ wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  flex items-center justify-between p-4 m-2 bg-white text-black rounded\n  shadow-lg border w-full\n`',
      },
      // Wrapped, but one line is itself still too long — ONLY that line is
      // repacked; the conforming `p-4` line survives verbatim instead of
      // being absorbed into a whole-template re-layout.
      {
        code: `const className = \`\n  ${veryLongClass}\n  p-4\n\``,
        filename: 'test.tsx',
        options: [{ wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  flex items-center justify-between p-4 m-2 bg-white text-black rounded\n  shadow-lg border w-full\n  p-4\n`',
      },
      // Conforming lines around the offending one stay verbatim, even when
      // they mix variant runs (`flex hover:underline`) — 'overWidth' never
      // re-groups, it only splits the over-budget line.
      {
        code: 'const className = `\n  flex hover:underline\n  items-center justify-between gap-4 rounded-lg p-6\n  focus:outline-none\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  flex hover:underline\n  items-center justify-between gap-4\n  rounded-lg p-6\n  focus:outline-none\n`',
      },
      // Greedy packing, not variant grouping: the same input the 'all'
      // block lays out as four run-per-line lines packs into two here.
      {
        code: 'const className = `p-2 md:p-4 md:m-2 md:hover:bg-blue-500 md:hover:text-white`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  p-2 md:p-4 md:m-2 md:hover:bg-blue-500\n  md:hover:text-white\n`',
      },
      // Multiline quasi after a `${}` whose value starts with `\n`: the
      // 'overWidth' fix keeps lines in place and must NOT gain a stray
      // boundary space before the newline.
      {
        code: 'const className = `${base}\n  flex items-center justify-between gap-4 rounded-lg p-6\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `${base}\n  flex items-center justify-between\n  gap-4 rounded-lg p-6\n`',
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

// Width-based fixer (wrapLines: 'all', no classesPerLine): classes grouped
// into runs by variant chain (each run starts its own line), packed to the
// print width; every multiline template is normalized to that layout.
ruleTester.run(
  'enforce-consistent-line-wrapping (width fixer + variant groups)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // Single line within budget: untouched.
      {
        code: 'const className = `flex hover:underline`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
      },
      // Already in the canonical grouped layout: no report.
      {
        code: 'const className = `\n  flex items-center\n  hover:bg-red-500 hover:underline\n  focus:outline-none\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
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
        options: [{ printWidth: 20, wrapLines: 'all' }],
      },
      // Fragment adjacent to `${}` already in the canonical hanging layout:
      // the preserved leading space must not read as "inconsistent".
      {
        code: 'const className = `${base} flex items-center gap-2\n  hover:bg-red-500 hover:underline`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
      },
    ],
    invalid: [
      // Group recognition: base, hover: and focus: runs each get their own
      // line even when two of them would fit together within the width.
      {
        code: 'const className = `flex items-center gap-2 hover:bg-red-500 hover:underline focus:outline-none`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  flex items-center gap-2\n  hover:bg-red-500 hover:underline\n  focus:outline-none\n`',
      },
      // Chained variants: `md:hover:` is one run, distinct from `md:`; a run
      // that exceeds the width packs across its own lines, never sharing one.
      {
        code: 'const className = `p-2 md:p-4 md:m-2 md:hover:bg-blue-500 md:hover:text-white`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  p-2\n  md:p-4 md:m-2\n  md:hover:bg-blue-500\n  md:hover:text-white\n`',
      },
      // Within the width but not grouped by variant: normalized to the
      // canonical layout under the inconsistentWrapping message.
      {
        code: 'const className = `\n  flex hover:underline\n  items-center\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'inconsistentWrapping' }],
        output: 'const className = `\n  flex\n  hover:underline\n  items-center\n`',
      },
      // Fragment adjacent to `${}`: hanging join (no leading/trailing
      // newline), one character reserved for the preserved leading space.
      {
        code: 'const className = `${base} flex items-center gap-2 hover:bg-red-500 hover:underline`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `${base} flex items-center gap-2\n  hover:bg-red-500 hover:underline`',
      },
      // Nested JSX: base indent derived from the source line, and the indent
      // counts against the width budget when packing.
      {
        code: 'function C() {\n  return <div className={`flex items-center justify-between gap-2 p-4`} />\n}',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'function C() {\n  return <div className={`\n    flex items-center justify-between\n    gap-2 p-4\n  `} />\n}',
      },
    ],
  },
)

// group option (wrapLines: 'all' layout): 'newLine' is the default
// (covered by the block above); 'emptyLine' separates variant runs with a
// blank line; 'never' packs greedily across run boundaries.
ruleTester.run('enforce-consistent-line-wrapping (group option)', enforceConsistentLineWrapping, {
  valid: [
    // Canonical emptyLine layout: blank lines between variant runs, and the
    // blank lines carry no trailing whitespace.
    {
      code: 'const className = `\n  flex items-center gap-2\n\n  hover:bg-red-500 hover:underline\n\n  focus:outline-none\n`',
      filename: 'test.tsx',
      options: [{ printWidth: 40, wrapLines: 'all', group: 'emptyLine' }],
    },
    // Canonical group: 'never' layout: greedily packed, no run breaks.
    {
      code: 'const className = `\n  p-2 md:p-4 md:m-2 md:hover:bg-blue-500\n  md:hover:text-white\n`',
      filename: 'test.tsx',
      options: [{ printWidth: 40, wrapLines: 'all', group: 'never' }],
    },
  ],
  invalid: [
    // emptyLine: over-width single line lays out with blank group separators.
    {
      code: 'const className = `flex items-center gap-2 hover:bg-red-500 hover:underline focus:outline-none`',
      filename: 'test.tsx',
      options: [{ printWidth: 40, wrapLines: 'all', group: 'emptyLine' }],
      errors: [{ messageId: 'tooLong' }],
      output:
        'const className = `\n  flex items-center gap-2\n\n  hover:bg-red-500 hover:underline\n\n  focus:outline-none\n`',
    },
    // emptyLine: a newLine-shaped block within budget is normalized to the
    // blank-line-separated form.
    {
      code: 'const className = `\n  flex items-center gap-2\n  hover:bg-red-500 hover:underline\n  focus:outline-none\n`',
      filename: 'test.tsx',
      options: [{ printWidth: 40, wrapLines: 'all', group: 'emptyLine' }],
      errors: [{ messageId: 'inconsistentWrapping' }],
      output:
        'const className = `\n  flex items-center gap-2\n\n  hover:bg-red-500 hover:underline\n\n  focus:outline-none\n`',
    },
    // emptyLine: hanging fragment after a `${}` — the blank separator works
    // in the hanging join too.
    {
      code: 'const className = `${base} flex items-center gap-2 hover:bg-red-500 hover:underline`',
      filename: 'test.tsx',
      options: [{ printWidth: 40, wrapLines: 'all', group: 'emptyLine' }],
      errors: [{ messageId: 'tooLong' }],
      output:
        'const className = `${base} flex items-center gap-2\n\n  hover:bg-red-500 hover:underline`',
    },
    // never: the same input the newLine layout splits into four run-per-line
    // lines packs greedily into two.
    {
      code: 'const className = `p-2 md:p-4 md:m-2 md:hover:bg-blue-500 md:hover:text-white`',
      filename: 'test.tsx',
      options: [{ printWidth: 40, wrapLines: 'all', group: 'never' }],
      errors: [{ messageId: 'tooLong' }],
      output:
        'const className = `\n  p-2 md:p-4 md:m-2 md:hover:bg-blue-500\n  md:hover:text-white\n`',
    },
    // never: a run-per-line block within budget is normalized to the greedy
    // packing.
    {
      code: 'const className = `\n  p-2\n  md:p-4 md:m-2\n  md:hover:bg-blue-500\n  md:hover:text-white\n`',
      filename: 'test.tsx',
      options: [{ printWidth: 40, wrapLines: 'all', group: 'never' }],
      errors: [{ messageId: 'inconsistentWrapping' }],
      output:
        'const className = `\n  p-2 md:p-4 md:m-2 md:hover:bg-blue-500\n  md:hover:text-white\n`',
    },
  ],
})

// A LEADING quasi (the text between the opening backtick and the first `${}`)
// takes the block form, never the hanging join: hanging would land its first
// packed line on the physical line that already holds the code before the
// backtick — over-width output the per-quasi line measurement can't re-detect.
ruleTester.run(
  'enforce-consistent-line-wrapping (leading quasi before a `${}`)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // Canonical converged form: block-form leading quasi, the `${}` on its
      // own interior-indented line, the following quasi hanging after it.
      {
        code: 'const className = `\n  flex items-center justify-between\n  gap-4 rounded-lg\n  ${cond} px-6 py-3 shadow-md`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
      },
    ],
    invalid: [
      // The leading quasi's line exceeds the budget: it re-wraps as a block
      // (leading newline preserved), NOT as a hanging join glued onto the
      // `const className = \`` line.
      {
        code: 'const className = `\n  flex items-center justify-between gap-4 rounded-lg\n  ${cond}\n  px-6 py-3 shadow-md\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }, { messageId: 'inconsistentWrapping' }],
        output:
          'const className = `\n  flex items-center justify-between\n  gap-4 rounded-lg\n  ${cond} px-6 py-3 shadow-md`',
      },
    ],
  },
)

// Edge cases pinning the width fixer's design constraints down (PR #126
// review): important `!`, a Tailwind v4 project prefix, tab indentation, a
// quasi with `${}` on both sides, and empty / glued fragments.
ruleTester.run(
  'enforce-consistent-line-wrapping (width fixer edge cases)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // Whitespace-only templates: nothing to wrap, no report.
      {
        code: 'const className = `   `',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
      },
      {
        code: 'const className = `\n  \n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
      },
      // Canonical prefixed layout stays put (the prefix reads as part of the
      // variant chain, so `tw:`- and `tw:hover:`-runs group separately).
      {
        code: 'const className = `\n  tw:flex tw:items-center tw:gap-2\n  tw:hover:bg-red-500 tw:hover:underline\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
      },
    ],
    invalid: [
      // Important `!` in both spellings (prefix `!flex`, suffix
      // `items-center!`) and inside a variant (`hover:!bg-red-500`): the `!`
      // travels with its class and never affects the variant-run grouping.
      {
        code: 'const className = `!flex items-center! gap-2 hover:!bg-red-500 hover:!underline focus:!outline-none`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  !flex items-center! gap-2\n  hover:!bg-red-500 hover:!underline\n  focus:!outline-none\n`',
      },
      // Tailwind v4 project prefix: `tw:` counts toward the variant chain, so
      // base utilities (`tw:`) and variants (`tw:hover:`) form separate runs.
      {
        code: 'const className = `tw:flex tw:items-center tw:gap-2 tw:hover:bg-red-500 tw:hover:underline`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  tw:flex tw:items-center tw:gap-2\n  tw:hover:bg-red-500 tw:hover:underline\n`',
      },
      // Tab-indented source: the tab is reused as the base indent (the width
      // budget counts it as one column — see packToWidth).
      {
        code: 'function C() {\n\treturn <div className={`flex items-center justify-between gap-2 p-4`} />\n}',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'function C() {\n\treturn <div className={`\n\t  flex items-center justify-between\n\t  gap-2 p-4\n\t`} />\n}',
      },
      // Quasi with `${}` on BOTH sides: hanging join, one character reserved
      // on each side for the preserved spaces.
      {
        code: 'const className = `${a} flex items-center justify-between gap-2 rounded-lg p-4 ${b} m-2`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `${a} flex items-center justify-between\n  gap-2 rounded-lg p-4 ${b} m-2`',
      },
      // A quasi GLUED to a `${}` (no whitespace at the boundary): `${a}flex`
      // is ONE runtime class, so the fixer must never introduce whitespace
      // there — reports, but no fix.
      {
        code: 'const className = `${a}flex items-center gap-2 p-4 m-2 bg-white text-black rounded-lg shadow`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'all' }],
        errors: [{ messageId: 'tooLong' }],
      },
    ],
  },
)

// The same edge cases under wrapLines: 'overWidth' — the fix is per-line and
// greedy, but `!`, a project prefix, tabs, and the `${}` shapes must behave
// identically.
ruleTester.run(
  'enforce-consistent-line-wrapping (wrapLines: overWidth edge cases)',
  enforceConsistentLineWrapping,
  {
    valid: [
      // Whitespace-only templates: nothing to wrap, no report.
      {
        code: 'const className = `   `',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
      },
      {
        code: 'const className = `\n  \n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
      },
    ],
    invalid: [
      // Important `!` (prefix, suffix, and inside a variant) travels with its
      // class; the conforming `!flex` line stays, and the repacked line packs
      // greedily across the base/hover boundary.
      {
        code: 'const className = `\n  !flex\n  items-center! gap-2 hover:!bg-red-500 hover:!underline\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  !flex\n  items-center! gap-2 hover:!bg-red-500\n  hover:!underline\n`',
      },
      // Tailwind v4 project prefix: `tw:` never separates from its class, and
      // the conforming `tw:flex` line stays verbatim.
      {
        code: 'const className = `\n  tw:flex\n  tw:items-center tw:gap-2 tw:hover:bg-red-500 tw:hover:underline\n`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  tw:flex\n  tw:items-center tw:gap-2\n  tw:hover:bg-red-500 tw:hover:underline\n`',
      },
      // Tab-indented source: the tab is reused as the base indent in the
      // single-line block conversion.
      {
        code: 'function C() {\n\treturn <div className={`flex items-center justify-between gap-2 p-4`} />\n}',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'function C() {\n\treturn <div className={`\n\t  flex items-center justify-between\n\t  gap-2 p-4\n\t`} />\n}',
      },
      // Quasi with `${}` on BOTH sides: hanging form, one character reserved
      // on each side for the preserved spaces.
      {
        code: 'const className = `${a} flex items-center justify-between gap-2 rounded-lg p-4 ${b} m-2`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `${a} flex items-center justify-between\n  gap-2 rounded-lg p-4 ${b} m-2`',
      },
      // Single-line LEADING quasi (before the first `${}`): block form with
      // the `${}` on its own interior-indented line, never a hanging join
      // glued onto the code before the backtick.
      {
        code: 'const className = `flex items-center justify-between gap-4 rounded-lg ${cond}`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
        output:
          'const className = `\n  flex items-center justify-between\n  gap-4 rounded-lg\n  ${cond}`',
      },
      // Glued quasi: warn-only under 'overWidth' too.
      {
        code: 'const className = `${a}flex items-center gap-2 p-4 m-2 bg-white text-black rounded-lg shadow`',
        filename: 'test.tsx',
        options: [{ printWidth: 40, wrapLines: 'overWidth' }],
        errors: [{ messageId: 'tooLong' }],
      },
    ],
  },
)
