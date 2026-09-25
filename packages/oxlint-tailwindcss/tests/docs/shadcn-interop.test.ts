/**
 * /shadcn's "who reports what" table, this plugin's column: every example in
 * packages/docs/data/shadcn-lint.json, linted by the real oxlint with every
 * rule on (except the two that need a policy: enforce-physical,
 * no-restricted-classes) against a shadcn/ui theme. Each example may fire
 * only the rules its concern lists under `ours`, and the concern's examples
 * together fire all of them. The @shadcn/lint column is checked the same way
 * by bench/interop.mjs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { assertFreshDist, DIST_CJS } from '../e2e/helpers/dist'

const ROOT = resolve(__dirname, '../..')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const THEME = resolve(ROOT, 'tests/fixtures/shadcn.css').split('\\').join('/')

interface Concern {
  id: string
  examples: string[]
  shadcn: string[]
  ours: string[]
  use: 'ours' | 'shadcn' | 'both'
}
const DATA = JSON.parse(readFileSync(resolve(ROOT, '../docs/data/shadcn-lint.json'), 'utf8')) as {
  concerns: Concern[]
  combined: { ours: { off: string[]; on: Record<string, string> } }
}

const SKIPPED = new Set(['enforce-physical', 'no-restricted-classes'])
let RULES: Record<string, { meta?: { docs?: { recommended?: unknown } } }>
let dir: string
const fired = new Map<string, string[]>()

const fileOf = (id: string, i: number) => `${id}-${i}.tsx`

beforeAll(() => {
  assertFreshDist()
  const plugin = createRequire(__filename)(DIST_CJS) as { default?: unknown; rules?: unknown }
  RULES = ((plugin.default ?? plugin) as { rules: typeof RULES }).rules
  dir = mkdtempSync(resolve(tmpdir(), 'oxtw-shadcn-interop-'))
  mkdirSync(resolve(dir, 'src'))
  for (const c of DATA.concerns) {
    c.examples.forEach((example, i) => {
      writeFileSync(
        resolve(dir, 'src', fileOf(c.id, i)),
        `import { Button } from "@/components/ui/button"\n\nexport function Example({ tone }: { tone: string }) {\n  return ${example}\n}\n`,
      )
    })
  }
  writeFileSync(
    resolve(dir, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST_CJS.split('\\').join('/')],
      settings: { tailwindcss: { entryPoint: THEME } },
      rules: Object.fromEntries(
        Object.keys(RULES)
          .filter((r) => !SKIPPED.has(r))
          .map((r) => [`tailwindcss/${r}`, 'error']),
      ),
    }),
  )
  let stdout: string
  try {
    stdout = execFileSync(OXLINT, ['-f', 'json', 'src'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 120_000,
      shell: IS_WINDOWS,
    })
  } catch (error: unknown) {
    stdout = (error as { stdout?: string }).stdout ?? ''
  }
  for (const d of (JSON.parse(stdout) as { diagnostics: { filename: string; code: string }[] })
    .diagnostics) {
    const file = d.filename.split(/[\\/]/).pop()!
    const rule = /^tailwindcss\((.+)\)$/.exec(d.code)?.[1] ?? d.code
    fired.set(file, [...new Set([...(fired.get(file) ?? []), rule])].sort())
  }
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('/shadcn: what oxlint-tailwindcss reports', () => {
  it.each(DATA.concerns.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const all = new Set<string>()
    c.examples.forEach((example, i) => {
      const rules = fired.get(fileOf(c.id, i)) ?? []
      expect(
        rules.filter((r) => !c.ours.includes(r)),
        example,
      ).toEqual([])
      for (const r of rules) all.add(r)
    })
    expect([...all].sort()).toEqual([...c.ours].sort())
  })

  it('names rules that exist, and a combined config that changes real ones', () => {
    const names = new Set(Object.keys(RULES))
    const named = [
      ...DATA.concerns.flatMap((c) => c.ours),
      ...DATA.combined.ours.off,
      ...Object.keys(DATA.combined.ours.on),
    ]
    expect(named.filter((r) => !names.has(r))).toEqual([])
    // Turning off what isn't on, or on what already is, would be a no-op.
    expect(DATA.combined.ours.off.filter((r) => !RULES[r].meta?.docs?.recommended)).toEqual([])
    expect(
      Object.keys(DATA.combined.ours.on).filter((r) => RULES[r].meta?.docs?.recommended),
    ).toEqual([])
  })
})
