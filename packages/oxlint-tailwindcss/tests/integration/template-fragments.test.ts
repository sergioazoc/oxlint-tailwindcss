/**
 * Template-fragment matrix.
 *
 * In `` `bg-${c}-500 p-4` `` the class `bg-${c}-500` is built at runtime: the
 * static text glued to the `${}` (`bg-`, `-500`) is a FRAGMENT of one class, not
 * a class of its own. The extractor used to hand those fragments to every rule,
 * and the fixers' `preserveSpaces` then inserted a space at the `${}` boundary —
 * where the source had none — splitting the class in two:
 *
 *   no-duplicate-classes   `bg-${c}-500 p-4 p-4` → `bg-${c} -500 p-4`
 *   enforce-logical        `ml-2 text-${c}`      → `ms-2 text- ${c}`
 *
 * Now glued fragments are cut out of what rules see, so a fix only ever rewrites
 * the self-contained classes around them and the dynamic class is left byte for
 * byte. Every fixer and suggester is exercised here; the two rules that reason
 * about raw whitespace/layout (`no-unnecessary-whitespace`,
 * `enforce-consistent-line-wrapping`) and `max-class-count` opt into the raw
 * view and are covered in their own suites.
 */

import { resolve } from 'node:path'
import { afterAll, beforeAll, describe } from 'vitest'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { makeFixtureRunner } from '../utils/with-fixture'
import { consistentVariantOrder } from '../../src/rules/consistent-variant-order'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { enforceConsistentImportantPosition } from '../../src/rules/enforce-consistent-important-position'
import { enforceConsistentVariableSyntax } from '../../src/rules/enforce-consistent-variable-syntax'
import { enforceLogical } from '../../src/rules/enforce-logical'
import { enforceNegativeArbitraryValues } from '../../src/rules/enforce-negative-arbitrary-values'
import { enforceShorthand } from '../../src/rules/enforce-shorthand'
import { enforceSortOrder } from '../../src/rules/enforce-sort-order'
import { noDeprecatedClasses } from '../../src/rules/no-deprecated-classes'
import { noDuplicateClasses } from '../../src/rules/no-duplicate-classes'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'
import { noUnnecessaryArbitraryValue } from '../../src/rules/no-unnecessary-arbitrary-value'
import { preferScaleToken } from '../../src/rules/prefer-scale-token'
import { preferThemeTokens } from '../../src/rules/prefer-theme-tokens'

const DEFAULT_FIXTURE = resolve(__dirname, '../fixtures/default.css')
const SHADCN_FIXTURE = resolve(__dirname, '../fixtures/shadcn.css')

/** `const className = \`…\`` with the template body as given. */
const tpl = (body: string) => `const className = \`${body}\``

describe('template fragments glued to ${} are left intact', () => {
  const run = makeFixtureRunner(DEFAULT_FIXTURE)
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(DEFAULT_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  // --- The reproduced corruptions -----------------------------------------

  run('no-duplicate-classes', noDuplicateClasses, {
    valid: [{ code: tpl('bg-${c}-500 p-4'), filename: 'a.tsx' }],
    invalid: [
      {
        code: tpl('bg-${c}-500 p-4 p-4'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('bg-${c}-500 p-4'),
      },
      {
        // Duplicates on both sides of an expression, no glue: unchanged behavior.
        code: tpl('${a} flex flex ${b}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('${a} flex ${b}'),
      },
    ],
  })

  run('enforce-logical', enforceLogical, {
    valid: [],
    invalid: [
      {
        code: tpl('ml-2 text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('ms-2 text-${c}'),
      },
    ],
  })

  run('enforce-consistent-important-position', enforceConsistentImportantPosition, {
    valid: [],
    invalid: [
      {
        code: tpl('bg-${c}-500 !p-4'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('bg-${c}-500 p-4!'),
      },
    ],
  })

  run('enforce-consistent-variable-syntax', enforceConsistentVariableSyntax, {
    valid: [],
    invalid: [
      {
        code: tpl('bg-${c}-500 w-[var(--w)]'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('bg-${c}-500 w-(--w)'),
      },
    ],
  })

  // --- Ordering rules must not move a fragment --------------------------------

  run('enforce-sort-order', enforceSortOrder, {
    valid: [{ code: tpl('flex p-4 text-${c}'), filename: 'a.tsx' }],
    invalid: [
      {
        code: tpl('p-4 flex text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('flex p-4 text-${c}'),
      },
    ],
  })

  run('consistent-variant-order', consistentVariantOrder, {
    valid: [],
    invalid: [
      {
        code: tpl('hover:dark:flex text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('dark:hover:flex text-${c}'),
      },
    ],
  })

  // --- Other fixers ----------------------------------------------------------

  run('enforce-shorthand', enforceShorthand, {
    valid: [],
    invalid: [
      {
        code: tpl('w-4 h-4 text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('size-4 text-${c}'),
      },
    ],
  })

  run('enforce-canonical', enforceCanonical, {
    valid: [],
    invalid: [
      {
        code: tpl('-m-0 text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('m-0 text-${c}'),
      },
    ],
  })

  run('no-deprecated-classes', noDeprecatedClasses, {
    valid: [],
    invalid: [
      {
        code: tpl('bg-gradient-to-b text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('bg-linear-to-b text-${c}'),
      },
    ],
  })

  run('enforce-negative-arbitrary-values', enforceNegativeArbitraryValues, {
    valid: [],
    invalid: [
      {
        code: tpl('-top-[5px] text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('top-[-5px] text-${c}'),
      },
    ],
  })

  run('no-unnecessary-arbitrary-value', noUnnecessaryArbitraryValue, {
    valid: [],
    invalid: [
      {
        code: tpl('w-[100%] text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('w-full text-${c}'),
      },
    ],
  })

  // --- Suggesters ------------------------------------------------------------

  run('no-unknown-classes ignores fragments', noUnknownClasses, {
    valid: [
      { code: tpl('bg-${c}-500 p-2'), filename: 'a.tsx' },
      { code: tpl('${a}-${b}'), filename: 'a.tsx' },
      { code: tpl('text-${size} font-bold'), filename: 'a.tsx' },
      { code: 'const className = tw`bg-${c}-500 p-2`', filename: 'a.tsx' },
      { code: `const x = cn(\`bg-\${c}-500 p-2\`)`, filename: 'a.tsx' },
    ],
    invalid: [
      {
        code: tpl('itms-center text-${c}'),
        filename: 'a.tsx',
        errors: [
          {
            messageId: 'unknownWithSuggestion',
            suggestions: [
              {
                messageId: 'suggestReplace',
                data: { className: 'itms-center', replacement: 'items-center' },
                output: tpl('items-center text-${c}'),
              },
            ],
          },
        ],
      },
    ],
  })

  run('prefer-scale-token suggestion', preferScaleToken, {
    valid: [],
    invalid: [
      {
        code: tpl('p-[16px] text-${c}'),
        filename: 'a.tsx',
        errors: [
          {
            messageId: 'preferToken',
            suggestions: [
              {
                messageId: 'suggestReplace',
                data: { className: 'p-[16px]', replacement: 'p-4' },
                output: tpl('p-4 text-${c}'),
              },
            ],
          },
        ],
      },
    ],
  })
})

describe('template fragments under a theme with named tokens', () => {
  const run = makeFixtureRunner(SHADCN_FIXTURE)
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(SHADCN_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  run('prefer-theme-tokens', preferThemeTokens, {
    valid: [],
    invalid: [
      {
        code: tpl('border-(--border) text-${c}'),
        filename: 'a.tsx',
        errors: 1,
        output: tpl('border-border text-${c}'),
      },
    ],
  })
})
