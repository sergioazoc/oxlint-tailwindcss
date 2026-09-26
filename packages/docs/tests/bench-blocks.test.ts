import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  benchFixChanges,
  benchFixes,
  benchOracles,
  benchSeeded,
  benchSeededLines,
  benchSetup,
  benchSpeed,
  comparisonCoverage,
  comparisonSummary,
  type BenchResults,
} from '../scripts/bench-blocks.ts'

const fix = (
  strings: number,
  changed: BenchResults['oracles']['tailwindcss']['fixes']['autofix']['changed'] = [],
) => ({
  files: strings,
  strings,
  equivalent: strings - changed.length,
  typos: [],
  changed,
  unpaired: [],
})
const change = (before: string, after: string, key = '& | width') => ({
  file: 'a.tsx',
  before,
  after,
  diff: { changed: [{ key, before: '20px', after: null }], removedUnknown: [], addedUnknown: [] },
})

const R: BenchResults = {
  meta: {
    corpus: {
      repo: 'https://github.com/shadcn-ui/ui.git',
      sha: '98a1fe67b439324d',
      app: 'apps/v4',
    },
    runs: 5,
    machine: { cpu: 'Some CPU', cores: 8, os: 'linux 6' },
    node: 'v24.1.0',
    tools: {
      tailwindcss: { name: 'oxlint-tailwindcss', version: '1.14.0', config: 'otw-all' },
      shadcn: { name: '@shadcn/lint', version: '0.2.0', config: 'shadcn-all' },
      'better-tailwindcss': {
        name: 'eslint-plugin-better-tailwindcss',
        version: '4.7.0',
        config: 'btw-all',
      },
    },
    oxlint: '1.85.0',
    tailwindcss: '4.3.3',
  },
  concerns: [
    {
      id: 'unknown',
      label: { en: 'Unknown class', es: 'Clase desconocida' },
      formatting: false,
      rules: {
        tailwindcss: ['no-unknown-classes'],
        shadcn: ['no-unknown-classes'],
        'better-tailwindcss': ['no-unknown-classes'],
      },
    },
    {
      id: 'order',
      label: { en: 'Order', es: 'Orden' },
      formatting: true,
      rules: {
        tailwindcss: ['enforce-sort-order'],
        shadcn: [],
        'better-tailwindcss': ['enforce-consistent-class-order'],
      },
    },
    {
      id: 'conflicts',
      label: { en: 'Conflict', es: 'Conflicto' },
      formatting: false,
      rules: {
        tailwindcss: ['no-conflicting-classes'],
        shadcn: [],
        'better-tailwindcss': ['no-conflicting-classes'],
      },
    },
  ],
  seeded: {
    lines: [
      {
        file: '06.tsx',
        line: 5,
        concerns: ['unknown'],
        code: '<div className="itms-center" />',
        tools: {
          tailwindcss: { caught: true, by: ['no-unknown-classes'] },
          shadcn: { caught: true, by: [] },
          'better-tailwindcss': { caught: false, by: [] },
        },
      },
      {
        file: '05.tsx',
        line: 7,
        concerns: ['conflicts'],
        code: '<div className="p-4 p-6" />',
        tools: {
          tailwindcss: { caught: true, by: [] },
          shadcn: { caught: false, by: [] },
          'better-tailwindcss': { caught: true, by: [] },
        },
      },
      {
        file: '06.tsx',
        line: 9,
        concerns: ['ok'],
        code: '<div className="bg-surface" />',
        tools: {
          tailwindcss: { alarms: [] },
          shadcn: { alarms: ['no-raw-colors'] },
          'better-tailwindcss': { alarms: [] },
        },
      },
    ],
    summary: {
      tailwindcss: { caught: 2, mistakes: 2, falseAlarms: 0, ok: 1 },
      shadcn: { caught: 1, mistakes: 2, falseAlarms: 1, ok: 1 },
      'better-tailwindcss': { caught: 1, mistakes: 2, falseAlarms: 0, ok: 1 },
    },
  },
  corpus: {
    tailwindcss: {
      all: { config: 'otw-all', files: 880, diagnostics: 2704, warmMs: 1326, coldMs: 10364 },
      recommended: { config: 'otw-recommended', files: 880, diagnostics: 352, warmMs: 1250 },
    },
    shadcn: { all: { config: 'shadcn-all', files: 880, diagnostics: 2578, warmMs: 968 } },
    'better-tailwindcss': {
      all: { config: 'btw-all', files: 880, diagnostics: 6284, warmMs: 34878 },
    },
  },
  oracles: {
    tailwindcss: {
      unknown: { reports: 77, compiles: [], inProjectCss: [{}, {}] },
      conflicts: { reports: 20, unfounded: [] },
      fixes: {
        autofix: fix(670),
        suggestions: fix(866, [change('after:hover:h-10', 'hover:after:h-10')]),
      },
    },
    shadcn: {
      unknown: { reports: 34, compiles: [], inProjectCss: [] },
      conflicts: { reports: 0, unfounded: [] },
      fixes: { autofix: fix(0), suggestions: fix(249) },
    },
    'better-tailwindcss': {
      unknown: { reports: 97, compiles: [{}], inProjectCss: [] },
      conflicts: { reports: 0, unfounded: [] },
      fixes: {
        autofix: fix(2865, [change('h-5 w-5', 'block-5')]),
        suggestions: fix(2865, [
          change('h-5 w-5', 'block-5'),
          change('p-{{x}}', 'p-2', 'a {{ b }} | c'),
        ]),
      },
    },
  },
}

describe('bench blocks', () => {
  it('setup: the corpus at its commit, every version, the machine', () => {
    const md = benchSetup(R, 'en')
    expect(md).toContain('(https://github.com/shadcn-ui/ui/tree/98a1fe67b439324d/apps/v4)')
    expect(md).toContain(
      'oxlint-tailwindcss 1.14.0, @shadcn/lint 0.2.0, eslint-plugin-better-tailwindcss 4.7.0',
    )
    expect(md).toContain('median of 5 runs')
    expect(benchSetup(R, 'es')).toContain('mediana de 5 corridas')
  })

  it('speed: seconds per locale, a cold run only where there is a cache', () => {
    const en = benchSpeed(R, 'en').split('\n')
    expect(en).toHaveLength(2 + 4)
    expect(en[2]).toBe('| oxlint-tailwindcss | all | 1.3 s | 10.4 s | 2,704 |')
    expect(en[4]).toBe('| @shadcn/lint | all | 1.0 s | — | 2,578 |')
    expect(benchSpeed(R, 'es')).toContain('| oxlint-tailwindcss | todas | 1,3 s | 10,4 s | 2704 |')
  })

  it('seeded: caught per concern, the total, the false alarms', () => {
    const md = benchSeeded(R, 'en')
    expect(md).toContain('| Unknown class | 1/1 | 1/1 | 0/1 |')
    expect(md).toContain('| **All mistakes** | **2/2** | **1/2** | **1/2** |')
    expect(md).toContain('| False alarms on the clean lines | 0/1 | 1/1 | 0/1 |')
    expect(benchSeeded(R, 'es')).toContain('| Clase desconocida |')
  })

  it('seeded lines: the code, what it is, and a false alarm named', () => {
    const md = benchSeededLines(R, 'en')
    expect(md).toContain('| `<div className="p-4 p-6" />` | Conflict | ✓ | ✗ | ✓ |')
    expect(md).toContain('| `<div className="bg-surface" />` | clean | ✓ | ✗ `no-raw-colors` | ✓ |')
  })

  it('oracles: a dash for conflicts a tool has no rule for', () => {
    const md = benchOracles(R, 'en')
    expect(md).toContain('| oxlint-tailwindcss | 77 | 0 | 2 | 20 | 0 |')
    expect(md).toContain('| @shadcn/lint | 34 | 0 | 0 | — | — |')
  })

  it('fixes: each run, "no autofix" when a tool has none, a changed style in bold', () => {
    const md = benchFixes(R, 'en')
    expect(md).toContain('| @shadcn/lint | `--fix` | no autofix | — | — | — |')
    expect(md).toContain(
      '| eslint-plugin-better-tailwindcss | `--fix` | 2,865 | 2,864 | 0 | **1** |',
    )
  })

  it('fix changes: in a details container, suggestions only once, {{ kept from Vue', () => {
    const md = benchFixChanges(R, 'en')
    expect(md).toContain(
      '::: details eslint-plugin-better-tailwindcss: 1 string whose style `--fix` changed\n\n',
    )
    // The suggestion run repeats the autofix; only what it adds is listed under it.
    expect(md).toContain(
      'eslint-plugin-better-tailwindcss: 1 string whose style `--fix --fix-suggestions` changed',
    )
    expect(md.match(/block-5/g)).toHaveLength(1)
    expect(md).toContain('  ```diff\n  - h-5 w-5\n  + block-5\n  ```')
    expect(md).toContain('<span v-pre>`a {{ b }} | c`</span>')
    for (const opener of md.split('\n').filter((l) => l.startsWith(':::')))
      expect(opener).toMatch(/^:::( details .+)?$/)
  })

  it('comparison: coverage with style policy last, and the headline numbers', () => {
    const coverage = comparisonCoverage(R, 'en').split('\n')
    expect(coverage.at(-1)).toBe('| Order | ✓ | — | ✓ |')
    const summary = comparisonSummary(R, 'en')
    expect(summary).toContain('| Unknown-class reports Tailwind compiles | 0/77 | 0/34 | 1/97 |')
    expect(summary).toContain(
      '| `--fix`: strings whose style changed | 0/670 | no autofix | 1/2,865 |',
    )
  })
})

describe('the committed pages hold the current results', () => {
  const REPO = resolve(__dirname, '../../..')
  const RESULTS = resolve(REPO, 'bench/results/latest.json')
  // oxfmt re-pads tables and re-wraps nothing else here: compare what a reader gets.
  const normalize = (md: string) =>
    md
      .replace(/-{3,}/g, '---')
      .replace(/ *\| */g, '|')
      .replace(/\s+/g, ' ')
      .trim()
  const between = (path: string, id: string) => {
    const text = readFileSync(resolve(REPO, path), 'utf8')
    const open = `<!-- generated:${id} -->`
    return text.slice(text.indexOf(open) + open.length, text.indexOf(`<!-- /generated:${id} -->`))
  }
  const results = existsSync(RESULTS)
    ? (JSON.parse(readFileSync(RESULTS, 'utf8')) as BenchResults)
    : null

  it.each(
    (['en', 'es'] as const).flatMap((locale) => {
      const dir = locale === 'en' ? 'packages/docs' : 'packages/docs/es'
      return [
        [`${dir}/benchmark.md`, 'bench-setup', locale, benchSetup],
        [`${dir}/benchmark.md`, 'bench-speed', locale, benchSpeed],
        [`${dir}/benchmark.md`, 'bench-seeded', locale, benchSeeded],
        [`${dir}/benchmark.md`, 'bench-seeded-lines', locale, benchSeededLines],
        [`${dir}/benchmark.md`, 'bench-oracles', locale, benchOracles],
        [`${dir}/benchmark.md`, 'bench-fixes', locale, benchFixes],
        [`${dir}/benchmark.md`, 'bench-fix-changes', locale, benchFixChanges],
        [`${dir}/comparison.md`, 'comparison-summary', locale, comparisonSummary],
        [`${dir}/comparison.md`, 'comparison-coverage', locale, comparisonCoverage],
      ] as const
    }),
  )('%s: %s (%s)', (path, id, locale, render) => {
    expect(
      results,
      'bench/results/latest.json is missing: run node score.mjs in bench/',
    ).not.toBeNull()
    expect(normalize(between(path, id))).toBe(normalize(render(results!, locale)))
  })
})
