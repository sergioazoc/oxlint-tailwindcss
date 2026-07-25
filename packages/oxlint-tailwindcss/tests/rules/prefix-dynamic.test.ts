/**
 * User-written values under a Tailwind project prefix.
 *
 * The lint-time declaration service asks the design system for classes the
 * precompute never saw. A prefixed design system only resolves the PREFIXED form,
 * so asking with the bare name resolved nothing at all and every arbitrary value
 * went silently uncompared in prefixed projects.
 */

import { resolve } from 'node:path'
import { beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

const PREFIX_ENTRY = resolve(__dirname, '../fixtures/with-prefix.css')

describe('no-conflicting-classes under a project prefix', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(PREFIX_ENTRY)
  })

  runWithFixture(new RuleTester(), 'prefix + dynamic values', noConflictingClasses, PREFIX_ENTRY, {
    valid: [{ code: '<div className="tw:p-4 tw:m-4" />', filename: 'test.tsx' }],
    invalid: [
      {
        code: '<div className="tw:p-4 tw:p-[5px]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'conflictUnordered' }],
      },
      {
        code: '<div className="tw:w-[10px] tw:w-[20px]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'conflictUnordered' }],
      },
    ],
  })
})
