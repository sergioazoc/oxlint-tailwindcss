/**
 * Composition through a variable that is NOT named `--tw-<property>`.
 *
 * This is issue #93's mechanism. `tailwind-scrollbar` gives `scrollbar-thin` a
 * `scrollbar-color` that forwards `--scrollbar-thumb`/`--scrollbar-track`, and the
 * colour utilities supply them; Tailwind core ships its own `scrollbar-thumb-*`
 * writing `--tw-scrollbar-*`. Comparing property NAMES called that a conflict, and
 * the previous escape hatch could not see it because it keyed on the `--tw-`
 * convention.
 *
 * The fixture reproduces the shape with `@utility` instead of the plugin, so the
 * test covers the mechanism and CI needs no third-party dependency.
 */

import { resolve } from 'node:path'
import { beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

const ENTRY = resolve(__dirname, '../fixtures/with-foreign-vars.css')

describe('composition over foreign custom properties', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY)
  })

  runWithFixture(new RuleTester(), 'foreign vars', noConflictingClasses, ENTRY, {
    valid: [
      // The reader's variables are both supplied by the other two classes, so
      // whichever declaration wins the cascade resolves to the same colours.
      // This is the combination issue #93 reported.
      {
        code: '<div className="gutter-thin gutter-thumb-red-500 gutter-track-gray-100" />',
        filename: 'test.tsx',
      },
      {
        code: '<div className="overflow-auto gutter-thin gutter-thumb-red-500 gutter-track-gray-100" />',
        filename: 'test.tsx',
      },
      // Two writers of DIFFERENT variables, both forwarding the same declaration.
      {
        code: '<div className="gutter-thumb-red-500 gutter-track-gray-100" />',
        filename: 'test.tsx',
      },
    ],
    invalid: [
      // Only the thumb is supplied: the reader and the writer disagree on what
      // `scrollbar-color` resolves to, so which declaration wins is observable.
      {
        code: '<div className="gutter-thin gutter-thumb-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'conflict' }],
      },
      // Two writers of the SAME variable is a real conflict.
      {
        code: '<div className="gutter-thumb-red-500 gutter-thumb-blue-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'conflict' }],
      },
      // The over-suppression guard: the reader's variable IS supplied by the
      // group, but the class that wins the cascade supplies none of it and
      // declares the property concretely — so the reader really is discarded.
      {
        code: '<div className="gutter-thin gutter-supply-red-500 gutter-fixed" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'conflict' }],
      },
    ],
  })
})
