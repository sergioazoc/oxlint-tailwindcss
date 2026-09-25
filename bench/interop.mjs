// Check the pages that name other plugins against those plugins:
//
// - /shadcn: every example of packages/docs/data/shadcn-lint.json, in a minimal
//   shadcn/ui project (interop/project: components.json, a Button), first with
//   @shadcn/lint alone — its column — then with the combined config read from
//   packages/docs/shadcn.md. This plugin's column is checked in the main test
//   suite (tests/docs/shadcn-interop.test.ts).
// - /migration/from-better-tailwindcss: every row of
//   packages/docs/data/better-tailwindcss.json — its example must be reported
//   by their rule and by ours, each with the row's options — and every rule of
//   eslint-plugin-better-tailwindcss must have a row.
//
// Exits 1 on any disagreement.
//
// Usage: node interop.mjs [--plugin local|published]
// Weekly with the latest @shadcn/lint: .github/workflows/interop.yml.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  mappingGaps,
  columnMismatches,
  combinedGaps,
  exampleFiles,
  exampleModule,
  firedRules,
  generatedFence,
} from './lib/interop.mjs'

const BENCH = dirname(fileURLToPath(import.meta.url))
const REPO = join(BENCH, '..')
const OXLINT = join(
  BENCH,
  'node_modules/.bin',
  process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint',
)
const LOCAL_DIST = join(REPO, 'packages/oxlint-tailwindcss/dist/index.cjs')

const { values } = parseArgs({ options: { plugin: { type: 'string', default: 'local' } } })
if (!['local', 'published'].includes(values.plugin)) throw new Error('--plugin: local|published')
if (!existsSync(OXLINT)) throw new Error('bench/node_modules is missing: run `npm ci` in bench/')
if (values.plugin === 'local' && !existsSync(LOCAL_DIST)) {
  throw new Error(`${LOCAL_DIST} is missing: run \`pnpm build\` first`)
}

const data = JSON.parse(readFileSync(join(REPO, 'packages/docs/data/shadcn-lint.json'), 'utf8'))
const btw = JSON.parse(
  readFileSync(join(REPO, 'packages/docs/data/better-tailwindcss.json'), 'utf8'),
)
const page = readFileSync(join(REPO, 'packages/docs/shadcn.md'), 'utf8')
const version = (pkg) =>
  JSON.parse(readFileSync(join(BENCH, 'node_modules', pkg, 'package.json'), 'utf8')).version

// The project: the minimal shadcn/ui app, its theme, and one file per example.
const project = join(BENCH, 'out/interop')
rmSync(project, { recursive: true, force: true })
cpSync(join(BENCH, 'interop/project'), project, { recursive: true })
mkdirSync(join(project, 'app'))
cpSync(
  join(REPO, 'packages/oxlint-tailwindcss/tests/fixtures/shadcn.css'),
  join(project, 'app/globals.css'),
)
mkdirSync(join(project, 'src'))
// A repository of its own, like the corpus: bench/out/ is gitignored, and
// oxlint skips gitignored files.
execFileSync('git', ['init', '-q'], { cwd: project })
for (const { file, example } of exampleFiles(data.concerns)) {
  writeFileSync(join(project, 'src', file), exampleModule(example))
}
btw.rules.forEach((row, i) =>
  writeFileSync(join(project, 'src', `btw-${i}.tsx`), exampleModule(row.example)),
)

function lint(config) {
  writeFileSync(join(project, '.oxlintrc.json'), JSON.stringify(config))
  let stdout
  try {
    stdout = execFileSync(OXLINT, ['-f', 'json', 'src'], {
      cwd: project,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    if (typeof error.stdout !== 'string' || error.status !== 1) throw error
    stdout = error.stdout
  }
  return firedRules(JSON.parse(stdout))
}

// 1. @shadcn/lint alone, every rule the table names, with the combined config's options.
const shadcnRules = [...new Set(data.concerns.flatMap((c) => c.shadcn))]
const alone = lint({
  categories: { correctness: 'off' },
  jsPlugins: ['@shadcn/lint'],
  rules: Object.fromEntries(
    shadcnRules.map((r) => [`shadcn/${r}`, data.combined.shadcn[r] ?? 'error']),
  ),
})
const column = columnMismatches(data.concerns, alone, 'shadcn', 'shadcn')

// 2. The combined config, exactly as /shadcn prints it.
const combined = generatedFence(page, 'shadcn-config')
if (values.plugin === 'local') {
  combined.jsPlugins = combined.jsPlugins.map((p) =>
    p === 'oxlint-tailwindcss' ? LOCAL_DIST.replaceAll('\\', '/') : p,
  )
}
delete combined.$schema
const gaps = combinedGaps(data.concerns, lint({ categories: { correctness: 'off' }, ...combined }))

// 3. better-tailwindcss: each row's two rules, with the row's options.
const ruleWith = (options) => (options === undefined ? 'warn' : ['warn', options])
const theirs = lint({
  categories: { correctness: 'off' },
  jsPlugins: ['eslint-plugin-better-tailwindcss'],
  settings: { 'better-tailwindcss': { entryPoint: 'app/globals.css' } },
  rules: Object.fromEntries(
    btw.rules.map((r) => [`better-tailwindcss/${r.theirs}`, ruleWith(r.options?.theirs)]),
  ),
})
const ours = lint({
  categories: { correctness: 'off' },
  jsPlugins: [values.plugin === 'local' ? LOCAL_DIST.replaceAll('\\', '/') : 'oxlint-tailwindcss'],
  settings: { tailwindcss: { entryPoint: 'app/globals.css' } },
  rules: Object.fromEntries(
    btw.rules.map((r) => [`tailwindcss/${r.ours}`, ruleWith(r.options?.ours)]),
  ),
})
const btwPlugin = await import('eslint-plugin-better-tailwindcss')
const mapping = mappingGaps(
  btw.rules,
  Object.keys((btwPlugin.default ?? btwPlugin).rules),
  theirs,
  ours,
)

console.log(
  `@shadcn/lint ${version('@shadcn/lint')} (the page says ${data.shadcnLint}), ` +
    `eslint-plugin-better-tailwindcss ${version('eslint-plugin-better-tailwindcss')} ` +
    `(the page says ${btw.betterTailwindcss}), oxlint ${version('oxlint')}, ` +
    `oxlint-tailwindcss ${values.plugin}`,
)
const problems = [...column, ...gaps, ...mapping]
for (const line of problems) console.log(`  ✗ ${line}`)
if (problems.length > 0) process.exit(1)
console.log(`  ✓ /shadcn: ${data.concerns.length} concerns, the table and the combined config hold`)
console.log(`  ✓ /migration/from-better-tailwindcss: ${btw.rules.length} rules map`)
