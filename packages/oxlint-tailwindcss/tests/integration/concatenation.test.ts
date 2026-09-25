/**
 * Class strings built with `+`.
 *
 * `"flex p-4 " + extra` holds complete classes every rule should check, and
 * `"bg-" + color` builds a class at runtime that Tailwind never sees written
 * out. The extractor used to skip concatenations entirely. Now each string
 * operand is read like a template quasi, glued to its neighbours only where
 * the source is: a neighbouring string that ends (or starts) with whitespace
 * doesn't glue, an expression always does. So complete classes are linted,
 * glued fragments are left byte for byte, and `no-dynamic-classes` reports the
 * runtime class, written as a template (`bg-${color}-500`).
 */

import { resolve } from 'node:path'
import { afterAll, beforeAll, describe } from 'vitest'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { makeFixtureRunner } from '../utils/with-fixture'
import { enforceLogical } from '../../src/rules/enforce-logical'
import { enforceSortOrder } from '../../src/rules/enforce-sort-order'
import { noDuplicateClasses } from '../../src/rules/no-duplicate-classes'
import { noDynamicClasses } from '../../src/rules/no-dynamic-classes'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'
import { noUnnecessaryWhitespace } from '../../src/rules/no-unnecessary-whitespace'

const DEFAULT_FIXTURE = resolve(__dirname, '../fixtures/default.css')

const cls = (expr: string) => `const className = ${expr}`

describe('class strings built with +', () => {
  const run = makeFixtureRunner(DEFAULT_FIXTURE)
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(DEFAULT_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  const dynamic = (className: string) => ({ messageId: 'dynamicClass', data: { className } })

  run('no-dynamic-classes', noDynamicClasses, {
    valid: [
      { code: cls('"p-4 " + extra'), filename: 'a.tsx' },
      { code: cls('"flex " + "p-4"'), filename: 'a.tsx' },
      { code: cls('"flex" + " p-4"'), filename: 'a.tsx' },
      { code: cls('"p-4 " + (active ? "flex" : "")'), filename: 'a.tsx' },
      { code: cls('extra + " p-4"'), filename: 'a.tsx' },
      { code: cls('a + b'), filename: 'a.tsx' },
      { code: cls('1 + 2'), filename: 'a.tsx' },
      // Not a Tailwind root: a class of the project's own, built at runtime.
      { code: cls('"card-" + name'), filename: 'a.tsx' },
    ],
    invalid: [
      { code: cls('"bg-" + color'), filename: 'a.tsx', errors: [dynamic('bg-${color}')] },
      {
        code: cls('"p-4 bg-" + color + "-500"'),
        filename: 'a.tsx',
        errors: [dynamic('bg-${color}-500')],
      },
      {
        code: cls('"from-" + a + "-" + b + " p-4"'),
        filename: 'a.tsx',
        errors: [dynamic('from-${a}-${b}')],
      },
      {
        // Written out, but in two strings: Tailwind reads each on its own.
        code: cls('"bg-" + "red-500"'),
        filename: 'a.tsx',
        errors: [dynamic('bg-red-500')],
      },
      { code: cls('"hover:" + suffix'), filename: 'a.tsx', errors: [dynamic('hover:${suffix}')] },
      { code: cls('"p-" + 4'), filename: 'a.tsx', errors: [dynamic('p-${4}')] },
      { code: cls('"w-" + props.size'), filename: 'a.tsx', errors: [dynamic('w-${props.size}')] },
      { code: cls('"w-" + sizes[i]'), filename: 'a.tsx', errors: [dynamic('w-${…}')] },
      {
        code: '<div className={"p-2 text-" + tone} />',
        filename: 'a.tsx',
        errors: [dynamic('text-${tone}')],
      },
      { code: 'cn("mt-" + gap)', filename: 'a.tsx', errors: [dynamic('mt-${gap}')] },
      {
        code: cls('(big ? "p-" : "m-") + size'),
        filename: 'a.tsx',
        errors: [dynamic('p-${size}'), dynamic('m-${size}')],
      },
    ],
  })

  run('no-unknown-classes', noUnknownClasses, {
    valid: [
      { code: cls('"flex p-4 " + extra'), filename: 'a.tsx' },
      // The glued fragment is not a class of its own.
      { code: cls('"bg-" + color + "-500 p-4"'), filename: 'a.tsx' },
    ],
    invalid: [
      {
        code: cls('"flx p-4 " + extra'),
        filename: 'a.tsx',
        errors: [{ messageId: 'unknownWithSuggestion' }],
      },
      {
        code: cls('"flex " + (active ? "itms-center" : "")'),
        filename: 'a.tsx',
        errors: [{ messageId: 'unknownWithSuggestion' }],
      },
      {
        // No string operand of its own, but the conditional holds classes.
        code: cls('base + (active ? " itms-center" : "")'),
        filename: 'a.tsx',
        errors: [{ messageId: 'unknownWithSuggestion' }],
      },
    ],
  })

  run('no-duplicate-classes', noDuplicateClasses, {
    valid: [],
    invalid: [
      {
        code: cls('"flex flex " + extra'),
        filename: 'a.tsx',
        errors: 1,
        output: cls('"flex " + extra'),
      },
      {
        // The fragments glued to `c` stay exactly where they are.
        code: cls('"bg-" + c + "-500 p-4 p-4"'),
        filename: 'a.tsx',
        errors: 1,
        output: cls('"bg-" + c + "-500 p-4"'),
      },
    ],
  })

  run('enforce-sort-order', enforceSortOrder, {
    valid: [],
    invalid: [
      {
        code: cls('"p-4 flex " + extra'),
        filename: 'a.tsx',
        errors: 1,
        output: cls('"flex p-4 " + extra'),
      },
    ],
  })

  run('enforce-logical', enforceLogical, {
    valid: [],
    invalid: [
      {
        code: cls('"ml-2 text-" + c'),
        filename: 'a.tsx',
        errors: 1,
        output: cls('"ms-2 text-" + c'),
      },
    ],
  })

  run('no-unnecessary-whitespace', noUnnecessaryWhitespace, {
    valid: [
      // The space at the `+` is what separates the two classes.
      { code: cls('"flex " + "p-4"'), filename: 'a.tsx' },
      { code: cls('"flex" + " p-4"'), filename: 'a.tsx' },
      { code: cls('"flex p-4 " + extra'), filename: 'a.tsx' },
    ],
    invalid: [
      {
        code: cls('"flex  p-4 " + extra'),
        filename: 'a.tsx',
        errors: 1,
        output: cls('"flex p-4 " + extra'),
      },
    ],
  })
})
