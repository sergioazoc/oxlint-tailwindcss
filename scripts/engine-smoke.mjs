// Smoke test: run the BUILT plugin against a real, older Tailwind v4 engine than
// the one the plugin is pinned to (4.3.3). The unit/integration suites simulate
// versions via injection + fake trees; this exercises an actual install to catch
// engine-API drift within the supported range that only a real load would hit.
//
// Usage: node scripts/engine-smoke.mjs <tailwind-version> [--expect-fatal]
//        (e.g. 4.1.15, 4.2, latest, insiders)
//
// Default mode passes when: every rule of the plugin runs against that engine
// without a fatal diagnostic (the version guard, a failed precompute, a worker
// service error), the obviously-bogus class is flagged, and the stable valid
// class (`flex`) is left alone. Assertions are coarse on purpose — class lists,
// sort order, and canonical forms shift across versions, so nothing is snapshotted.
//
// --expect-fatal passes when the version guard rejects the engine with its own
// message naming the resolved version — never a raw engine error such as
// `ds.canonicalizeCandidates is not a function` (4.1.0–4.1.14 lack that API).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const expectFatal = args.includes('--expect-fatal')
const version = args.find((a) => !a.startsWith('--'))
if (!version) {
  console.error('usage: node scripts/engine-smoke.mjs <tailwind-version> [--expect-fatal]')
  process.exit(2)
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = join(REPO, 'packages/oxlint-tailwindcss')
const DIST = join(PKG, 'dist/index.cjs')
if (!existsSync(DIST)) {
  console.error(`Built plugin not found at ${DIST} — run \`pnpm build\` first.`)
  process.exit(2)
}
const OXLINT = [join(PKG, 'node_modules/.bin/oxlint'), join(REPO, 'node_modules/.bin/oxlint')].find(
  existsSync,
)
if (!OXLINT) {
  console.error('oxlint binary not found in node_modules/.bin')
  process.exit(2)
}

// Every rule the built plugin registers, so the whole engine surface the rules
// touch (precompute, sort / canonicalize / declaration services) runs on this version.
const plugin = createRequire(import.meta.url)(DIST)
const RULES = Object.keys((plugin.default ?? plugin).rules)

// Diagnostics that mean the engine did not work, as opposed to a rule finding.
const FATAL_MARKERS = [
  'requires Tailwind CSS',
  'Failed to precompute',
  'Failed to load',
  'is not a function',
  'design system',
]

const dir = mkdtempSync(join(tmpdir(), 'oxtw-smoke-'))
let failed = false
try {
  mkdirSync(join(dir, 'styles'), { recursive: true })
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'oxtw-smoke', version: '0.0.0', private: true }, null, 2),
  )
  writeFileSync(
    join(dir, '.oxlintrc.json'),
    JSON.stringify(
      {
        categories: { correctness: 'off' },
        jsPlugins: [DIST.split('\\').join('/')],
        rules: Object.fromEntries(RULES.map((rule) => [`tailwindcss/${rule}`, 'error'])),
        settings: { tailwindcss: { entryPoint: './styles/app.css' } },
      },
      null,
      2,
    ),
  )
  // A color of the project's own, so no-default-palette has a palette to tell apart.
  writeFileSync(
    join(dir, 'styles/app.css'),
    '@import "tailwindcss";\n@theme { --color-brand: #f00; }\n',
  )
  writeFileSync(
    join(dir, 'src/app.tsx'),
    'export const c = <div className="flex bg-notacolor-99999 bg-red-500 text-brand p-4 px-2 hover:underline" />\n',
  )

  const pkgs = ['tailwindcss', '@tailwindcss/node'].map((p) => `${p}@${version}`)
  console.log(`[smoke] installing ${pkgs.join(' + ')} …`)
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', ...pkgs], {
    cwd: dir,
    stdio: 'inherit',
    timeout: 180_000,
    shell: process.platform === 'win32',
  })
  const installed = createRequire(join(dir, 'package.json'))('tailwindcss/package.json').version
  console.log(
    `[smoke] resolved tailwindcss ${installed}; running oxlint with ${RULES.length} rules …`,
  )

  let stdout = ''
  try {
    stdout = execFileSync(OXLINT, ['-f', 'json', 'src/app.tsx'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 120_000,
    })
  } catch (e) {
    stdout = e.stdout ?? ''
    if (!stdout.trim().startsWith('{')) {
      console.error(e.stderr ?? e)
      throw new Error('oxlint produced no JSON report')
    }
  }
  const diagnostics = JSON.parse(stdout).diagnostics ?? []
  for (const d of diagnostics) console.log(`  ${d.code}: ${d.message}`)

  const check = (cond, msg) => {
    if (!cond) {
      console.error(`[smoke] FAIL: ${msg}`)
      failed = true
    } else {
      console.log(`[smoke] ok: ${msg}`)
    }
  }
  const fatal = diagnostics.filter((d) => FATAL_MARKERS.some((m) => d.message.includes(m)))

  if (expectFatal) {
    check(fatal.length > 0, 'the engine was rejected')
    check(
      fatal.every((d) => d.message.includes('requires Tailwind CSS v')),
      'every rejection is the version guard, not a raw engine error',
    )
    check(
      fatal.some((d) => d.message.includes(installed)),
      `the message names the resolved version (${installed})`,
    )
  } else {
    check(fatal.length === 0, 'every rule ran against the engine without a fatal diagnostic')
    const unknown = diagnostics.filter((d) => d.code === 'tailwindcss(no-unknown-classes)')
    check(
      unknown.some((d) => d.message.includes('bg-notacolor-99999')),
      'the bogus class was flagged (engine + rule ran)',
    )
    check(
      !unknown.some((d) => d.message.includes('"flex"')),
      'the valid class flex was not flagged',
    )
    const palette = diagnostics.filter((d) => d.code === 'tailwindcss(no-default-palette)')
    check(
      palette.length === 1 &&
        palette[0].message.includes('"bg-red-500"') &&
        palette[0].message.includes(': brand.'),
      "the palette color was flagged, and the project's own color was not",
    )
  }
} finally {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
}

process.exit(failed ? 1 : 0)
