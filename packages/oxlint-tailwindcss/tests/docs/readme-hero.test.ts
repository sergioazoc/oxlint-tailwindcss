/**
 * The root README's hero example, run through the real oxlint and oxfmt: every
 * diagnostic it says the plugin reports, and the autofix it shows.
 *
 * The first test pins the lines below to the README, so editing the hero fails
 * here until this file (and so the claim) is updated with it. The
 * prettier-plugin-tailwindcss half of "identical output to oxfmt and
 * prettier-plugin-tailwindcss" is not installed here; it was checked by hand
 * (prettier 3.9.9, prettier-plugin-tailwindcss 0.8.1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { assertFreshDist, DIST_CJS } from '../e2e/helpers/dist'

const ROOT = resolve(__dirname, '../..')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const OXFMT = resolve(ROOT, '../../node_modules/.bin', IS_WINDOWS ? 'oxfmt.cmd' : 'oxfmt')
const TAILWIND = resolve(ROOT, 'node_modules/tailwindcss/index.css').split('\\').join('/')

const FLAGGED =
  '<div className="flex itms-center bg-blu-500 text-red-500 text-blue-500 flex-grow" />'
const UNSORTED = '<div className="text-red-500 flex items-center p-4" />'
const SORTED = '<div className="flex items-center p-4 text-red-500" />'

const hero = /```tsx\n([\s\S]*?)```/.exec(
  readFileSync(resolve(ROOT, '../../README.md'), 'utf8'),
)![1]

let dir: string

function run(bin: string, args: string[]): string {
  try {
    return execFileSync(bin, args, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 60_000,
      shell: IS_WINDOWS,
    })
  } catch (error: unknown) {
    return (error as { stdout?: string }).stdout ?? ''
  }
}

beforeAll(() => {
  assertFreshDist()
  dir = mkdtempSync(resolve(tmpdir(), 'oxtw-readme-hero-'))
  mkdirSync(resolve(dir, 'src'))
  writeFileSync(resolve(dir, 'src/app.css'), `@import '${TAILWIND}';\n`)
  writeFileSync(resolve(dir, 'src/flagged.tsx'), `export const A = () => ${FLAGGED};\n`)
  writeFileSync(resolve(dir, 'src/unsorted.tsx'), `export const A = () => ${UNSORTED};\n`)
  writeFileSync(
    resolve(dir, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST_CJS.split('\\').join('/')],
      settings: { tailwindcss: { entryPoint: './src/app.css' } },
      overrides: [
        {
          files: ['src/flagged.tsx'],
          rules: {
            'tailwindcss/no-unknown-classes': 'error',
            'tailwindcss/no-conflicting-classes': 'error',
            'tailwindcss/no-deprecated-classes': 'error',
          },
        },
        { files: ['src/unsorted.tsx'], rules: { 'tailwindcss/enforce-sort-order': 'error' } },
      ],
    }),
  )
  writeFileSync(
    resolve(dir, '.oxfmtrc.json'),
    JSON.stringify({ sortTailwindcss: { stylesheet: './src/app.css' } }),
  )
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('README hero', () => {
  it('shows the example these tests run', () => {
    expect(hero).toContain(FLAGGED)
    expect(hero).toContain('"itms-center" → did you mean "items-center"?  (no-unknown-classes)')
    expect(hero).toContain('"bg-blu-500" → did you mean "bg-blue-500"?')
    expect(hero).toContain(
      'text-red-500 / text-blue-500 both set "color"             (no-conflicting-classes)',
    )
    expect(hero).toContain('"flex-grow" is deprecated in v4 → "grow"  (no-deprecated-classes)')
    expect(hero).toContain(`${UNSORTED}   →   ${SORTED}`)
    expect(hero).toContain(
      '(enforce-sort-order — identical output to oxfmt and prettier-plugin-tailwindcss)',
    )
  })

  it('reports what it says, with the rules it names', () => {
    const { diagnostics } = JSON.parse(run(OXLINT, ['-f', 'json', 'src/flagged.tsx'])) as {
      diagnostics: { code: string; message: string }[]
    }
    const by = (rule: string) =>
      diagnostics.filter((d) => d.code === `tailwindcss(${rule})`).map((d) => d.message)

    expect(by('no-unknown-classes')).toEqual([
      expect.stringMatching(/"itms-center".*"items-center"/),
      expect.stringMatching(/"bg-blu-500".*"bg-blue-500"/),
    ])
    expect(by('no-conflicting-classes')).toEqual([
      expect.stringMatching(/text-red-500.*text-blue-500.*\bcolor\b/s),
    ])
    expect(by('no-deprecated-classes')).toEqual([expect.stringMatching(/"flex-grow".*"grow"/)])
  })

  it('autofixes the order it shows, and oxfmt writes the same', () => {
    run(OXLINT, ['--fix', 'src/unsorted.tsx'])
    expect(readFileSync(resolve(dir, 'src/unsorted.tsx'), 'utf8')).toContain(SORTED)

    writeFileSync(resolve(dir, 'src/unsorted.tsx'), `export const A = () => ${UNSORTED};\n`)
    run(OXFMT, ['--write', 'src/unsorted.tsx'])
    expect(readFileSync(resolve(dir, 'src/unsorted.tsx'), 'utf8')).toContain(SORTED)
  })
})
