import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildConcerns,
  loadConcerns,
  parseExpectations,
  scoreExpectations,
} from '../lib/concerns.mjs'
import { LOCAL_DIST } from '../lib/runner.mjs'

const BENCH = dirname(dirname(fileURLToPath(import.meta.url)))
const REPO = dirname(BENCH)

const shadcnData = {
  concerns: [
    {
      id: 'palette',
      label: { en: 'P', es: 'P' },
      ours: ['no-default-palette'],
      shadcn: ['no-raw-colors'],
    },
    { id: 'order', label: { en: 'O', es: 'O' }, ours: ['enforce-sort-order'], shadcn: [] },
  ],
}
const btwData = {
  rules: [
    { theirs: 'enforce-consistent-class-order', ours: 'enforce-sort-order' },
    { theirs: 'no-unknown-classes', ours: 'no-unknown-classes' },
  ],
}
const extraData = {
  extra: [{ id: 'unknown', label: { en: 'U', es: 'U' }, ours: ['no-unknown-classes'] }],
  formatting: ['order'],
}
const concerns = buildConcerns(shadcnData, btwData, extraData)
const rec = (tool, rule, line) => ({ tool, rule, line })

describe('buildConcerns', () => {
  it("takes ours and shadcn's rules from the /shadcn data, and derives better-tailwindcss's", () => {
    assert.deepEqual([...concerns.get('palette').rules.shadcn], ['no-raw-colors'])
    assert.deepEqual(
      [...concerns.get('order').rules['better-tailwindcss']],
      ['enforce-consistent-class-order'],
    )
    assert.deepEqual(
      [...concerns.get('unknown').rules['better-tailwindcss']],
      ['no-unknown-classes'],
    )
    assert.equal(concerns.get('order').formatting, true)
    assert.equal(concerns.get('palette').formatting, false)
  })

  it('refuses a concern defined twice', () => {
    assert.throws(
      () => buildConcerns(shadcnData, btwData, { extra: [{ id: 'palette', ours: [] }] }),
      /defined twice/,
    )
  })
})

describe('parseExpectations', () => {
  it('labels the line after each expect: comment', () => {
    const source = [
      '<div>',
      '  {/* expect: palette, unknown */}',
      '  <p className="x" />',
      '  // expect: ok',
      '  <p />',
    ].join('\n')
    assert.deepEqual(parseExpectations(source), [
      { line: 3, concerns: ['palette', 'unknown'] },
      { line: 5, concerns: ['ok'] },
    ])
  })
})

describe('scoreExpectations', () => {
  const expectations = [
    { line: 3, concerns: ['palette'] },
    { line: 5, concerns: ['ok'] },
  ]

  it('catches a mistake reported with a rule of its concern, not with another', () => {
    const caught = scoreExpectations(
      expectations,
      [rec('shadcn', 'no-raw-colors', 3)],
      'shadcn',
      concerns,
    )
    assert.equal(caught[0].caught, true)
    const other = scoreExpectations(
      expectations,
      [rec('tailwindcss', 'enforce-sort-order', 3)],
      'tailwindcss',
      concerns,
    )
    assert.equal(other[0].caught, false)
  })

  it('a formatting report on an ok line is no false alarm; a correctness one, or an unmapped rule, is', () => {
    const records = [
      rec('tailwindcss', 'enforce-sort-order', 5),
      rec('tailwindcss', 'no-default-palette', 5),
      rec('tailwindcss', 'some-new-rule', 5),
    ]
    const [, ok] = scoreExpectations(expectations, records, 'tailwindcss', concerns)
    assert.deepEqual(ok.alarms, ['no-default-palette', 'some-new-rule'])
  })

  it('refuses an unknown concern', () => {
    assert.throws(
      () => scoreExpectations([{ line: 1, concerns: ['palete'] }], [], 'tailwindcss', concerns),
      /unknown concern "palete"/,
    )
  })
})

describe('the real data', () => {
  const real = loadConcerns(REPO)

  it('labels every seeded file with known concerns only', () => {
    for (const file of readdirSync(join(BENCH, 'synthetic'))) {
      const expectations = parseExpectations(readFileSync(join(BENCH, 'synthetic', file), 'utf8'))
      assert.ok(expectations.length > 0, `${file} has no expect: labels`)
      for (const { line, concerns: ids } of expectations) {
        for (const id of ids) assert.ok(id === 'ok' || real.has(id), `${file}:${line}: "${id}"`)
      }
    }
  })

  it("names every rule of each tool's all-rules config in some concern", () => {
    const configs = {
      shadcn: 'configs/shadcn-all.json',
      'better-tailwindcss': 'configs/btw-all.json',
    }
    for (const [tool, path] of Object.entries(configs)) {
      const { rules } = JSON.parse(readFileSync(join(BENCH, path), 'utf8'))
      const named = new Set([...real.values()].flatMap((c) => [...c.rules[tool]]))
      for (const key of Object.keys(rules)) {
        const rule = key.slice(key.indexOf('/') + 1)
        assert.ok(named.has(rule), `${tool}/${rule} is in no concern`)
      }
    }
  })

  it(
    'names every oxlint-tailwindcss rule in some concern',
    { skip: !existsSync(LOCAL_DIST) },
    () => {
      const plugin = createRequire(import.meta.url)(LOCAL_DIST)
      const named = new Set([...real.values()].flatMap((c) => [...c.rules.tailwindcss]))
      for (const rule of Object.keys((plugin.default ?? plugin).rules)) {
        assert.ok(named.has(rule), `tailwindcss/${rule} is in no concern`)
      }
    },
  )
})
