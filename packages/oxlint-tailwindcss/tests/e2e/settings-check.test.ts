import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { assertFreshDist, DIST_CJS } from './helpers/dist'

// A misspelt setting, with the real oxlint: every rule builds on the extractor
// visitors, so every rule could report it — the first to see a file does, once.

const ROOT = resolve(__dirname, '../..')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')

let dir: string

beforeAll(() => {
  assertFreshDist()
  dir = mkdtempSync(resolve(tmpdir(), 'oxtw-settings-check-'))
  mkdirSync(resolve(dir, 'src'))
  for (const name of ['a', 'b']) {
    writeFileSync(
      resolve(dir, `src/${name}.tsx`),
      'export const A = () => <div className="flex" />\n',
    )
  }
  writeFileSync(
    resolve(dir, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST_CJS.split('\\').join('/')],
      settings: { tailwindcss: { rootfontsize: 16 } },
      rules: {
        'tailwindcss/no-duplicate-classes': 'error',
        'tailwindcss/no-unnecessary-whitespace': 'error',
      },
    }),
  )
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('E2E: settings.tailwindcss is checked', () => {
  it('reports a misspelt setting once per file, on its first line', () => {
    let stdout: string
    try {
      stdout = execFileSync(OXLINT, ['-f', 'json', 'src'], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 60_000,
        shell: IS_WINDOWS,
      })
    } catch (error: unknown) {
      stdout = (error as { stdout?: string }).stdout ?? ''
    }
    const { diagnostics } = JSON.parse(stdout) as {
      diagnostics: {
        filename: string
        message: string
        labels: { span: { line: number; column: number } }[]
      }[]
    }
    expect(
      diagnostics
        .map(
          (d) =>
            `${d.filename.split(/[\\/]/).pop()} ${d.labels[0].span.line}:${d.labels[0].span.column} ${d.message}`,
        )
        .sort(),
    ).toEqual([
      'a.tsx 1:1 Check settings.tailwindcss: "rootfontsize" is not a setting (did you mean "rootFontSize"?)',
      'b.tsx 1:1 Check settings.tailwindcss: "rootfontsize" is not a setting (did you mean "rootFontSize"?)',
    ])
  })
})
