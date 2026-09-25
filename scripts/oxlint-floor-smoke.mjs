// Smoke test: run the BUILT plugin under a specific oxlint release, to verify the
// minimum oxlint version the docs promise. The main suite and the engine smoke
// both run the repo's own (latest) oxlint, so nothing else exercises the floor.
//
// Usage: node scripts/oxlint-floor-smoke.mjs <oxlint-version>   (e.g. 1.43.0)
//
// Passes when: the plugin loads, every rule runs without a crash or a fatal
// diagnostic, the seeded violations are reported by the expected rules, and
// `--fix` produces the expected, byte-exact output.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/oxlint-floor-smoke.mjs <oxlint-version>')
  process.exit(2)
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(REPO, 'packages/oxlint-tailwindcss/dist/index.cjs')
if (!existsSync(DIST)) {
  console.error(`Built plugin not found at ${DIST} — run \`pnpm build\` first.`)
  process.exit(2)
}
const plugin = createRequire(import.meta.url)(DIST)
const RULES = Object.keys((plugin.default ?? plugin).rules)
const TAILWIND = '4.3.3'

// Each line seeds one violation; `fixed` is the exact expected `--fix` result.
const SOURCE = [
  'export const a = <div className="flex flex p-4" />',
  'export const b = <div className="itms-center flex" />',
  'export const c = <div className="p-4 flex" />',
  '',
].join('\n')
const EXPECTED_RULES = ['no-duplicate-classes', 'no-unknown-classes', 'enforce-sort-order']
const FIXED = [
  'export const a = <div className="flex p-4" />',
  'export const b = <div className="itms-center flex" />',
  'export const c = <div className="flex p-4" />',
  '',
].join('\n')

const FATAL_MARKERS = ['Failed to', 'is not a function', 'requires Tailwind CSS', 'design system']

const dir = mkdtempSync(join(tmpdir(), 'oxtw-oxlint-floor-'))
let failed = false
const check = (cond, msg) => {
  console[cond ? 'log' : 'error'](`[oxlint-floor] ${cond ? 'ok' : 'FAIL'}: ${msg}`)
  if (!cond) failed = true
}
try {
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'floor', private: true }))
  writeFileSync(join(dir, 'app.css'), '@import "tailwindcss";\n')
  writeFileSync(
    join(dir, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST.split('\\').join('/')],
      rules: Object.fromEntries(RULES.map((rule) => [`tailwindcss/${rule}`, 'error'])),
      settings: { tailwindcss: { entryPoint: './app.css' } },
    }),
  )
  writeFileSync(join(dir, 'src/app.tsx'), SOURCE)

  const pkgs = [`oxlint@${version}`, `tailwindcss@${TAILWIND}`, `@tailwindcss/node@${TAILWIND}`]
  console.log(`[oxlint-floor] installing ${pkgs.join(' ')} …`)
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', ...pkgs], {
    cwd: dir,
    stdio: 'inherit',
    timeout: 180_000,
    shell: process.platform === 'win32',
  })
  const bin = join(dir, 'node_modules/.bin', process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint')
  const run = (args) => {
    try {
      return execFileSync(bin, args, { cwd: dir, encoding: 'utf8', timeout: 120_000 })
    } catch (e) {
      if (e.status === 1 && typeof e.stdout === 'string') return e.stdout
      throw new Error(`oxlint exited ${e.status}: ${e.stderr || e.message}`)
    }
  }

  const report = JSON.parse(run(['-f', 'json', 'src/app.tsx']))
  const diagnostics = report.diagnostics ?? []
  for (const d of diagnostics) console.log(`  ${d.code}: ${d.message}`)
  check(
    !diagnostics.some((d) => FATAL_MARKERS.some((m) => d.message.includes(m))),
    `all ${RULES.length} rules ran without a fatal diagnostic`,
  )
  for (const rule of EXPECTED_RULES) {
    check(
      diagnostics.some((d) => d.code === `tailwindcss(${rule})`),
      `${rule} reported its seeded violation`,
    )
  }

  run(['--fix', 'src/app.tsx'])
  check(readFileSync(join(dir, 'src/app.tsx'), 'utf8') === FIXED, '--fix output is byte-exact')
} catch (error) {
  console.error(`[oxlint-floor] FAIL: ${error.message}`)
  failed = true
} finally {
  rmSync(dir, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
