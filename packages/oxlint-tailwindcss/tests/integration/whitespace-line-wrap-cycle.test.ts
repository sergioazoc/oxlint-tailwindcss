/**
 * Regression test for issue #14:
 * `no-unnecessary-whitespace` and `enforce-consistent-line-wrapping` formed
 * an unfixable autofix cycle when both were enabled and `classesPerLine` was
 * configured.
 *
 *   1. line-wrapping splits a long template literal into chunks separated by
 *      `\n` + indent.
 *   2. no-unnecessary-whitespace was using `\s+` and collapsed those newlines
 *      back to single spaces.
 *   3. line-wrapping splits again. Loop.
 *
 * The fix changes `no-unnecessary-whitespace` to collapse only horizontal
 * whitespace (spaces and tabs), leaving newlines + their following indent
 * verbatim. This file pins down the convergence:
 *   - line-wrapping fix produces a multiline string.
 *   - no-unnecessary-whitespace, run on that exact output, reports nothing.
 */

import { describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noUnnecessaryWhitespace } from '../../src/rules/no-unnecessary-whitespace'
import { enforceConsistentLineWrapping } from '../../src/rules/enforce-consistent-line-wrapping'

describe('issue #14 — whitespace × line-wrapping no longer cycle', () => {
  // Step 1: line-wrapping wraps a too-many-classes template literal.
  new RuleTester().run('step 1: line-wrapping autofix', enforceConsistentLineWrapping, {
    valid: [],
    invalid: [
      {
        code: 'const className = `bg-red-500 text-white hover:bg-red-600 focus:ring-2 focus:ring-red-500 disabled:bg-gray-300`',
        filename: 'a.tsx',
        options: [{ printWidth: 200, classesPerLine: 3 }],
        errors: [{ messageId: 'tooManyPerLine' }],
        output:
          'const className = `bg-red-500 text-white hover:bg-red-600\n                  focus:ring-2 focus:ring-red-500 disabled:bg-gray-300`',
      },
    ],
  })

  // Step 2: no-unnecessary-whitespace, fed the multiline output above, must NOT report.
  // (Before the fix, it would collapse the newline back to a space, restarting the loop.)
  new RuleTester().run(
    'step 2: whitespace stays silent on wrapped output',
    noUnnecessaryWhitespace,
    {
      valid: [
        {
          code: 'const className = `bg-red-500 text-white hover:bg-red-600\n                  focus:ring-2 focus:ring-red-500 disabled:bg-gray-300`',
          filename: 'a.tsx',
        },
      ],
      invalid: [],
    },
  )
})
