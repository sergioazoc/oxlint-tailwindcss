#!/usr/bin/env node
// The R8 gate: whether no-borrowed-component-styles ships (as experimental).
//
//   node r8/gate.mjs [--runs 5]      (from bench/, after `pnpm -C .. build`)
//
// With registry/new-york-v4/ui as the design system's components, it needs:
//   - copy-paste: 4/4 elements of r8/fixtures/copy-paste.tsx reported, each
//     naming the component it copies;
//   - paraphrased: >= 3/4 of r8/fixtures/paraphrased.tsx;
//   - 0 false positives in the corpus (app, components, registry/new-york-v4,
//     hooks, lib): every report must be one of TRUE_POSITIVES, each labeled by
//     reading the code;
//   - <= 5% warm overhead on the otw-all config (median wall time of --runs).
//
// Exits 1 when a criterion fails.

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ensureCorpus } from '../corpus.mjs'
import { materializeConfig } from '../lib/config.mjs'

const R8 = dirname(fileURLToPath(import.meta.url))
const BENCH = dirname(R8)
const REPO = dirname(BENCH)
const LOCAL_DIST = join(REPO, 'packages/oxlint-tailwindcss/dist/index.cjs').replaceAll('\\', '/')
const OXLINT = join(
  BENCH,
  'node_modules/.bin',
  process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint',
)
const CORPUS_PATHS = ['app', 'components', 'registry/new-york-v4', 'hooks', 'lib']
const IGNORES = ['**/__index__.tsx', '**/__components__/**']
const FIXTURE_DIR = 'bench-r8'
const RULE = 'tailwindcss/no-borrowed-component-styles'
const RULE_OPTIONS = ['warn', { components: ['registry/new-york-v4/ui'] }]

/** Corpus reports that are right: the element does rebuild the component. */
const TRUE_POSITIVES = [
  {
    file: 'app/(app)/examples/tasks/components/data-table-faceted-filter.tsx',
    line: 108,
    component: 'Checkbox',
    why: "a checkbox drawn with Checkbox's classes inside a CommandItem, on purpose: a real Checkbox (a button) can't sit inside an option",
  },
]

const { values } = parseArgs({ options: { runs: { type: 'string', default: '5' } } })
const runs = Number(values.runs)

const app = ensureCorpus()
const entryPoint = join(app, 'app/globals.css').replaceAll('\\', '/')
const cacheDir = join(BENCH, 'out', 'cache-warm-local')
mkdirSync(cacheDir, { recursive: true })

function writeConfig(name, rules) {
  const path = join(app, `.bench-r8-${name}.oxlintrc.json`)
  const config = {
    plugins: [],
    categories: { correctness: 'off' },
    jsPlugins: [LOCAL_DIST],
    settings: { tailwindcss: { entryPoint } },
    rules,
  }
  writeFileSync(path, JSON.stringify(config, null, 2))
  return path
}

function oxlint(configPath, paths) {
  const args = ['-c', configPath, ...IGNORES.map((p) => `--ignore-pattern=${p}`), '-f', 'json']
  const started = process.hrtime.bigint()
  let stdout
  try {
    stdout = execFileSync(OXLINT, [...args, ...paths], {
      cwd: app,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, OXLINT_TAILWINDCSS_CACHE_DIR: cacheDir },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    if (typeof error.stdout !== 'string' || error.status !== 1) throw error
    stdout = error.stdout
  }
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6
  return { diagnostics: JSON.parse(stdout).diagnostics, wallMs }
}

const reportsOf = (diagnostics) =>
  diagnostics
    .filter((d) => d.code === 'tailwindcss(no-borrowed-component-styles)')
    .map((d) => ({
      file: d.filename,
      line: d.labels[0]?.span.line ?? 0,
      component: /rebuilds (.+?): /.exec(d.message)?.[1] ?? '?',
      message: d.message,
    }))

/** `{/* expect: Button *\/}` → the component expected on the next element. */
function expectations(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((text, i) => {
      const m = /expect: (\S+)/.exec(text)
      return m ? [{ line: i + 2, component: m[1] }] : []
    })
}

function score(name, reports) {
  const expected = expectations(join(R8, 'fixtures', name))
  const file = `${FIXTURE_DIR}/${name}`
  const rows = expected.map((e) => {
    const hit = reports.find((r) => r.file === file && r.line === e.line)
    const ok = hit !== undefined && hit.component.split(' ')[0] === e.component
    return { ...e, got: hit?.component ?? '—', ok }
  })
  console.log(`\n${name}`)
  for (const r of rows) {
    console.log(`  ${r.ok ? '✓' : '✗'} line ${r.line}: expected ${r.component}, got ${r.got}`)
  }
  const extra = reports.filter((r) => r.file === file && !expected.some((e) => e.line === r.line))
  for (const r of extra) console.log(`  ✗ line ${r.line}: unexpected ${r.component}`)
  return rows.filter((r) => r.ok).length - extra.length
}

// Detection: the fixtures, copied into the corpus so they see its components.
const fixtures = join(app, FIXTURE_DIR)
rmSync(fixtures, { recursive: true, force: true })
mkdirSync(fixtures)
for (const name of ['copy-paste.tsx', 'paraphrased.tsx']) {
  copyFileSync(join(R8, 'fixtures', name), join(fixtures, name))
}
const onlyRule = writeConfig('rule', { [RULE]: RULE_OPTIONS })
const detected = reportsOf(oxlint(onlyRule, [FIXTURE_DIR]).diagnostics)
const copyPaste = score('copy-paste.tsx', detected)
const paraphrased = score('paraphrased.tsx', detected)
rmSync(fixtures, { recursive: true, force: true })

// False positives: every report in the corpus.
const corpus = reportsOf(oxlint(onlyRule, CORPUS_PATHS).diagnostics)
const labeled = (r) =>
  TRUE_POSITIVES.find((t) => t.file === r.file && t.line === r.line && t.component === r.component)
const falsePositives = corpus.filter((r) => !labeled(r))
console.log(`\ncorpus: ${corpus.length} reports, ${falsePositives.length} false positives`)
for (const r of corpus) {
  const tp = labeled(r)
  console.log(
    `  ${tp ? 'TP' : 'FP'} ${r.file}:${r.line} ${r.message}${tp ? `\n     (${tp.why})` : ''}`,
  )
}

// Overhead: otw-all with and without the rule, warm, interleaved.
const plugin = createRequire(import.meta.url)(LOCAL_DIST)
const otwAll = materializeConfig(
  JSON.parse(readFileSync(join(BENCH, 'configs/otw-all.json'), 'utf8')),
  plugin.default ?? plugin,
).config.rules
const { [RULE]: _, ...others } = otwAll
const without = writeConfig('without', others)
const withRule = writeConfig('with', { ...others, [RULE]: RULE_OPTIONS })
oxlint(without, CORPUS_PATHS)
oxlint(withRule, CORPUS_PATHS)
const times = { without: [], with: [] }
for (let i = 0; i < runs; i++) {
  times.without.push(oxlint(without, CORPUS_PATHS).wallMs)
  times.with.push(oxlint(withRule, CORPUS_PATHS).wallMs)
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const overhead = median(times.with) / median(times.without) - 1
console.log(
  `\nwarm otw-all: ${median(times.without).toFixed(0)} ms without, ${median(times.with).toFixed(0)} ms with (median of ${runs}): ${(overhead * 100).toFixed(1)}%`,
)

const criteria = [
  ['copy-paste 4/4', copyPaste === 4],
  ['paraphrased >= 3/4', paraphrased >= 3],
  ['0 false positives in the corpus', falsePositives.length === 0],
  ['<= 5% warm overhead', overhead <= 0.05],
]
console.log('\ngate')
for (const [name, ok] of criteria) console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}`)
for (const name of ['rule', 'without', 'with']) {
  rmSync(join(app, `.bench-r8-${name}.oxlintrc.json`), { force: true })
}
process.exit(criteria.every(([, ok]) => ok) ? 0 : 1)
