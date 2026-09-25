import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { assertFreshDist, DIST_CJS } from './helpers/dist'

// `OXLINT_TAILWINDCSS_CACHE_DIR` — the documented way to persist the
// design-system precompute between CI jobs (packages/docs/ci.md). Locks what
// that page promises: the plugin creates the directory (private to its owner),
// the first run writes the precompute there, and a second run reads it back
// without writing anything — same diagnostics, directory byte for byte the same.

const ROOT = resolve(__dirname, '../..')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const ENTRY = resolve(ROOT, 'tests/fixtures/default.css').split('\\').join('/')

let DIR: string
let CACHE: string

function lint(): string {
  try {
    return execFileSync(OXLINT, ['-f', 'json', 'src'], {
      cwd: DIR,
      encoding: 'utf8',
      timeout: 120_000,
      shell: IS_WINDOWS,
      // Not created yet: the plugin must create it.
      env: { ...process.env, OXLINT_TAILWINDCSS_CACHE_DIR: CACHE },
    })
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string }
    if (err.status === 1 && typeof err.stdout === 'string') return err.stdout
    throw new Error(`oxlint exited ${err.status}: ${err.stderr ?? ''}`)
  }
}

/** name → size + mtime of every file under the cache dir. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else {
        const st = statSync(path)
        out[path.slice(CACHE.length + 1)] = `${st.size}@${st.mtimeMs}`
      }
    }
  }
  walk(CACHE)
  return out
}

const diagnostics = (json: string) =>
  (JSON.parse(json) as { diagnostics: { code: string; message: string }[] }).diagnostics
    .map((d) => `${d.code} ${d.message}`)
    .sort()

beforeAll(() => {
  assertFreshDist()
  DIR = mkdtempSync(resolve(tmpdir(), 'oxtw-cache-dir-'))
  CACHE = join(DIR, 'ci-cache', 'oxlint-tailwindcss')
  mkdirSync(resolve(DIR, 'src'))
  writeFileSync(
    resolve(DIR, 'src/A.tsx'),
    'export const A = () => <div className="flex flex itms-center -m-0 p-[16px]" />\n',
  )
  writeFileSync(
    resolve(DIR, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST_CJS.split('\\').join('/')],
      settings: { tailwindcss: { entryPoint: ENTRY } },
      // DS-dependent rules that read the precompute, including the canonical map.
      rules: {
        'tailwindcss/no-duplicate-classes': 'error',
        'tailwindcss/no-unknown-classes': 'error',
        'tailwindcss/enforce-canonical': 'error',
        'tailwindcss/prefer-scale-token': 'error',
      },
    }),
  )
})

afterAll(() => {
  if (DIR) rmSync(DIR, { recursive: true, force: true })
})

describe('E2E: OXLINT_TAILWINDCSS_CACHE_DIR', () => {
  let first: string[]
  let afterFirst: Record<string, string>

  beforeAll(() => {
    first = diagnostics(lint())
    afterFirst = snapshot()
  })

  it('creates the directory, private to its owner, and writes the precompute there', () => {
    expect(Object.keys(afterFirst).some((name) => name.endsWith('.json'))).toBe(true)
    if (!IS_WINDOWS) expect(statSync(CACHE).mode & 0o777).toBe(0o700)
  })

  it('lints with the design system (the cache is not an empty shell)', () => {
    expect(first).toContain(
      'tailwindcss(no-unknown-classes) "itms-center" is not a valid Tailwind class. Did you mean "items-center"?',
    )
    expect(first.some((d) => d.startsWith('tailwindcss(enforce-canonical)'))).toBe(true)
  })

  it('a second run reads the cache back without writing to it', () => {
    const second = diagnostics(lint())
    expect(second).toEqual(first)
    expect(snapshot()).toEqual(afterFirst)
  })
})
