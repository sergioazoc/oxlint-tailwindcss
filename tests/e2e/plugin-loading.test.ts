import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'

const ROOT = resolve(__dirname, '../..')
const DIST_CJS = resolve(ROOT, 'dist/index.cjs')
const OXLINT = resolve(ROOT, 'node_modules/.bin/oxlint')
const E2E_DIR = resolve(__dirname, 'tmp')

function runOxlint(configFile: string, targetFile: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync(OXLINT, ['-c', configFile, targetFile], {
      encoding: 'utf-8',
      cwd: E2E_DIR,
      timeout: 30_000,
    })
    return { stdout, exitCode: 0 }
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; status?: number }
    return { stdout: (err.stdout ?? '') + (err.stderr ?? ''), exitCode: err.status ?? 1 }
  }
}

describe('E2E: oxlint plugin loading', () => {
  const configPath = resolve(E2E_DIR, '.oxlintrc.json')
  const validFile = resolve(E2E_DIR, 'valid.tsx')
  const invalidFile = resolve(E2E_DIR, 'invalid.tsx')

  beforeAll(() => {
    if (!existsSync(DIST_CJS)) {
      throw new Error('dist/index.cjs not found. Run `pnpm build` first.')
    }

    mkdirSync(E2E_DIR, { recursive: true })

    // Config file pointing to our built plugin
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          jsPlugins: [DIST_CJS],
          rules: {
            'tailwindcss/no-duplicate-classes': 'error',
            'tailwindcss/no-unnecessary-whitespace': 'error',
            'tailwindcss/no-deprecated-classes': 'error',
          },
        },
        null,
        2,
      ),
    )

    // Valid TSX file — no errors expected
    writeFileSync(validFile, 'const x = <div className="flex items-center p-4" />;\n')

    // Invalid TSX file — errors expected
    writeFileSync(
      invalidFile,
      [
        'const a = <div className="flex flex items-center" />;',
        'const b = <div className="flex  items-center" />;',
        'const c = <div className="flex-grow" />;',
        '',
      ].join('\n'),
    )
  })

  afterAll(() => {
    for (const f of [configPath, validFile, invalidFile]) {
      try {
        unlinkSync(f)
      } catch {}
    }
    try {
      const { rmdirSync } = require('node:fs')
      rmdirSync(E2E_DIR)
    } catch {}
  })

  it('loads the plugin and detects errors', () => {
    const { stdout, exitCode } = runOxlint(configPath, invalidFile)
    expect(exitCode).not.toBe(0)
    expect(stdout).toContain('tailwindcss(no-duplicate-classes)')
    expect(stdout).toContain('tailwindcss(no-unnecessary-whitespace)')
    expect(stdout).toContain('tailwindcss(no-deprecated-classes)')
  })

  it('reports no errors on valid code', () => {
    const { stdout } = runOxlint(configPath, validFile)
    expect(stdout).not.toContain('tailwindcss(')
  })
})
