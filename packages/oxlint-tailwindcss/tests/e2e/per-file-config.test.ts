import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { assertFreshDist, DIST_CJS } from './helpers/dist'

// Options and settings are per FILE, not per run.
//
// oxlint calls a rule's `createOnce` once per worker and then lints many files
// with it. Two things vary between those files (oxlint 1.85, measured):
//   - `context.options` — `overrides` and nested `.oxlintrc.json` give a file its
//     own rule options (the same array object for every file of one config);
//   - `context.settings` — a nested `.oxlintrc.json` gives a file its own
//     `settings` (a fresh object for every file). `overrides` can't set them.
// The plugin used to compile both on the first file and keep them for the whole
// run, so whichever config came first won: a stricter override's `max` was
// ignored, a package's own `attributes`/`rootFontSize` leaked into — or were
// missing from — its neighbours.
//
// `--threads=1` puts every file through ONE worker, which is what makes the
// leak deterministic; the default thread count must agree with it.

const ROOT = resolve(__dirname, '../..')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const ENTRY = resolve(ROOT, 'tests/fixtures/default.css').split('\\').join('/')
const PLUGIN = DIST_CJS.split('\\').join('/')

const FILES: Record<string, string> = {
  // Root config, max-class-count { max: 5 }: 3 classes is fine. `tw` is not a
  // class attribute here. Root font size 16: `p-[16px]` is `p-4`.
  'src/loose.tsx': `export const A = () => <>
  <div className="flex p-4 m-2" />
  <div tw="flex flex" />
  <div className="p-[16px]" />
</>
`,
  // Root config + override for src/strict/**: max-class-count { max: 2 }.
  'src/strict/tight.tsx': `export const B = () => <div className="flex p-4 m-2" />
`,
  // Nested config: `tw` IS a class attribute, root font size 20, so `p-[20px]`
  // is `p-4`; and max-class-count { max: 1 }.
  'pkg/src/nested.tsx': `export const C = () => <>
  <div tw="flex flex" />
  <div className="p-[20px]" />
  <div className="flex p-4" />
</>
`,
  // Nested config that `extends` the root (the documented Pattern B shape):
  // inherits jsPlugins and rules (max-class-count { max: 5 }), adds `tw`.
  'ext/src/extended.tsx': `export const D = () => <>
  <div tw="flex flex" />
  <div className="a b c d e f" />
</>
`,
}

interface Diagnostic {
  code: string
  message: string
  filename: string
  labels: { span: { line: number } }[]
}

let DIR: string

function lint(extraArgs: string[]): string[] {
  let stdout: string
  try {
    stdout = execFileSync(OXLINT, [...extraArgs, '-f', 'json', 'src', 'pkg', 'ext'], {
      cwd: DIR,
      encoding: 'utf8',
      timeout: 60_000,
      shell: IS_WINDOWS,
    })
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string }
    if (err.status !== 1 || typeof err.stdout !== 'string') {
      throw new Error(`oxlint exited ${err.status}: ${err.stderr ?? ''}`)
    }
    stdout = err.stdout
  }
  const { diagnostics } = JSON.parse(stdout) as { diagnostics: Diagnostic[] }
  // `file:line rule — message`, sorted: order-independent and readable on failure.
  return diagnostics
    .map((d) => {
      const file = d.filename
        .split(sep)
        .join('/')
        .replace(/^.*?(src|pkg|ext)\//, '$1/')
      return `${file}:${d.labels[0].span.line} ${d.code} — ${d.message}`
    })
    .sort()
}

beforeAll(() => {
  assertFreshDist()
  DIR = mkdtempSync(resolve(tmpdir(), 'oxtw-per-file-'))
  for (const [name, content] of Object.entries(FILES)) {
    mkdirSync(resolve(DIR, name, '..'), { recursive: true })
    writeFileSync(resolve(DIR, name), content)
  }
  writeFileSync(
    resolve(DIR, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [PLUGIN],
      settings: { tailwindcss: { entryPoint: ENTRY } },
      rules: {
        'tailwindcss/max-class-count': ['error', { max: 5 }],
        'tailwindcss/no-duplicate-classes': 'error',
        'tailwindcss/prefer-scale-token': 'error',
      },
      overrides: [
        {
          files: ['src/strict/**'],
          rules: { 'tailwindcss/max-class-count': ['error', { max: 2 }] },
        },
      ],
    }),
  )
  // Nested configs stand alone in oxlint: nothing is inherited from the root.
  writeFileSync(
    resolve(DIR, 'pkg/.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [PLUGIN],
      settings: { tailwindcss: { entryPoint: ENTRY, attributes: ['tw'], rootFontSize: 20 } },
      rules: {
        'tailwindcss/max-class-count': ['error', { max: 1 }],
        'tailwindcss/no-duplicate-classes': 'error',
        'tailwindcss/prefer-scale-token': 'error',
      },
    }),
  )
  writeFileSync(
    resolve(DIR, 'ext/.oxlintrc.json'),
    JSON.stringify({
      extends: ['../.oxlintrc.json'],
      settings: { tailwindcss: { entryPoint: ENTRY, attributes: ['tw'] } },
    }),
  )
})

afterAll(() => {
  if (DIR) rmSync(DIR, { recursive: true, force: true })
})

const has = (list: string[], prefix: string, text: string) =>
  list.some((d) => d.startsWith(prefix) && d.includes(text))

describe('E2E: options and settings are resolved per file', () => {
  let single: string[]

  beforeAll(() => {
    single = lint(['--threads=1'])
  })

  it('applies an `overrides` block’s rule options to its files only', () => {
    expect(has(single, 'src/strict/tight.tsx:1 tailwindcss(max-class-count)', '(3)')).toBe(true)
    expect(
      single.filter((d) => d.startsWith('src/loose.tsx') && d.includes('max-class-count')),
    ).toEqual([])
  })

  it('applies a nested config’s rule options to its files only', () => {
    expect(
      has(single, 'pkg/src/nested.tsx:4 tailwindcss(max-class-count)', 'Maximum allowed is 1'),
    ).toBe(true)
  })

  it('reads extractor settings (`attributes`) from the file’s own config', () => {
    expect(has(single, 'pkg/src/nested.tsx:2 tailwindcss(no-duplicate-classes)', 'flex')).toBe(true)
    expect(
      single.filter((d) => d.startsWith('src/loose.tsx') && d.includes('no-duplicate-classes')),
    ).toEqual([])
  })

  it('reads `rootFontSize` from the file’s own config', () => {
    expect(has(single, 'src/loose.tsx:4 tailwindcss(prefer-scale-token)', '"p-[16px]"')).toBe(true)
    expect(has(single, 'src/loose.tsx:4 tailwindcss(prefer-scale-token)', '"p-4"')).toBe(true)
    expect(has(single, 'pkg/src/nested.tsx:3 tailwindcss(prefer-scale-token)', '"p-[20px]"')).toBe(
      true,
    )
    expect(has(single, 'pkg/src/nested.tsx:3 tailwindcss(prefer-scale-token)', '"p-4"')).toBe(true)
  })

  it('a nested config that `extends` the root inherits its plugins and rules', () => {
    expect(has(single, 'ext/src/extended.tsx:2 tailwindcss(no-duplicate-classes)', 'flex')).toBe(
      true,
    )
    expect(has(single, 'ext/src/extended.tsx:3 tailwindcss(max-class-count)', '(6)')).toBe(true)
  })

  it('gives the same result with the default thread count', () => {
    expect(lint([])).toEqual(single)
  })
})
