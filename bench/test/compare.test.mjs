import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compareRecords } from '../lib/compare.mjs'

const rec = (overrides = {}) => ({
  tool: 'tailwindcss',
  rule: 'no-unknown-classes',
  file: 'a.tsx',
  line: 1,
  column: 1,
  length: 3,
  cls: 'flx',
  severity: 'error',
  message: '"flx" is not a valid Tailwind class.',
  ...overrides,
})

describe('compareRecords', () => {
  it('reports identical inputs as identical', () => {
    const records = [rec(), rec({ line: 2 })]
    const result = compareRecords(records, [...records])
    assert.equal(result.identical, true)
    assert.deepEqual(result.added, [])
    assert.deepEqual(result.removed, [])
  })

  it('classifies added and removed diagnostics', () => {
    const before = [rec(), rec({ line: 2, cls: 'itms-center' })]
    const after = [rec(), rec({ line: 3, cls: 'fex' })]
    const result = compareRecords(before, after)
    assert.deepEqual(
      result.added.map((r) => r.cls),
      ['fex'],
    )
    assert.deepEqual(
      result.removed.map((r) => r.cls),
      ['itms-center'],
    )
    assert.equal(result.identical, false)
  })

  it('counts duplicates instead of collapsing them', () => {
    const result = compareRecords([rec()], [rec(), rec()])
    assert.equal(result.added.length, 1)
  })

  it('reports message-only changes separately', () => {
    const result = compareRecords([rec()], [rec({ message: 'new wording' })])
    assert.equal(result.added.length, 0)
    assert.equal(result.removed.length, 0)
    assert.equal(result.messageChanged.length, 1)
    assert.equal(result.identical, false)
  })

  it('builds a per-rule table with deltas', () => {
    const result = compareRecords(
      [rec(), rec({ rule: 'no-duplicate-classes' })],
      [rec(), rec({ line: 9 }), rec({ tool: 'shadcn', rule: 'no-restyle' })],
    )
    const byRule = Object.fromEntries(result.perRule.map((r) => [r.rule, r.delta]))
    assert.deepEqual(byRule, {
      'shadcn(no-restyle)': 1,
      'tailwindcss(no-duplicate-classes)': -1,
      'tailwindcss(no-unknown-classes)': 1,
    })
  })
})
