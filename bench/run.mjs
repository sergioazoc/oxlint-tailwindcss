// Run one oxlint configuration over the pinned corpus and write a snapshot.
//
// Usage:
//   node run.mjs --config otw-all [--plugin published|local] [--cache cold|warm]
//                [--target corpus|synthetic] [--label NAME]
//
// --plugin published  the oxlint-tailwindcss version pinned in bench/package.json
// --plugin local      this repo's packages/oxlint-tailwindcss/dist (run `pnpm build` first)
// --cache cold        a fresh OXLINT_TAILWINDCSS_CACHE_DIR (measures the precompute)
// --cache warm        a reused cache dir, primed by an untimed run when empty
// --target synthetic  lint only bench/synthetic (the seeded agent mistakes)
//
// Writes out/<label>.json (raw oxlint output) and out/<label>.snapshot.json
// (normalized records + metadata), and prints the per-rule counts.

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { CORPUS_SHA, ensureCorpus } from './corpus.mjs'
import { normalizeReport, serializeSnapshot } from './lib/normalize.mjs'

const BENCH = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(BENCH)
const LOCAL_DIST = join(REPO, 'packages/oxlint-tailwindcss/dist/index.cjs')
const OXLINT = join(
  BENCH,
  'node_modules/.bin',
  process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint',
)
const CORPUS_PATHS = ['app', 'components', 'registry/new-york-v4', 'hooks', 'lib']
const SYNTHETIC_DIR = 'bench-synthetic'
const IGNORES = ['**/__index__.tsx', '**/__components__/**']

const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    plugin: { type: 'string', default: 'published' },
    cache: { type: 'string', default: 'warm' },
    target: { type: 'string', default: 'corpus' },
    label: { type: 'string' },
  },
})

if (!values.config) {
  console.error(
    'usage: node run.mjs --config <name> [--plugin published|local] [--cache cold|warm]',
  )
  process.exit(2)
}
if (!['published', 'local'].includes(values.plugin)) throw new Error('--plugin: published|local')
if (!['cold', 'warm'].includes(values.cache)) throw new Error('--cache: cold|warm')
if (!['corpus', 'synthetic'].includes(values.target)) throw new Error('--target: corpus|synthetic')
if (!existsSync(OXLINT)) throw new Error('bench/node_modules is missing: run `npm ci` in bench/')
if (values.plugin === 'local' && !existsSync(LOCAL_DIST)) {
  throw new Error(`${LOCAL_DIST} is missing: run \`pnpm build\` first`)
}

const label = values.label ?? `${values.config}-${values.plugin}-${values.target}-${values.cache}`
const app = ensureCorpus()

// The config must sit inside the corpus app so `overrides` globs resolve
// against it, the same way a real project's .oxlintrc.json would.
const pluginRef =
  values.plugin === 'local' ? LOCAL_DIST.replaceAll('\\', '/') : 'oxlint-tailwindcss'
const template = readFileSync(join(BENCH, 'configs', `${values.config}.json`), 'utf8')
const configPath = join(app, `.bench-${label}.oxlintrc.json`)
writeFileSync(
  configPath,
  template
    .replaceAll('{{ENTRY_POINT}}', join(app, 'app/globals.css').replaceAll('\\', '/'))
    .replaceAll('{{OXLINT_TAILWINDCSS}}', pluginRef),
)

let paths = CORPUS_PATHS
if (values.target === 'synthetic') {
  const dest = join(app, SYNTHETIC_DIR)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest)
  for (const file of readdirSync(join(BENCH, 'synthetic'))) {
    copyFileSync(join(BENCH, 'synthetic', file), join(dest, file))
  }
  paths = [SYNTHETIC_DIR]
}

mkdirSync(join(BENCH, 'out'), { recursive: true })
const cacheDir =
  values.cache === 'cold'
    ? mkdtempSync(join(BENCH, 'out', 'cache-cold-'))
    : join(BENCH, 'out', `cache-warm-${values.plugin}`)
mkdirSync(cacheDir, { recursive: true })

function lint() {
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
    // oxlint exits 1 when it reports errors; the JSON is still on stdout.
    if (typeof error.stdout !== 'string' || !error.stdout.trim().startsWith('{')) throw error
    stdout = error.stdout
  }
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6
  return { report: JSON.parse(stdout), raw: stdout, wallMs }
}

if (values.cache === 'warm' && readdirSync(cacheDir).length === 0) lint()
const { report, raw, wallMs } = lint()
if (values.cache === 'cold') rmSync(cacheDir, { recursive: true, force: true })

const versions = JSON.parse(readFileSync(join(BENCH, 'package.json'), 'utf8')).devDependencies
const records = normalizeReport(report)
const snapshot = {
  meta: {
    config: values.config,
    plugin: values.plugin,
    pluginVersion:
      values.plugin === 'local'
        ? JSON.parse(readFileSync(join(REPO, 'packages/oxlint-tailwindcss/package.json'), 'utf8'))
            .version
        : versions['oxlint-tailwindcss'],
    target: values.target,
    cache: values.cache,
    corpus: CORPUS_SHA,
    versions,
    files: report.number_of_files,
    threads: report.threads_count,
    wallMs: Math.round(wallMs),
  },
  records,
}
writeFileSync(join(BENCH, 'out', `${label}.json`), raw)
writeFileSync(join(BENCH, 'out', `${label}.snapshot.json`), serializeSnapshot(snapshot))

const counts = new Map()
for (const record of records) {
  const id = `${record.tool}(${record.rule})`
  counts.set(id, (counts.get(id) ?? 0) + 1)
}
console.log(
  `${label}: files=${report.number_of_files} diagnostics=${records.length} wall=${(wallMs / 1000).toFixed(2)}s`,
)
for (const [id, count] of [...counts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(6)} ${id}`)
}
