// Run one oxlint configuration over the pinned corpus and write a snapshot.
//
// Usage:
//   node run.mjs --config otw-all [--plugin published|local] [--cache cold|warm]
//                [--target corpus|synthetic] [--label NAME] [--timings]
//
// --plugin published  the oxlint-tailwindcss version pinned in bench/package.json
// --plugin local      this repo's packages/oxlint-tailwindcss/dist (run `pnpm build` first)
// --cache cold        a fresh OXLINT_TAILWINDCSS_CACHE_DIR (measures the precompute)
// --cache warm        a reused cache dir, primed by an untimed run when empty
// --target synthetic  lint only bench/synthetic (the seeded agent mistakes)
// --timings           after the measured run, a second (warm) run with
//                     `--debug=timings` records per-rule JS plugin time in meta
//
// Writes out/<label>.json (raw oxlint output) and out/<label>.snapshot.json
// (normalized records + metadata), and prints the per-rule counts.

import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { CORPUS_SHA, ensureCorpus } from './corpus.mjs'
import { normalizeReport, serializeSnapshot } from './lib/normalize.mjs'
import {
  BENCH,
  LOCAL_DIST,
  OXLINT,
  benchVersions,
  cacheDirFor,
  lintJson,
  pluginVersion,
  prepareConfig,
  prepareTarget,
  runOxlint,
} from './lib/runner.mjs'
import { parseTimings } from './lib/timings.mjs'

const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    plugin: { type: 'string', default: 'published' },
    cache: { type: 'string', default: 'warm' },
    target: { type: 'string', default: 'corpus' },
    label: { type: 'string' },
    timings: { type: 'boolean', default: false },
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
const { configPath, dropped } = prepareConfig(app, values.config, values.plugin, label)
if (dropped.length > 0) console.log(`not in this plugin version: ${dropped.join(', ')}`)
const paths = prepareTarget(app, values.target)
const cacheDir = cacheDirFor(values.cache, values.plugin)
const run = { cwd: app, configPath, paths, cacheDir }

if (values.cache === 'warm' && readdirSync(cacheDir).length === 0) lintJson(run)
const { report, raw, wallMs } = lintJson(run)
// `-f default` on purpose: oxlint switches to the `agent` formatter by itself
// when it detects an AI agent, and that formatter prints no timing table.
const timings = values.timings
  ? parseTimings(
      runOxlint({ ...run, args: ['-f', 'default', '--quiet', '--debug=timings'] }).stdout,
    )
  : undefined
if (values.cache === 'cold') rmSync(cacheDir, { recursive: true, force: true })

const records = normalizeReport(report)
const snapshot = {
  meta: {
    config: values.config,
    plugin: values.plugin,
    pluginVersion: pluginVersion(values.plugin),
    target: values.target,
    cache: values.cache,
    corpus: CORPUS_SHA,
    versions: benchVersions(),
    files: report.number_of_files,
    threads: report.threads_count,
    wallMs: Math.round(wallMs),
    ...(timings && { timings }),
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
if (timings) {
  console.log(`JS plugin runtime: ${timings.jsRuntime.totalMs ?? '?'} ms (warm, --debug=timings)`)
  for (const t of timings.rules) {
    console.log(`  ${t.ms.toFixed(1).padStart(9)} ms ${String(t.share).padStart(5)}% ${t.rule}`)
  }
}
