import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  columnMismatches,
  combinedGaps,
  exampleFiles,
  firedRules,
  generatedFence,
  mappingGaps,
} from '../lib/interop.mjs'

const concerns = [
  { id: 'a', examples: ['<x />', '<y />'], shadcn: ['no-raw-colors'], ours: [], use: 'shadcn' },
  { id: 'b', examples: ['<z />'], shadcn: [], ours: ['no-unknown-classes'], use: 'ours' },
]
const diag = (filename, code) => ({ filename: `src/${filename}`, code })

describe('exampleFiles', () => {
  it('names one file per example', () => {
    assert.deepEqual(
      exampleFiles(concerns).map((e) => e.file),
      ['a-0.tsx', 'a-1.tsx', 'b-0.tsx'],
    )
  })
})

describe('firedRules', () => {
  it('groups tool/rule by file, scoped packages included', () => {
    const fired = firedRules({
      diagnostics: [diag('a-0.tsx', 'shadcn(no-raw-colors)'), diag('a-0.tsx', 'tailwindcss(x)')],
    })
    assert.deepEqual([...fired.get('a-0.tsx')], ['shadcn/no-raw-colors', 'tailwindcss/x'])
  })
})

describe('columnMismatches', () => {
  it('is empty when every listed rule fires and nothing else does', () => {
    const fired = firedRules({ diagnostics: [diag('a-1.tsx', 'shadcn(no-raw-colors)')] })
    assert.deepEqual(columnMismatches(concerns, fired, 'shadcn', 'shadcn'), [])
  })

  it('names a rule that is not listed, and a listed rule that never fires', () => {
    const fired = firedRules({ diagnostics: [diag('b-0.tsx', 'shadcn(no-unknown-classes)')] })
    assert.deepEqual(columnMismatches(concerns, fired, 'shadcn', 'shadcn'), [
      'a: shadcn/no-raw-colors is listed but reports none of its examples',
      'b: <z /> is reported by shadcn/no-unknown-classes, not listed',
    ])
  })

  it("ignores the other tool's rules", () => {
    const fired = firedRules({
      diagnostics: [diag('a-0.tsx', 'shadcn(no-raw-colors)'), diag('a-0.tsx', 'tailwindcss(y)')],
    })
    assert.deepEqual(columnMismatches(concerns, fired, 'shadcn', 'shadcn'), [])
  })
})

describe('combinedGaps', () => {
  it('names an example nobody reports and an owner that reports nothing', () => {
    const fired = firedRules({ diagnostics: [diag('a-0.tsx', 'tailwindcss(z)')] })
    assert.deepEqual(combinedGaps(concerns, fired), [
      'a: nothing reports <y />',
      'a: left to shadcn, which reports none of its examples',
      'b: nothing reports <z />',
      'b: left to ours, which reports none of its examples',
    ])
  })
})

describe('generatedFence', () => {
  it('reads the JSON(C) between the markers', () => {
    const md =
      'x\n<!-- generated:c -->\n```jsonc\n{\n  // note\n  "a": 1,\n}\n```\n<!-- /generated:c -->\n'
    assert.deepEqual(generatedFence(md, 'c'), { a: 1 })
  })
})

describe('mappingGaps', () => {
  const rows = [{ theirs: 'no-x', ours: 'no-y', example: '<a />' }]
  it('is empty when both rules report the example and every rule has a row', () => {
    const theirs = firedRules({ diagnostics: [diag('btw-0.tsx', 'better-tailwindcss(no-x)')] })
    const ours = firedRules({ diagnostics: [diag('btw-0.tsx', 'tailwindcss(no-y)')] })
    assert.deepEqual(mappingGaps(rows, ['no-x'], theirs, ours), [])
  })

  it('names a silent rule on either side and an unmapped rule', () => {
    const none = firedRules({ diagnostics: [] })
    assert.deepEqual(mappingGaps(rows, ['no-x', 'no-z'], none, none), [
      "no-x: doesn't report <a />",
      "no-y (for no-x): doesn't report <a />",
      'no-z: a rule of theirs with no row',
    ])
  })
})
