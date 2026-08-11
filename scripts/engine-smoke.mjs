// Smoke test: run the BUILT plugin against a real, older Tailwind v4 engine than
// the one the plugin is pinned to (4.3.3). The unit/integration suites simulate
// versions via injection + fake trees; this exercises an actual install to catch
// engine-API drift within the supported range that only a real load would hit.
//
// Usage: node scripts/engine-smoke.mjs <tailwind-version-range>   (e.g. 4.1, 4.0)
//
// Passes when: the plugin loads the older engine WITHOUT a fatal
// `designSystemUnavailable`, flags an obviously-bogus class, and leaves a stable
// valid class (`flex`) alone. Assertions are coarse on purpose — class lists,
// sort order, and canonical forms shift across versions, so we don't snapshot them.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!version) {
  console.error('usage: node scripts/engine-smoke.mjs <tailwind-version>')
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
        jsPlugins: [DIST.split('\\').join('/')],
        rules: { 'tailwindcss/no-unknown-classes': 'error' },
        settings: { tailwindcss: { entryPoint: './styles/app.css' } },
      },
      null,
      2,
    ),
  )
  writeFileSync(join(dir, 'styles/app.css'), '@import "tailwindcss";\n')
  writeFileSync(
    join(dir, 'src/app.tsx'),
    'const c = <div className="flex bg-notacolor-99999" />;\n',
  )

  console.log(`[smoke] installing tailwindcss@${version} + @tailwindcss/node@${version} …`)
  execFileSync(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      `tailwindcss@${version}`,
      `@tailwindcss/node@${version}`,
    ],
    { cwd: dir, stdio: 'inherit', timeout: 180_000 },
  )

  console.log('[smoke] running oxlint with the built plugin …')
  let out = ''
  try {
    out = execFileSync(OXLINT, ['src/app.tsx'], { cwd: dir, encoding: 'utf-8', timeout: 120_000 })
  } catch (e) {
    out = (e.stdout ?? '') + (e.stderr ?? '')
  }
  console.log(out)

  const check = (cond, msg) => {
    if (!cond) {
      console.error(`[smoke] FAIL: ${msg}`)
      failed = true
    } else {
      console.log(`[smoke] ok: ${msg}`)
    }
  }
  check(!out.includes('designSystemUnavailable'), 'engine loaded without a fatal version guard')
  check(out.includes('no-unknown-classes'), 'the bogus class was flagged (engine + rule ran)')
  check(out.includes('bg-notacolor-99999'), 'the flagged class is the bogus one')
  check(!out.includes('`flex`') && !out.includes("'flex'"), 'the valid class flex was not flagged')
} finally {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
}

process.exit(failed ? 1 : 0)
