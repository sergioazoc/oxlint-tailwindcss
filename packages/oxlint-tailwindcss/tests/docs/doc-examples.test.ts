/**
 * The ✗ / ✓ examples on every rule page, run through the real oxlint.
 *
 * Each code block under "### ✗" / "### ✓" in `packages/docs/rules/_extras/<rule>.md`
 * and its Spanish twin is split into examples (groups separated by a blank
 * line). Every ✗ example must be reported by its rule and
 * no ✓ example may be. One oxlint process lints them all, each file under an
 * `overrides` entry that turns on just its rule — with the example's own
 * options — so this also exercises per-file options end to end.
 *
 * Grammar, inside a block:
 *   // options: { "max": 5 }       the rule's options: for the whole block when it
 *                                  is the block's first line, else for its example
 *   // → <div className="flex" />  after code: what `oxlint --fix --fix-suggestions`
 *   //   …                         makes of it, whole lines, byte for byte; `//   `
 *                                  lines right after it continue it
 *   //   ~~~~ ~~~  → ms-4 pe-2     under a line, or `<div … />  →  my-2` at its end:
 *                                  the fixed code contains the text (quotes dropped)
 *   // reports: Too many classes   a diagnostic of the rule contains the text
 * and before a block, for a snippet that isn't a runnable example:
 *   <!-- doc-test: skip — why -->
 *
 * A ✓ example must also hold a class string the plugin reads — a probe rule
 * reports every class in it — or it would pass without being looked at.
 *
 * Snippets are documentation, not modules: comment lines are dropped, an
 * example that starts with JSX is wrapped in a fragment, and elsewhere a JSX
 * line gets the `;` that keeps it from continuing the previous statement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { assertFreshDist, DIST_CJS } from '../e2e/helpers/dist'

const ROOT = resolve(__dirname, '../..')
const LOCALES = {
  en: resolve(ROOT, '../docs/rules/_extras'),
  es: resolve(ROOT, '../docs/es/rules/_extras'),
}
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const ENTRY = resolve(ROOT, 'tests/fixtures/docs-examples.css').split('\\').join('/')

interface Example {
  locale: string
  rule: string
  kind: 'bad' | 'good'
  file: string
  code: string
  /** Whole lines the fixed file must contain (`// →`). */
  exact: string[]
  /** Text the fixed file must contain (`~~~ →`, `/>  →`). */
  contains: string[]
  /** Text one of the rule's messages must contain (`// reports:`). */
  reports: string[]
  options?: unknown
}

const OPTIONS = /^\s*\/\/ options: (.+)$/
const ARROW = /^\s*\/\/ → (.*)$/
const CONTINUATION = /^(\s*)\/\/ {3}/
const UNDERLINE_ARROW = /^\s*\/\/\s*~[~\s]*→\s*(.+?)\s*$/
const INLINE_ARROW = /^(.*\/>)\s+→\s+(.+?)\s*$/
const REPORTS = /^\s*\/\/ reports: (.+)$/
const isComment = (line: string) => line.trim().startsWith('//')

/** A rule that reports every class it's given, other than the example's own. */
function probeFor(rule: string): [string, unknown] {
  return rule === 'no-restricted-classes'
    ? ['tailwindcss/max-class-count', ['error', { max: 0 }]]
    : ['tailwindcss/no-restricted-classes', ['error', { patterns: [{ pattern: '.' }] }]]
}
const unquote = (text: string) => text.replace(/^(["'])(.*)\1$/, '$2')

function examplesOf(
  locale: string,
  rule: string,
  kind: 'bad' | 'good',
  fence: string,
  n: number,
): Example[] {
  const lines = fence.split('\n')
  let blockOptions: unknown
  const first = OPTIONS.exec(lines[0] ?? '')
  if (first) {
    blockOptions = JSON.parse(first[1])
    lines.shift()
  }
  const chunks: string[][] = [[]]
  for (const line of lines) {
    if (line.trim() === '') chunks.push([])
    else chunks.at(-1)!.push(line)
  }
  return chunks
    .filter((c) => c.some((l) => !isComment(l)))
    .map((chunk, i) => {
      const example: Example = {
        locale,
        rule,
        kind,
        file: `${locale}--${rule}--${kind}${n}-${i}.tsx`,
        code: '',
        exact: [],
        contains: [],
        reports: [],
        options: blockOptions,
      }
      const code: string[] = []
      for (let k = 0; k < chunk.length; k++) {
        const line = chunk[k]
        let m: RegExpExecArray | null
        if ((m = OPTIONS.exec(line))) example.options = JSON.parse(m[1])
        else if ((m = REPORTS.exec(line))) example.reports.push(m[1])
        else if ((m = ARROW.exec(line))) {
          const expected = [m[1]]
          let c: RegExpExecArray | null
          while (k + 1 < chunk.length && (c = CONTINUATION.exec(chunk[k + 1]))) {
            expected.push(chunk[++k].slice(c[1].length + 5))
          }
          example.exact.push(expected.join('\n'))
        } else if ((m = UNDERLINE_ARROW.exec(line))) example.contains.push(unquote(m[1]))
        else if (!isComment(line)) {
          const inline = INLINE_ARROW.exec(line)
          if (inline) example.contains.push(unquote(inline[2]))
          code.push(inline ? inline[1] : line)
        }
      }
      const jsx = code[0].startsWith('<')
      const body = jsx
        ? code.map((l) => l.replace(/^;(?=<)/, ''))
        : code.map((l) => (/^<[A-Za-z]/.test(l) ? `;${l}` : l))
      example.code = jsx
        ? `export const Example = () => (\n<>\n${body.join('\n')}\n</>\n)\n`
        : `${body.join('\n')}\n`
      return example
    })
}

function collect(): Example[] {
  const out: Example[] = []
  for (const [locale, dir] of Object.entries(LOCALES)) {
    for (const f of readdirSync(dir).sort()) out.push(...pageExamples(locale, dir, f))
  }
  return out
}

function pageExamples(locale: string, dir: string, f: string): Example[] {
  const out: Example[] = []
  const rule = f.slice(0, -3)
  const md = readFileSync(resolve(dir, f), 'utf8')
  for (const [kind, heading] of [
    ['bad', '### ✗'],
    ['good', '### ✓'],
  ] as const) {
    const start = md.indexOf(heading)
    if (start === -1) continue
    const rest = md.slice(start + heading.length)
    const end = rest.search(/\n##+ /)
    const section = end === -1 ? rest : rest.slice(0, end)
    let n = 0
    for (const m of section.matchAll(
      /(<!-- doc-test: skip[^>]*-->\s*\n)?```(?:tsx|jsx|ts|js)\n([\s\S]*?)```/g,
    )) {
      if (!m[1]) out.push(...examplesOf(locale, rule, kind, m[2], n))
      n++
    }
  }
  return out
}

const EXAMPLES = collect()
let DIR: string
let reported: Map<string, { code: string; message: string }[]>

function run(args: string[], cwd: string): string {
  try {
    return execFileSync(OXLINT, args, {
      cwd,
      encoding: 'utf8',
      timeout: 120_000,
      shell: IS_WINDOWS,
    })
  } catch (error: unknown) {
    // exit 1: diagnostics remain; the assertions decide.
    return (error as { stdout?: string }).stdout ?? ''
  }
}

function lint(cwd: string): Map<string, { code: string; message: string }[]> {
  const map = new Map<string, { code: string; message: string }[]>()
  const { diagnostics } = JSON.parse(run(['-f', 'json', 'src'], cwd)) as {
    diagnostics: { filename?: string; code?: string; message: string }[]
  }
  for (const d of diagnostics) {
    const file = (d.filename ?? '').split(/[\\/]/).pop()!
    const entry = { code: d.code ?? 'parse error', message: d.message }
    map.set(file, [...(map.get(file) ?? []), entry])
  }
  return map
}

beforeAll(() => {
  assertFreshDist()
  DIR = mkdtempSync(resolve(tmpdir(), 'oxtw-doc-examples-'))
  mkdirSync(resolve(DIR, 'src'))
  for (const e of EXAMPLES) writeFileSync(resolve(DIR, 'src', e.file), e.code)
  writeFileSync(
    resolve(DIR, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST_CJS.split('\\').join('/')],
      settings: { tailwindcss: { entryPoint: ENTRY } },
      overrides: EXAMPLES.map((e) => ({
        files: [`src/${e.file}`],
        rules: Object.fromEntries([
          [`tailwindcss/${e.rule}`, e.options === undefined ? 'error' : ['error', e.options]],
          ...(e.kind === 'good' ? [probeFor(e.rule)] : []),
        ]),
      })),
    }),
  )
  reported = lint(DIR)
})

afterAll(() => {
  if (DIR) rmSync(DIR, { recursive: true, force: true })
})

describe('rule-page examples', () => {
  it.each(Object.entries(LOCALES))('finds examples on every %s rule page', (locale, dir) => {
    const rules = new Set(EXAMPLES.filter((e) => e.locale === locale).map((e) => e.rule))
    expect([...rules].sort()).toEqual(readdirSync(dir).map((f) => f.slice(0, -3)))
  })

  it.each(EXAMPLES.map((e) => [e.file, e] as const))('%s', (_, e) => {
    const diagnostics = reported.get(e.file) ?? []
    expect(
      diagnostics.filter((d) => d.code === 'parse error').map((d) => d.message),
      e.code,
    ).toEqual([])
    const own = diagnostics.filter((d) => d.code === `tailwindcss(${e.rule})`)
    if (e.kind === 'bad') {
      expect(own.length, `✗ example not reported:\n${e.code}`).toBeGreaterThan(0)
    } else {
      expect(
        own.map((d) => d.message),
        `✓ example reported:\n${e.code}`,
      ).toEqual([])
      const probe = diagnostics.filter(
        (d) => d.code === probeFor(e.rule)[0].replace(/\/(.+)/, '($1)'),
      )
      expect(
        probe.length,
        `✓ example has no class string the plugin reads:\n${e.code}`,
      ).toBeGreaterThan(0)
    }
    for (const text of e.reports) {
      expect(
        own.map((d) => d.message),
        e.code,
      ).toContainEqual(expect.stringContaining(text))
    }
  })

  describe('what the fixes make of them', () => {
    const withFixes = EXAMPLES.filter((e) => e.exact.length + e.contains.length > 0)
    let fixed: string

    beforeAll(() => {
      fixed = mkdtempSync(resolve(tmpdir(), 'oxtw-doc-examples-fix-'))
      cpSync(DIR, fixed, { recursive: true })
      // oxlint applies one fix per class string per run.
      for (let pass = 0; pass < 3; pass++) run(['--fix', '--fix-suggestions', 'src'], fixed)
    })

    afterAll(() => {
      if (fixed) rmSync(fixed, { recursive: true, force: true })
    })

    it.each(withFixes.map((e) => [e.file, e] as const))('%s', (_, e) => {
      const after = readFileSync(resolve(fixed, 'src', e.file), 'utf8')
      for (const text of e.exact) {
        expect(`\n${after}`, `not in the fixed file as whole lines:\n${text}`).toContain(
          `\n${text}\n`,
        )
      }
      for (const text of [...e.exact, ...e.contains]) {
        expect(e.code, `already in the example before fixing: ${text}`).not.toContain(text)
        expect(after).toContain(text)
      }
    })
  })
})
