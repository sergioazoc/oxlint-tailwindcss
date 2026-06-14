import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

// End-to-end regression for issue #39.
//
// Pattern-B monorepo: one `.oxlintrc.json` per package, with a RELATIVE
// `entryPoint`. oxlint discovers the nested config by walking up from the
// linted file, so the same config applies whether oxlint is launched from the
// package (CLI: `cd packages/ui && oxlint`) or from the workspace root (what
// editor extensions like the VS Code oxlint plugin do).
//
// The bug: the relative `entryPoint` was resolved against the process CWD, so
// the editor run looked for `<workspace>/styles.css` instead of
// `<workspace>/packages/ui/styles.css` and failed with
// `Could not stat CSS entry point`. The fix anchors a relative entryPoint to
// the nearest enclosing `.oxlintrc.json` directory, so every CWD agrees.
//
// This is the highest-fidelity guard: it drives the real oxlint binary loading
// the built plugin, exactly as a user would hit it.

const ROOT = resolve(__dirname, '../..')
const DIST_CJS = resolve(ROOT, 'dist/index.cjs')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')

function runOxlint(
  cwd: string,
  targetFile: string,
  extraArgs: string[] = [],
): { stdout: string; exitCode: number } {
  try {
    // With no `extraArgs` we rely on oxlint's nested-config discovery, which is
    // the whole point of Pattern B (and the scenario the editor triggers).
    // `extraArgs` lets a test pass `-c <config>` to exercise explicit-config runs.
    const stdout = execFileSync(OXLINT, [...extraArgs, targetFile], {
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

describe('E2E #39: relative entryPoint resolves per-package regardless of CWD', () => {
  let MONO: string
  let packageDir: string

  beforeAll(() => {
    if (!existsSync(DIST_CJS)) {
      throw new Error('dist/index.cjs not found. Run `pnpm build` first.')
    }

    MONO = mkdtempSync(resolve(tmpdir(), 'oxtw-e2e39-'))
    packageDir = resolve(MONO, 'packages/ui')
    mkdirSync(resolve(packageDir, 'src/styles'), { recursive: true })
    mkdirSync(resolve(packageDir, 'src/components'), { recursive: true })

    // Root config declares the plugin + rule. Forward slashes so the absolute
    // plugin path survives JSON + oxlint resolution on Windows.
    writeFileSync(
      resolve(MONO, '.oxlintrc.json'),
      JSON.stringify(
        {
          jsPlugins: [DIST_CJS.split('\\').join('/')],
          rules: { 'tailwindcss/no-deprecated-classes': 'error' },
        },
        null,
        2,
      ),
    )

    // Per-package config (Pattern B): RELATIVE entryPoint, meant to be relative
    // to THIS file's directory — not whatever CWD oxlint runs from.
    writeFileSync(
      resolve(packageDir, '.oxlintrc.json'),
      JSON.stringify(
        {
          extends: ['../../.oxlintrc.json'],
          settings: { tailwindcss: { entryPoint: './src/styles/app.css' } },
        },
        null,
        2,
      ),
    )

    writeFileSync(resolve(packageDir, 'src/styles/app.css'), '@import "tailwindcss";\n')
    // `flex-grow` is deprecated in Tailwind v4 (→ `grow`): triggers a
    // DS-dependent rule, which only fires if the CSS entry point loaded.
    writeFileSync(
      resolve(packageDir, 'src/components/button.tsx'),
      'const c = <div className="flex-grow" />;\n',
    )
  })

  afterAll(() => {
    try {
      rmSync(MONO, { recursive: true, force: true })
    } catch {}
  })

  it('detects the deprecated class when run from the package dir (CLI)', () => {
    const { stdout } = runOxlint(packageDir, 'src/components/button.tsx')
    expect(stdout).toContain('tailwindcss(no-deprecated-classes)')
    expect(stdout).not.toContain('Could not stat CSS entry point')
  })

  it('detects the deprecated class when run from the workspace root (editor) — the bug', () => {
    const { stdout } = runOxlint(MONO, 'packages/ui/src/components/button.tsx')
    expect(stdout).toContain('tailwindcss(no-deprecated-classes)')
    // The pre-fix failure mode: CWD-relative resolution → missing CSS.
    expect(stdout).not.toContain('Could not stat CSS entry point')
  })

  it('detects the deprecated class when run from an intermediate dir', () => {
    const { stdout } = runOxlint(resolve(MONO, 'packages'), 'ui/src/components/button.tsx')
    expect(stdout).toContain('tailwindcss(no-deprecated-classes)')
    expect(stdout).not.toContain('Could not stat CSS entry point')
  })
})

// Explicit-config (`oxlint -c <config>`) edge from the #39 review. Under `-c`
// oxlint uses ONLY that config and does NOT walk for nested ones — but the
// plugin still finds the nearest `.oxlintrc.json` on disk. With the relative
// entryPoint declared in the explicit root config and an UNRELATED rules-only
// nested config below the file, the nearest config dir lacks the CSS, so the
// two-step resolution falls back to the CWD (the workspace root, where the
// explicit config lives) and resolves correctly. This locks down that the
// realistic explicit-config layout keeps working.
describe('E2E #39: explicit `-c` config with an unrelated nested config below', () => {
  let MONO: string

  beforeAll(() => {
    if (!existsSync(DIST_CJS)) throw new Error('dist/index.cjs not found. Run `pnpm build` first.')

    MONO = mkdtempSync(resolve(tmpdir(), 'oxtw-e2e39c-'))
    mkdirSync(resolve(MONO, 'styles'), { recursive: true })
    mkdirSync(resolve(MONO, 'src/components'), { recursive: true })

    // Explicit root config (the `-c` target): plugin + rule + RELATIVE entry.
    writeFileSync(
      resolve(MONO, '.oxlintrc.json'),
      JSON.stringify(
        {
          jsPlugins: [DIST_CJS.split('\\').join('/')],
          rules: { 'tailwindcss/no-deprecated-classes': 'error' },
          settings: { tailwindcss: { entryPoint: './styles/app.css' } },
        },
        null,
        2,
      ),
    )
    // Unrelated nested config (rules only, no tailwindcss settings). It is NOT
    // used by oxlint under `-c`, but it IS the nearest `.oxlintrc.json` the
    // plugin sees for the linted file.
    writeFileSync(
      resolve(MONO, 'src/.oxlintrc.json'),
      JSON.stringify({ rules: { eqeqeq: 'error' } }, null, 2),
    )
    writeFileSync(resolve(MONO, 'styles/app.css'), '@import "tailwindcss";\n')
    writeFileSync(
      resolve(MONO, 'src/components/button.tsx'),
      'const c = <div className="flex-grow" />;\n',
    )
  })

  afterAll(() => {
    try {
      rmSync(MONO, { recursive: true, force: true })
    } catch {}
  })

  it('falls back to CWD and resolves the root-relative CSS', () => {
    const { stdout } = runOxlint(MONO, 'src/components/button.tsx', ['-c', '.oxlintrc.json'])
    expect(stdout).toContain('tailwindcss(no-deprecated-classes)')
    expect(stdout).not.toContain('Could not stat CSS entry point')
  })
})
