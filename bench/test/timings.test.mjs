import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseTimings } from '../lib/timings.mjs'

// Verbatim tail of `oxlint -f default --debug=timings` (oxlint 1.85.0).
const SAMPLE = `Found 2515 warnings and 105 errors.
Finished in 1.4s on 880 files with 22 rules using 12 threads.
Rule timings:
Rule                                                Time (ms)  Relative  Calls  Source
-------------------------------------------------  ----------  --------  -----  ---------
tailwindcss/no-unknown-classes                        489.486     42.4%  22331  js-plugin
tailwindcss/enforce-sort-order                        390.065     33.8%  22331  js-plugin
tailwindcss/enforce-consistent-line-wrapping            5.702      0.5%  22331  js-plugin
JS plugin runtime:
  Total:             1285.933ms
  Rule callbacks:    1154.085ms
  Shared overhead:    131.849ms
`

describe('parseTimings', () => {
  it('parses every rule row', () => {
    const { rules } = parseTimings(SAMPLE)
    assert.equal(rules.length, 3)
    assert.deepEqual(rules[0], {
      rule: 'tailwindcss/no-unknown-classes',
      ms: 489.486,
      share: 42.4,
      calls: 22331,
      source: 'js-plugin',
    })
  })

  it('parses the JS plugin runtime totals', () => {
    assert.deepEqual(parseTimings(SAMPLE).jsRuntime, {
      totalMs: 1285.933,
      callbacksMs: 1154.085,
      overheadMs: 131.849,
    })
  })

  it('returns empty results when no table was printed (e.g. the agent formatter)', () => {
    assert.deepEqual(parseTimings('a.tsx:1:1: warning tailwindcss(x): y\n'), {
      rules: [],
      jsRuntime: {},
    })
  })

  it('ignores the header and separator lines', () => {
    const { rules } = parseTimings(SAMPLE)
    assert.ok(rules.every((r) => r.rule.includes('/')))
  })
})
