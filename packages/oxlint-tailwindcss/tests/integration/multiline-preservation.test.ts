/**
 * Multiline-preservation matrix.
 *
 * `enforce-consistent-line-wrapping` with `classesPerLine` produces strings
 * with `\n` + indent between class chunks. If any other rule's autofix
 * collapses that whitespace back to a single space, the two rules form an
 * unfixable cycle (this is the root cause of issue #14, but the same problem
 * affected ~12 other rules that used `splitClasses(...).join(' ')`).
 *
 * The fix: those rules now use `splitClassesWithSeparators` + `rebuildClassString`
 * from `class-splitter.ts`, which preserves separators verbatim for 1-to-1
 * transformations and preserves the per-line structure for length-changing ones
 * (shorthand, no-duplicate) via a `sourceIndices` map — so a block keeps its
 * grouping instead of reflowing to one class per line. This test pins down that
 * property for every migrated rule: given a multiline input, the autofix MUST
 * keep the `\n` + indent intact and NOT collapse the block.
 */

import { resolve } from 'node:path'
import { afterAll, beforeAll, describe } from 'vitest'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { makeFixtureRunner } from '../utils/with-fixture'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { enforceSortOrder } from '../../src/rules/enforce-sort-order'
import { consistentVariantOrder } from '../../src/rules/consistent-variant-order'
import { enforceConsistentImportantPosition } from '../../src/rules/enforce-consistent-important-position'
import { enforceLogical } from '../../src/rules/enforce-logical'
import { enforcePhysical } from '../../src/rules/enforce-physical'
import { enforceConsistentVariableSyntax } from '../../src/rules/enforce-consistent-variable-syntax'
import { enforceNegativeArbitraryValues } from '../../src/rules/enforce-negative-arbitrary-values'
import { enforceShorthand } from '../../src/rules/enforce-shorthand'
import { noDeprecatedClasses } from '../../src/rules/no-deprecated-classes'
import { noDuplicateClasses } from '../../src/rules/no-duplicate-classes'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'
import { noUnnecessaryArbitraryValue } from '../../src/rules/no-unnecessary-arbitrary-value'
import { preferThemeTokens } from '../../src/rules/prefer-theme-tokens'

const DEFAULT_FIXTURE = resolve(__dirname, '../fixtures/default.css')
const SHADCN_FIXTURE = resolve(__dirname, '../fixtures/shadcn.css')

// Whitespace shape produced by `enforce-consistent-line-wrapping`'s
// `classesPerLine` autofix: `\n` followed by enough spaces to align with the
// opening backtick column.
const NL = '\n                  '

describe('multiline preservation under default theme', () => {
  const run = makeFixtureRunner(DEFAULT_FIXTURE)
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(DEFAULT_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  // 1-to-1 reordering — must keep separators verbatim.
  run('enforce-sort-order keeps multiline', enforceSortOrder, {
    valid: [],
    invalid: [
      {
        code: `const className = \`text-white bg-red-500${NL}focus:ring-2\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'unsorted' }],
        output: `const className = \`bg-red-500 text-white${NL}focus:ring-2\``,
      },
    ],
  })

  // 1-to-1 canonicalization — must keep separators verbatim.
  run('enforce-canonical keeps multiline', enforceCanonical, {
    valid: [],
    invalid: [
      {
        code: `const className = \`bg-red-500 -m-0${NL}p-4\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: `const className = \`bg-red-500 m-0${NL}p-4\``,
      },
    ],
  })

  // 1-to-1 variant reordering inside one class — separators between classes untouched.
  // Default fixture loads the DS, so DS-mode order applies (state→breakpoint).
  run('consistent-variant-order keeps multiline', consistentVariantOrder, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex dark:hover:text-white${NL}p-4\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: `const className = \`flex hover:dark:text-white${NL}p-4\``,
      },
    ],
  })

  // 1-to-1 ! reposition — must keep separators verbatim.
  run('enforce-consistent-important-position keeps multiline', enforceConsistentImportantPosition, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex !p-4${NL}!m-2\``,
        filename: 'a.tsx',
        options: [{ position: 'suffix' }],
        errors: [{ messageId: 'useSuffix' }, { messageId: 'useSuffix' }],
        output: `const className = \`flex p-4!${NL}m-2!\``,
      },
    ],
  })

  // 1-to-1 physical→logical.
  run('enforce-logical keeps multiline', enforceLogical, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex ml-2${NL}pr-4\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'useLogical' }, { messageId: 'useLogical' }],
        output: `const className = \`flex ms-2${NL}pe-4\``,
      },
    ],
  })

  // 1-to-1 logical→physical.
  run('enforce-physical keeps multiline', enforcePhysical, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex ms-2${NL}pe-4\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'usePhysical' }, { messageId: 'usePhysical' }],
        output: `const className = \`flex ml-2${NL}pr-4\``,
      },
    ],
  })

  // 1-to-1 var syntax flip.
  run('enforce-consistent-variable-syntax keeps multiline', enforceConsistentVariableSyntax, {
    valid: [],
    invalid: [
      {
        code: `const className = \`bg-[var(--color-x)] flex${NL}text-[var(--color-y)]\``,
        filename: 'a.tsx',
        options: [{ syntax: 'shorthand' }],
        errors: [{ messageId: 'useShorthand' }, { messageId: 'useShorthand' }],
        output: `const className = \`bg-(--color-x) flex${NL}text-(--color-y)\``,
      },
    ],
  })

  // 1-to-1 negative arbitrary repositioning.
  run('enforce-negative-arbitrary-values keeps multiline', enforceNegativeArbitraryValues, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex -top-[5px]${NL}p-4\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'moveNegative' }],
        output: `const className = \`flex top-[-5px]${NL}p-4\``,
      },
    ],
  })

  // Length-shrinking — preserves the block structure (the surviving line keeps
  // its multi-class grouping; the merged shorthand lands at the end per the
  // rule's filter+push order). NOT collapsed to one class per line.
  run('enforce-shorthand keeps multiline', enforceShorthand, {
    valid: [],
    invalid: [
      {
        code: 'const className = `\n  flex mt-2 mb-2\n  bg-white p-4 text-black\n`',
        filename: 'a.tsx',
        errors: [{ messageId: 'shorthand' }],
        output: 'const className = `\n  flex\n  bg-white p-4 text-black my-2\n`',
      },
    ],
  })

  // 1-to-1 deprecation rewrite.
  run('no-deprecated-classes keeps multiline', noDeprecatedClasses, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex flex-grow${NL}p-4\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'deprecated' }],
        output: `const className = \`flex grow${NL}p-4\``,
      },
    ],
  })

  // Length-shrinking — removes the dup, keeps each line's grouping. The `\n`
  // that the removed dup did NOT carry stays put; line 1 keeps two classes.
  run('no-duplicate-classes keeps multiline', noDuplicateClasses, {
    valid: [],
    invalid: [
      {
        code: 'const className = `\n  flex flex items-center\n  bg-white p-4\n`',
        filename: 'a.tsx',
        errors: [{ messageId: 'duplicate' }],
        output: 'const className = `\n  flex items-center\n  bg-white p-4\n`',
      },
    ],
  })

  // Suggestion-only (typo fix); still needs to preserve multiline in the suggestion.
  run('no-unknown-classes suggestion keeps multiline', noUnknownClasses, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex itms-center${NL}p-4\``,
        filename: 'a.tsx',
        errors: [
          {
            messageId: 'unknownWithSuggestion',
            suggestions: [
              {
                messageId: 'suggestReplace',
                data: { className: 'itms-center', replacement: 'items-center' },
                output: `const className = \`flex items-center${NL}p-4\``,
              },
            ],
          },
        ],
      },
    ],
  })

  // 1-to-1 arbitrary→named.
  run('no-unnecessary-arbitrary-value keeps multiline', noUnnecessaryArbitraryValue, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex h-[auto]${NL}p-4\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'unnecessaryArbitrary' }],
        output: `const className = \`flex h-auto${NL}p-4\``,
      },
    ],
  })
})

describe('multiline preservation under shadcn-style theme', () => {
  const run = makeFixtureRunner(SHADCN_FIXTURE)
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(SHADCN_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  // 1-to-1 named-equivalent suggestion.
  run('prefer-theme-tokens keeps multiline', preferThemeTokens, {
    valid: [],
    invalid: [
      {
        code: `const className = \`flex border-(--border)${NL}p-4\``,
        filename: 'a.tsx',
        errors: [{ messageId: 'preferNamed' }],
        output: `const className = \`flex border-border${NL}p-4\``,
      },
    ],
  })
})
