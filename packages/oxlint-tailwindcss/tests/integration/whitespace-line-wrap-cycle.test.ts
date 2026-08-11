/**
 * Regression test for issue #14:
 * `no-unnecessary-whitespace` and `enforce-consistent-line-wrapping` formed
 * an unfixable autofix cycle when both were enabled and `classesPerLine` was
 * configured.
 *
 *   1. line-wrapping splits a long template literal into the block convention
 *      (`\n` + indent … trailing `\n` + indent).
 *   2. no-unnecessary-whitespace was using `\s+` and collapsed those newlines
 *      back to single spaces.
 *   3. line-wrapping splits again. Loop.
 *
 * The fix changes `no-unnecessary-whitespace` to collapse only horizontal
 * whitespace (spaces and tabs), leaving newlines + their following indent
 * verbatim — including the indented closing backtick (#109). This file pins
 * down the convergence:
 *   - line-wrapping fix produces a block-convention multiline string.
 *   - no-unnecessary-whitespace, run on that exact output, reports nothing.
 */

import { describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noUnnecessaryWhitespace } from '../../src/rules/no-unnecessary-whitespace'
import { enforceConsistentLineWrapping } from '../../src/rules/enforce-consistent-line-wrapping'

describe('issue #14 — whitespace × line-wrapping no longer cycle', () => {
  // Step 1: line-wrapping wraps a too-many-classes template literal into a block.
  new RuleTester().run('step 1: line-wrapping autofix', enforceConsistentLineWrapping, {
    valid: [],
    invalid: [
      {
        code: 'const className = `bg-red-500 text-white hover:bg-red-600 focus:ring-2 focus:ring-red-500 disabled:bg-gray-300`',
        filename: 'a.tsx',
        options: [{ printWidth: 200, classesPerLine: 3 }],
        errors: [{ messageId: 'tooManyPerLine' }],
        output:
          'const className = `\n  bg-red-500 text-white hover:bg-red-600\n  focus:ring-2 focus:ring-red-500 disabled:bg-gray-300\n`',
      },
    ],
  })

  // Step 2: no-unnecessary-whitespace, fed the block output above, must NOT report.
  // (Before the fix, it would collapse the newline back to a space, restarting the loop.)
  new RuleTester().run(
    'step 2: whitespace stays silent on wrapped output',
    noUnnecessaryWhitespace,
    {
      valid: [
        {
          code: 'const className = `\n  bg-red-500 text-white hover:bg-red-600\n  focus:ring-2 focus:ring-red-500 disabled:bg-gray-300\n`',
          filename: 'a.tsx',
        },
      ],
      invalid: [],
    },
  )

  // Step 3: nested JSX — the block's base indent is derived from the source line,
  // so the closing backtick sits on its own INDENTED line (`\n  ` before `` ` ``).
  new RuleTester().run('step 3: nested line-wrapping autofix', enforceConsistentLineWrapping, {
    valid: [],
    invalid: [
      {
        code: 'function C() {\n  return <div className={`bg-red-500 text-white hover:bg-red-600 focus:ring-2`} />\n}',
        filename: 'a.tsx',
        options: [{ printWidth: 200, classesPerLine: 3 }],
        errors: [{ messageId: 'tooManyPerLine' }],
        output:
          'function C() {\n  return <div className={`\n    bg-red-500 text-white hover:bg-red-600\n    focus:ring-2\n  `} />\n}',
      },
    ],
  })

  // Step 4: whitespace stays silent on the nested block output — this is the case
  // #109 fixes: the indented closing backtick (`\n  ` before `` ` ``) must survive.
  new RuleTester().run(
    'step 4: whitespace stays silent on nested wrapped output',
    noUnnecessaryWhitespace,
    {
      valid: [
        {
          code: 'function C() {\n  return <div className={`\n    bg-red-500 text-white hover:bg-red-600\n    focus:ring-2\n  `} />\n}',
          filename: 'a.tsx',
        },
      ],
      invalid: [],
    },
  )
})
