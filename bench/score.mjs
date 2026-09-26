// The benchmark behind the /benchmark and /comparison pages: every number on
// them comes from the results file this writes, never from a hand edit.
//
//   node score.mjs [--runs 5] [--out results/latest.json]
//   node score.mjs --check results/latest.json [--runs 1]
//
// --check writes nothing: it exits 1 when a fresh run disagrees with the file
// on anything but wall times and the machine — the committed results must be
// what the code does.
//
// (after `npm ci`, `npm run corpus` and `pnpm -C .. build`). For each tool, with
// its all-rules config:
//   - seeded: which labeled mistakes in bench/synthetic it reports, and its
//     false alarms on the lines labeled ok (lib/concerns.mjs);
//   - corpus: its diagnostics on shadcn/ui apps/v4, and the wall time of a
//     warm run (median of --runs), plus cold runs for oxlint-tailwindcss —
//     the only one with a cache to be cold;
//   - oracles (lib/oracle.mjs), with the corpus's own Tailwind as the judge:
//     its unknown-class reports of classes Tailwind compiles, its conflict
//     reports of classes that share no property, and what `--fix` and
//     `--fix --fix-suggestions` do to each class string's effective style.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { cpus, platform, release } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

import { CORPUS_DIR, CORPUS_REPO, CORPUS_SHA, ensureCorpus } from './corpus.mjs'
import { loadConcerns, parseExpectations, scoreExpectations } from './lib/concerns.mjs'
import {
  applyFixes,
  judgeConflicts,
  judgeFixes,
  judgeUnknown,
  loadEngine,
  projectStylesheets,
} from './lib/oracle.mjs'
import { normalizeReport } from './lib/normalize.mjs'
import {
  BENCH,
  REPO,
  SYNTHETIC_DIR,
  benchVersions,
  cacheDirFor,
  lintJson,
  pluginVersion,
  prepareConfig,
  prepareTarget,
  runOxlint,
} from './lib/runner.mjs'

/** The results without what depends on the machine: wall times, threads, runs, node. */
function stable(results) {
  return JSON.parse(
    JSON.stringify(results, (key, value) =>
      ['warmMs', 'coldMs', 'threads', 'machine', 'runs', 'node'].includes(key) ? undefined : value,
    ),
  )
}

/** Paths where two JSON values differ, `a.b[2].c: x → y`. */
function stableDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return [`${path}: ${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`]
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].flatMap((k) =>
    stableDiff(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`),
  )
}

export const TOOLS = [
  {
    id: 'tailwindcss',
    name: 'oxlint-tailwindcss',
    config: 'otw-all',
    recommended: 'otw-recommended',
    plugin: 'local',
  },
  { id: 'shadcn', name: '@shadcn/lint', config: 'shadcn-all', plugin: 'published' },
  {
    id: 'better-tailwindcss',
    name: 'eslint-plugin-better-tailwindcss',
    config: 'btw-all',
    recommended: 'btw-recommended',
    plugin: 'published',
  },
]

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '5' },
    out: { type: 'string', default: 'results/latest.json' },
    check: { type: 'string' },
  },
})
const RUNS = Number(values.runs)
const app = ensureCorpus()
const concerns = loadConcerns(REPO)
// The fix runs edit the corpus in place and restore it from git, so it must
// start clean: a leftover edit would be counted as a fix.
try {
  execFileSync('git', ['-C', CORPUS_DIR, 'diff', '--quiet', '--', 'apps/v4'])
} catch {
  throw new Error(`${CORPUS_DIR} has local changes: git -C ${CORPUS_DIR} checkout -- apps/v4`)
}

const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return Math.round(sorted[Math.floor(sorted.length / 2)])
}
const byRule = (records) => {
  const counts = {}
  for (const r of records) counts[`${r.tool}/${r.rule}`] = (counts[`${r.tool}/${r.rule}`] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]))
}

// ── Seeded mistakes ────────────────────────────────────────────────────────
const seededFiles = readdirSync(join(BENCH, 'synthetic')).sort()
const lines = seededFiles.flatMap((file) => {
  const source = readFileSync(join(BENCH, 'synthetic', file), 'utf8')
  const text = source.split('\n')
  return parseExpectations(source).map((e) => ({
    file,
    ...e,
    code: text[e.line - 1].trim(),
  }))
})
const seeded = {
  lines: lines.map(({ file, line, concerns: ids, code }) => ({
    file,
    line,
    concerns: ids,
    code,
    tools: {},
  })),
}
for (const tool of TOOLS) {
  const { configPath } = prepareConfig(app, tool.config, tool.plugin, `score-${tool.id}`)
  const paths = prepareTarget(app, 'synthetic')
  const { report } = lintJson({
    cwd: app,
    configPath,
    paths,
    cacheDir: cacheDirFor('warm', tool.plugin),
  })
  const records = normalizeReport(report)
  for (const file of seededFiles) {
    const own = records.filter((r) => r.file === `${SYNTHETIC_DIR}/${file}`)
    const expectations = lines.filter((l) => l.file === file)
    const scores = scoreExpectations(expectations, own, tool.id, concerns)
    for (const score of scores) {
      const row = seeded.lines.find((l) => l.file === file && l.line === score.line)
      row.tools[tool.id] = score.ok
        ? { alarms: score.alarms }
        : { caught: score.caught, by: score.by }
    }
  }
}
rmSync(join(app, SYNTHETIC_DIR), { recursive: true, force: true })
seeded.summary = Object.fromEntries(
  TOOLS.map((tool) => {
    const mistakes = seeded.lines.filter((l) => l.concerns[0] !== 'ok')
    const oks = seeded.lines.filter((l) => l.concerns[0] === 'ok')
    return [
      tool.id,
      {
        caught: mistakes.filter((l) => l.tools[tool.id].caught).length,
        mistakes: mistakes.length,
        falseAlarms: oks.filter((l) => l.tools[tool.id].alarms.length > 0).length,
        ok: oks.length,
      },
    ]
  }),
)

// ── Corpus: diagnostics and wall time ──────────────────────────────────────
const corpus = {}
const corpusRecords = {}
for (const tool of TOOLS) {
  corpus[tool.id] = {}
  for (const [kind, config] of [
    ['all', tool.config],
    ['recommended', tool.recommended],
  ]) {
    if (!config) continue
    const { configPath } = prepareConfig(app, config, tool.plugin, `score-${tool.id}-${kind}`)
    const paths = prepareTarget(app, 'corpus')
    const cacheDir = cacheDirFor('warm', tool.plugin)
    const run = { cwd: app, configPath, paths, cacheDir }
    const first = lintJson(run)
    const warm = []
    for (let i = 0; i < RUNS; i++) warm.push(lintJson(run).wallMs)
    const records = normalizeReport(first.report)
    if (kind === 'all') corpusRecords[tool.id] = records
    const entry = {
      config,
      files: first.report.number_of_files,
      threads: first.report.threads_count,
      diagnostics: records.length,
      byRule: byRule(records),
      warmMs: median(warm),
    }
    if (tool.id === 'tailwindcss') {
      const cold = []
      for (let i = 0; i < RUNS; i++) {
        const dir = cacheDirFor('cold', tool.plugin)
        cold.push(lintJson({ ...run, cacheDir: dir }).wallMs)
        rmSync(dir, { recursive: true, force: true })
      }
      entry.coldMs = median(cold)
    }
    corpus[tool.id][kind] = entry
    rmSync(configPath, { force: true })
  }
}

// ── Oracles ────────────────────────────────────────────────────────────────
const engine = await loadEngine(join(app, 'app/globals.css'))
const stylesheets = projectStylesheets(app)
const oracles = {}
const summarize = (judged) => ({
  files: judged.files,
  strings: judged.strings,
  equivalent: judged.equivalent,
  typos: judged.typos,
  changed: judged.changed,
  unpaired: judged.unpaired,
})
for (const tool of TOOLS) {
  const records = corpusRecords[tool.id]
  const { configPath } = prepareConfig(app, tool.config, tool.plugin, `score-${tool.id}-fix`)
  const paths = prepareTarget(app, 'corpus')
  const cacheDir = cacheDirFor('warm', tool.plugin)
  const fixes = {}
  for (const [mode, args] of [
    ['autofix', ['--fix']],
    ['suggestions', ['--fix', '--fix-suggestions']],
  ]) {
    const files = applyFixes({
      corpusDir: CORPUS_DIR,
      app,
      lint: () => runOxlint({ cwd: app, configPath, paths, cacheDir, args }),
    })
    fixes[mode] = summarize(judgeFixes(files, engine))
  }
  rmSync(configPath, { force: true })
  oracles[tool.id] = {
    unknown: judgeUnknown(records, engine, stylesheets),
    conflicts: judgeConflicts(records, engine),
    fixes,
  }
}

// ── Results ────────────────────────────────────────────────────────────────
const versions = benchVersions()
const results = {
  meta: {
    corpus: { repo: CORPUS_REPO, sha: CORPUS_SHA, app: 'apps/v4' },
    runs: RUNS,
    machine: {
      cpu: cpus()[0]?.model.trim(),
      cores: cpus().length,
      os: `${platform()} ${release()}`,
    },
    node: process.version,
    tools: Object.fromEntries(
      TOOLS.map((t) => [
        t.id,
        {
          name: t.name,
          version: t.id === 'tailwindcss' ? pluginVersion(t.plugin) : versions[t.name],
          config: t.config,
        },
      ]),
    ),
    oxlint: versions.oxlint,
    tailwindcss: versions.tailwindcss,
  },
  // The taxonomy the seeded results are read with, for the pages.
  concerns: [...concerns.values()].map((c) => ({
    id: c.id,
    label: c.label,
    formatting: c.formatting,
    rules: Object.fromEntries(TOOLS.map((t) => [t.id, [...c.rules[t.id]].sort()])),
  })),
  seeded,
  corpus,
  oracles,
}
if (values.check) {
  const committed = JSON.parse(readFileSync(join(BENCH, values.check), 'utf8'))
  const differences = stableDiff(stable(committed), stable(results))
  for (const d of differences.slice(0, 40)) console.log(`  ${d}`)
  console.log(
    differences.length === 0
      ? `${values.check} is current`
      : `${values.check} is stale (${differences.length} differences): run node score.mjs`,
  )
  process.exit(differences.length === 0 ? 0 : 1)
}
const out = join(BENCH, values.out)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`)
// In the repo's own format, so committing it passes `pnpm format:check`.
try {
  const oxfmt = join(
    REPO,
    'node_modules/.bin',
    process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt',
  )
  execFileSync(oxfmt, [out], { cwd: REPO, stdio: 'ignore', shell: process.platform === 'win32' })
} catch {
  // Without the repo's dev dependencies, the file stays as JSON.stringify writes it.
}

for (const tool of TOOLS) {
  const s = seeded.summary[tool.id]
  const c = corpus[tool.id].all
  const o = oracles[tool.id]
  console.log(
    `${tool.name}: seeded ${s.caught}/${s.mistakes} caught, ${s.falseAlarms}/${s.ok} false alarms; ` +
      `corpus ${c.diagnostics} diagnostics, warm ${c.warmMs} ms${c.coldMs ? `, cold ${c.coldMs} ms` : ''}\n` +
      `  unknown: ${o.unknown.reports} reports, ${o.unknown.compiles.length} compile, ${o.unknown.inProjectCss.length} in project CSS; ` +
      `conflicts: ${o.conflicts.reports} reports, ${o.conflicts.unfounded.length} unfounded\n` +
      Object.entries(o.fixes)
        .map(
          ([mode, f]) =>
            `  ${mode}: ${f.strings} strings, ${f.equivalent} same style, ${f.typos.length} typos fixed, ${f.changed.length} changed, ${f.unpaired.length} unpaired files`,
        )
        .join('\n'),
  )
}
console.log(`wrote ${values.out}`)
