import { resolve } from 'node:path'
import { beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('user-written values', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  // The stylesheet position of a user-written value is not knowable from the
  // precomputed order (it borrows a prefix sibling's), so the diagnostic reports
  // the clash without claiming a winner.
  const conflict = (classes: string) => ({
    code: `<div className="${classes}" />`,
    filename: 'test.tsx',
    errors: [{ messageId: 'conflictUnordered' }],
  })

  runWithFixture(
    new RuleTester(),
    'no-conflicting-classes (dynamic)',
    noConflictingClasses,
    ENTRY_POINT,
    {
      valid: [
        { code: '<div className="p-[5px] m-[5px]" />', filename: 'test.tsx' },
        { code: '<div className="mask-b-from-[20%] mask-b-from-black" />', filename: 'test.tsx' },
        { code: '<div className="bg-[#fff]/50 text-[#000]" />', filename: 'test.tsx' },
      ],
      invalid: [
        conflict('p-4 p-[5px]'),
        conflict('w-[10px] w-[20px]'),
        conflict('gap-13 gap-15'),
        conflict('border-1 border-2'),
        conflict('bg-red-500/50 bg-blue-500'),
        conflict('text-[#fff] text-[#000]'),
      ],
    },
  )
})
