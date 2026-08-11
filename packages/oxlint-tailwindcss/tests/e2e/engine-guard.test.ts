import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

// End-to-end for the version guard + consumer-engine resolution (issue #114).
//
// Drives the real oxlint binary loading the BUILT plugin. `buildVersion` (B) is
// read from a plantable `node_modules/tailwindcss/package.json`, so we can force
// a build/engine major drift without a second Tailwind install: the plugin's
// bundled engine (v4) vs a consumer build pinned at a fake `tailwindcss@5.0.0`
// must fail loud as `designSystemUnavailable`, and `allowUntestedEngine` must
// downgrade it to a warn+run.

const ROOT = resolve(__dirname, '../..')
const DIST_CJS = resolve(ROOT, 'dist/index.cjs')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')

function runOxlint(cwd: string, targetFile: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync(OXLINT, [targetFile], {
      encoding: 'utf-8',
      cwd,
      timeout: 60_000,
      shell: IS_WINDOWS,
    })
    return { stdout, exitCode: 0 }
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; status?: number }
    return { stdout: (err.stdout ?? '') + (err.stderr ?? ''), exitCode: err.status ?? 1 }
  }
}

function fakePkg(dir: string, name: string, version: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }))
  writeFileSync(join(dir, 'index.js'), '')
}

function scaffold(allowUntested: boolean): string {
  const root = mkdtempSync(resolve(tmpdir(), 'oxtw-e2e-engine-'))
  mkdirSync(resolve(root, 'styles'), { recursive: true })
  mkdirSync(resolve(root, 'src'), { recursive: true })
  // A consumer build pinned at a (fake) future major.
  fakePkg(resolve(root, 'node_modules/tailwindcss'), 'tailwindcss', '5.0.0')

  const settings: Record<string, unknown> = { entryPoint: './styles/app.css' }
  if (allowUntested) settings.allowUntestedEngine = true

  writeFileSync(
    resolve(root, '.oxlintrc.json'),
    JSON.stringify(
      {
        jsPlugins: [DIST_CJS.split('\\').join('/')],
        rules: { 'tailwindcss/no-unknown-classes': 'error' },
        settings: { tailwindcss: settings },
      },
      null,
      2,
    ),
  )
  writeFileSync(resolve(root, 'styles/app.css'), '@import "tailwindcss";\n')
  // `flex` is a valid class — so a normal run reports nothing; only the version
  // guard can turn this into a diagnostic.
  writeFileSync(resolve(root, 'src/app.tsx'), 'const c = <div className="flex" />;\n')
  return root
}

describe('E2E #114: build/engine major drift fails loud', () => {
  let ROOT_FATAL: string
  let ROOT_ALLOW: string

  beforeAll(() => {
    if (!existsSync(DIST_CJS)) throw new Error('dist/index.cjs not found. Run `pnpm build` first.')
    ROOT_FATAL = scaffold(false)
    ROOT_ALLOW = scaffold(true)
  })

  afterAll(() => {
    for (const dir of [ROOT_FATAL, ROOT_ALLOW]) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('surfaces designSystemUnavailable naming the build version', () => {
    const { stdout } = runOxlint(ROOT_FATAL, 'src/app.tsx')
    expect(stdout).toContain('no-unknown-classes')
    expect(stdout).toContain('5.0.0')
  })

  it('allowUntestedEngine downgrades the drift and lints normally (flex is valid)', () => {
    const { stdout, exitCode } = runOxlint(ROOT_ALLOW, 'src/app.tsx')
    // With the drift downgraded to a warn, the real bundled engine loads and
    // `flex` lints clean — no fatal diagnostic on stdout.
    expect(stdout).not.toContain('designSystemUnavailable')
    expect(exitCode).toBe(0)
  })
})
