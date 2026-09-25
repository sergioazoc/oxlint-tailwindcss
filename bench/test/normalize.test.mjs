import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classOf, keyOf, normalizeReport, serializeSnapshot, splitCode } from '../lib/normalize.mjs'

const diag = (overrides = {}) => ({
  message: '"md:min-w-[450px]" uses an arbitrary value.',
  code: 'tailwindcss(no-arbitrary-value)',
  severity: 'warning',
  filename: 'registry/new-york-v4/examples/demo.tsx',
  labels: [{ span: { offset: 240, length: 45, line: 11, column: 17 } }],
  ...overrides,
})

describe('splitCode', () => {
  it('splits tool and rule', () => {
    assert.deepEqual(splitCode('tailwindcss(no-unknown-classes)'), {
      tool: 'tailwindcss',
      rule: 'no-unknown-classes',
    })
    assert.deepEqual(splitCode('shadcn(no-restyle)'), { tool: 'shadcn', rule: 'no-restyle' })
  })

  it('keeps a code without a rule as the tool', () => {
    assert.deepEqual(splitCode('weird'), { tool: 'weird', rule: '' })
  })
})

describe('classOf', () => {
  it('takes the first quoted class for our plugin and shadcn', () => {
    assert.equal(classOf('tailwindcss', '"flx" is not a valid Tailwind class.'), 'flx')
    assert.equal(classOf('shadcn', 'Use a theme color instead of "bg-pink-500".'), 'bg-pink-500')
  })

  it('understands better-tailwindcss message shapes', () => {
    assert.equal(
      classOf('better-tailwindcss', 'Unknown class detected: dialog-ring'),
      'dialog-ring',
    )
    assert.equal(classOf('better-tailwindcss', 'Replace "rounded" with "rounded-sm".'), 'rounded')
  })

  it('returns null when the message names no class', () => {
    assert.equal(classOf('tailwindcss', 'Incorrect class order.'), null)
  })
})

describe('normalizeReport', () => {
  it('produces stable records sorted by key', () => {
    const records = normalizeReport({
      diagnostics: [
        diag({ filename: 'b.tsx' }),
        diag({ filename: 'a.tsx', labels: [{ span: { line: 3, column: 1, length: 2 } }] }),
      ],
    })
    assert.deepEqual(
      records.map((r) => r.file),
      ['a.tsx', 'b.tsx'],
    )
    assert.equal(records[0].line, 3)
    assert.equal(records[0].cls, 'md:min-w-[450px]')
  })

  it('normalizes Windows paths so snapshots compare across platforms', () => {
    const [record] = normalizeReport({ diagnostics: [diag({ filename: 'app\\page.tsx' })] })
    assert.equal(record.file, 'app/page.tsx')
  })

  it('tolerates diagnostics without labels', () => {
    const [record] = normalizeReport({ diagnostics: [diag({ labels: [] })] })
    assert.equal(record.line, 0)
    assert.equal(record.column, 0)
  })

  it('keys ignore the message wording', () => {
    const [a] = normalizeReport({ diagnostics: [diag()] })
    const [b] = normalizeReport({
      diagnostics: [diag({ message: '"md:min-w-[450px]" other text' })],
    })
    assert.equal(keyOf(a), keyOf(b))
  })
})

describe('serializeSnapshot', () => {
  it('round-trips through JSON.parse with one record per line', () => {
    const records = normalizeReport({ diagnostics: [diag(), diag({ filename: 'z.tsx' })] })
    const snapshot = { meta: { config: 'otw-all', wallMs: 1 }, records }
    const text = serializeSnapshot(snapshot)
    assert.deepEqual(JSON.parse(text), snapshot)
    const recordLines = text.split('\n').filter((line) => line.startsWith('  {"tool"'))
    assert.equal(recordLines.length, 2)
  })

  it('serializes an empty snapshot', () => {
    const snapshot = { meta: {}, records: [] }
    assert.deepEqual(JSON.parse(serializeSnapshot(snapshot)), snapshot)
  })
})
