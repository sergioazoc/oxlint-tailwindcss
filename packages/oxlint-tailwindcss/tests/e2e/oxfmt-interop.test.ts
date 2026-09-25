import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { assertFreshDist, DIST_CJS } from './helpers/dist'

// oxfmt's `sortTailwindcss` and this plugin, driven end to end with the real
// binaries — what /interop promises (packages/docs/interop.md, EN + ES):
//
//   - pointed at the same stylesheet, with `functions` naming your helpers,
//     oxfmt sorts, de-duplicates and collapses whitespace in class attributes and
//     those helpers exactly as `enforce-sort-order` / `no-duplicate-classes` /
//     `no-unnecessary-whitespace` want: after `oxfmt --write` they report nothing
//     there, and after `oxlint --fix` `oxfmt --check` has nothing to change;
//   - class strings oxfmt doesn't format (a variable) stay the linter's;
//   - without `functions`, `cn(…)` arguments are left unsorted by oxfmt;
//   - without `stylesheet`, oxfmt doesn't know the project's tokens and orders
//     them differently;
//   - oxfmt leaves the variant chain inside a class as written, so
//     `consistent-variant-order` has no formatter counterpart (its rule page
//     says so).
// When one of these changes (an oxfmt release), update interop.md first.

const ROOT = resolve(__dirname, '../..')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const OXFMT = resolve(ROOT, '../../node_modules/.bin', IS_WINDOWS ? 'oxfmt.cmd' : 'oxfmt')
const TAILWIND = resolve(ROOT, 'node_modules/tailwindcss/index.css').split('\\').join('/')

// Already in oxfmt's style except for the class strings, so any change oxfmt
// makes is a class change.
const SOURCE = `import { cn } from "./cn";

export const A = () => <div className="text-brand p-4  bg-brand flex flex" />;
export const b = cn("p-4 flex");
export const classes = "p-4 flex";
`

let dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

function project(sortTailwindcss: Record<string, unknown>): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'oxtw-oxfmt-'))
  dirs.push(dir)
  mkdirSync(resolve(dir, 'src'))
  writeFileSync(
    resolve(dir, 'src/app.css'),
    `@import '${TAILWIND}';\n@theme { --color-brand: #f00; }\n`,
  )
  writeFileSync(resolve(dir, 'src/a.tsx'), SOURCE)
  writeFileSync(resolve(dir, '.oxfmtrc.json'), JSON.stringify({ sortTailwindcss }))
  writeFileSync(
    resolve(dir, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST_CJS.split('\\').join('/')],
      settings: { tailwindcss: { entryPoint: './src/app.css' } },
      rules: {
        'tailwindcss/enforce-sort-order': 'error',
        'tailwindcss/no-duplicate-classes': 'error',
        'tailwindcss/no-unnecessary-whitespace': 'error',
      },
    }),
  )
  return dir
}

function run(bin: string, args: string[], cwd: string): { status: number; stdout: string } {
  try {
    return {
      status: 0,
      stdout: execFileSync(bin, args, {
        cwd,
        encoding: 'utf8',
        timeout: 60_000,
        shell: IS_WINDOWS,
      }),
    }
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string }
    return { status: err.status ?? 1, stdout: err.stdout ?? '' }
  }
}

/** `line rule` for every diagnostic oxlint reports on src/a.tsx. */
function lint(dir: string): string[] {
  const { stdout } = run(OXLINT, ['-f', 'json', 'src'], dir)
  const { diagnostics } = JSON.parse(stdout) as {
    diagnostics: { code: string; labels: { span: { line: number } }[] }[]
  }
  return diagnostics
    .map((d) => `${d.labels[0].span.line} ${d.code.replace('tailwindcss(', '').replace(')', '')}`)
    .sort()
}

const read = (dir: string) => readFileSync(resolve(dir, 'src/a.tsx'), 'utf8')

beforeAll(() => {
  assertFreshDist()
})

describe('E2E: oxfmt sortTailwindcss and oxlint-tailwindcss agree', () => {
  it('with stylesheet + functions, oxfmt leaves the linter nothing in attributes and helpers', () => {
    const dir = project({ stylesheet: './src/app.css', functions: ['cn'] })
    run(OXFMT, ['--write', 'src/a.tsx'], dir)
    expect(read(dir)).toContain('className="flex bg-brand p-4 text-brand"')
    expect(read(dir)).toContain('cn("flex p-4")')
    // Only the variable is left: oxfmt doesn't format class strings in variables.
    expect(lint(dir)).toEqual(['5 enforce-sort-order'])
  })

  it('CANARY: oxlint applies one fix per class string per run', () => {
    // Three rules fix the same string (duplicate, whitespace, order) and oxlint
    // has no multi-pass fixing: one run applies one of them. interop.md says so.
    const dir = project({ stylesheet: './src/app.css', functions: ['cn'] })
    run(OXLINT, ['--fix', 'src'], dir)
    expect(lint(dir)).toContain('3 enforce-sort-order')
  })

  it('after oxlint --fix (until nothing changes), oxfmt --check has nothing to change', () => {
    const dir = project({ stylesheet: './src/app.css', functions: ['cn'] })
    for (let pass = 0; pass < 3; pass++) run(OXLINT, ['--fix', 'src'], dir)
    expect(lint(dir)).toEqual([])
    expect(run(OXFMT, ['--check', 'src/a.tsx'], dir).status).toBe(0)
  })

  it('without functions, oxfmt leaves cn() arguments unsorted', () => {
    const dir = project({ stylesheet: './src/app.css' })
    run(OXFMT, ['--write', 'src/a.tsx'], dir)
    expect(read(dir)).toContain('cn("p-4 flex")')
    expect(lint(dir)).toEqual(['4 enforce-sort-order', '5 enforce-sort-order'])
  })

  it("without stylesheet, oxfmt doesn't know the project's tokens and orders them differently", () => {
    const dir = project({ functions: ['cn'] })
    run(OXFMT, ['--write', 'src/a.tsx'], dir)
    expect(read(dir)).toContain('className="text-brand bg-brand flex p-4"')
    expect(lint(dir)).toContain('3 enforce-sort-order')
  })

  it('CANARY: oxfmt leaves the variant chain inside a class as written', () => {
    const dir = project({ stylesheet: './src/app.css', functions: ['cn'] })
    writeFileSync(
      resolve(dir, 'src/a.tsx'),
      'export const A = () => <div className="hover:sm:flex" />;\n',
    )
    run(OXFMT, ['--write', 'src/a.tsx'], dir)
    expect(read(dir)).toContain('className="hover:sm:flex"')
  })
})
