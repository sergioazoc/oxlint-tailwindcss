import { resolve } from 'node:path'
import { beforeAll, afterAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { enforceSortOrder } from '../../src/rules/enforce-sort-order'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('enforce-sort-order (design system sorting)', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  afterAll(() => {
    resetDesignSystem()
  })

  const ruleTester = new RuleTester()

  ruleTester.run('enforce-sort-order', enforceSortOrder, {
    valid: [
      {
        code: '<div className="text-muted scale-125 opacity-50 hover:scale-150 hover:opacity-75" />',
        filename: 'test.tsx',
      },
      {
        code: '<div className="text-muted size-6" />',
        filename: 'test.tsx',
      },
      {
        code: '<div className="ml-4 flex h-24 border-2 border-gray-300 p-3 text-gray-700 shadow-md" />',
        filename: 'test.tsx',
      },
    ],
    invalid: [
      {
        code: '<div className="scale-125 text-muted opacity-50 hover:scale-150 hover:opacity-75" />',
        output: '<div className="text-muted scale-125 opacity-50 hover:scale-150 hover:opacity-75" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unsorted' }],
      },
      {
        code: '<div className="size-6 text-muted" />',
        output: '<div className="text-muted size-6" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unsorted' }],
      },
    ],
  })
})