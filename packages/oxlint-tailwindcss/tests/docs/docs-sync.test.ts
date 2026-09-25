/**
 * The docs say what the code does — checked against the code, not by eye.
 *
 * Every fact here was once hand-copied into markdown and could drift: how many
 * rules there are and where each is listed, what each rule's options are and
 * default to, which rules need the design system, the settings keys and the
 * environment variables, the default extractor lists, and the version floors.
 * A failure names the doc to fix; fix the doc (or the code), never the test.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import plugin from '../../src/index'
import { DEFAULT_EXTRACTOR_CONFIG } from '../../src/utils/extractors'
import { DS_UNAVAILABLE_MESSAGE_ID } from '../../src/utils/fatal'

const PKG = resolve(__dirname, '../..')
const REPO = resolve(PKG, '../..')
const DOCS = join(REPO, 'packages/docs')
const read = (path: string) => readFileSync(path, 'utf8')

const RULES = Object.keys(plugin.rules).sort()
type Rule = (typeof plugin.rules)[keyof typeof plugin.rules]
const rule = (name: string) => (plugin.rules as Record<string, Rule>)[name]

const LOCALES = [
  { dir: '', options: '## Options', defaults: '## Defaults reference', count: /The (\d+) rules/ },
  {
    dir: 'es/',
    options: '## Opciones',
    defaults: '## Referencia de defaults',
    count: /Las (\d+) reglas/,
  },
] as const

/** The markdown between `heading` and the next heading of the same level. */
function section(md: string, heading: string): string {
  const start = md.indexOf(`\n${heading}`)
  if (start === -1) return ''
  const level = heading.match(/^#+/)![0]
  const rest = md.slice(start + heading.length + 1)
  const next = rest.search(new RegExp(`\\n${level} `))
  return next === -1 ? rest : rest.slice(0, next)
}

function schemaKeys(name: string): string[] {
  const schema = rule(name).meta?.schema as { properties?: Record<string, unknown> }[] | undefined
  return Object.keys(schema?.[0]?.properties ?? {}).sort()
}

// ─── Which rules need the design system ────────────────────────────────────
//
// DS-dependent is exact: a rule that may report `designSystemUnavailable` must
// declare that messageId (oxlint rejects reporting an undeclared one). DS-optional
// vs DS-independent is read from the import graph: a rule that reaches
// `createLazyLoader` through its own module or a sibling rule module it imports
// (enforce-physical borrows enforce-logical's mapper) consults the design system.

const RULES_DIR = join(PKG, 'src/rules')
function reachesLoader(name: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false
  seen.add(name)
  const src = read(join(RULES_DIR, `${name}.ts`))
  if (/\bcreateLazyLoader\s*\(/.test(src)) return true
  for (const m of src.matchAll(/from '\.\/([a-z-]+)'/g)) {
    if (reachesLoader(m[1], seen)) return true
  }
  return false
}
const dsDependent = RULES.filter((n) => DS_UNAVAILABLE_MESSAGE_ID in (rule(n).meta?.messages ?? {}))
const dsOptional = RULES.filter((n) => !dsDependent.includes(n) && reachesLoader(n))
const dsIndependent = RULES.filter((n) => !dsDependent.includes(n) && !dsOptional.includes(n))

/** Rule names in the first column of a markdown table: `| \`name\` | … |`. */
function tableRules(md: string): string[] {
  return [...md.matchAll(/^\| `([a-z-]+)`\s*\|/gm)].map((m) => m[1]).sort()
}

/** `{ mode: 'default' }` (as the docs write it) → a value to compare with. */
function parseDocDefault(cell: string): unknown {
  const text = cell
    .replace(/\(.*?\)/g, '')
    .replace(/`/g, '')
    .trim()
  if (text === '') return null
  const json = text.replace(/([{,]\s*)([a-zA-Z]+)\s*:/g, '$1"$2":').replace(/'/g, '"')
  return JSON.parse(json)
}

describe.each(LOCALES)('rules/index.md ($dir)', ({ dir, defaults, count }) => {
  const md = read(join(DOCS, dir, 'rules/index.md'))
  const lists = md.slice(0, md.indexOf(`\n${defaults}`))
  const reference = section(md, defaults)

  it('states the real rule count', () => {
    expect(Number(md.match(count)?.[1])).toBe(RULES.length)
  })

  it('lists every rule exactly once in the category lists', () => {
    for (const name of RULES) {
      expect(lists.split(`](./${name})`).length - 1, name).toBe(1)
    }
  })

  it('puts every rule in the defaults tables exactly once, in its real group', () => {
    const [dependent, optional, independent] = reference
      .split(/\n### /)
      .slice(1)
      .map((t) => tableRules(t))
    expect(dependent).toEqual(dsDependent)
    expect(optional).toEqual(dsOptional)
    expect(independent).toEqual(dsIndependent)
  })

  it('prints each rule’s real default options', () => {
    for (const m of reference.matchAll(/^\| `([a-z-]+)`\s*\|([^|]+)\|/gm)) {
      const [, name, cell] = m
      const actual = (rule(name).meta?.defaultOptions as unknown[] | undefined)?.[0] ?? null
      expect(parseDocDefault(cell), name).toEqual(actual)
    }
  })
})

describe.each(LOCALES)('rules/_extras ($dir) document every option', ({ dir, options }) => {
  it.each(RULES)('%s', (name) => {
    const md = read(join(DOCS, dir, 'rules/_extras', `${name}.md`))
    const keys = schemaKeys(name)
    const opts = section(md, options)
    for (const key of keys) expect(opts, `${name}: option \`${key}\``).toContain(`\`${key}\``)

    // …and documents nothing that isn't one: every option heading or table row
    // under Options names a real schema key.
    const documented = [
      ...opts.matchAll(/^### `([a-zA-Z]+)`/gm),
      ...opts.matchAll(/^\| `([a-zA-Z]+)`\s*\|/gm),
    ].map((m) => m[1])
    for (const key of documented) expect(keys, `${name}: stale option \`${key}\``).toContain(key)
  })
})

describe('the home page', () => {
  it.each([
    ['index.md', /(\d+) rules/],
    ['es/index.md', /(\d+) reglas/],
  ])('%s states the real rule count', (page, count) => {
    expect(Number(read(join(DOCS, page)).match(count)?.[1])).toBe(RULES.length)
  })
})

describe('the README setup snippet', () => {
  it('sets a severity for every rule, once', () => {
    const md = read(join(PKG, 'README.md'))
    const setup = section(md, '## Setup')
    const snippet = setup.slice(
      setup.indexOf('```jsonc'),
      setup.indexOf('```', setup.indexOf('```jsonc') + 3),
    )
    const listed = [...snippet.matchAll(/"tailwindcss\/([a-z-]+)":/g)].map((m) => m[1]).sort()
    expect(listed).toEqual(RULES)
  })
})

describe('READMEs name every rule and the real count', () => {
  for (const readme of ['README.md', 'packages/oxlint-tailwindcss/README.md']) {
    it(readme, () => {
      const md = read(join(REPO, readme))
      for (const name of RULES) expect(md, name).toContain(name)
      for (const m of md.matchAll(/\b(\d+) (?:Tailwind CSS (?:v4 )?)?(?:linting )?rules\b/g)) {
        expect(Number(m[1]), m[0]).toBe(RULES.length)
      }
    })
  }
})

// ─── Settings ─────────────────────────────────────────────────────────────

const PLUGIN_SETTINGS = (() => {
  const src = read(join(PKG, 'src/types.ts'))
  const body = src.slice(src.indexOf('export interface PluginSettings {'))
  const block = body.slice(0, body.indexOf('\n}'))
  return [...block.matchAll(/^ {2}([a-zA-Z]+)\?:/gm)].map((m) => m[1]).sort()
})()

describe.each(['', 'es/'])('settings.md (%s)', (dir) => {
  const md = read(join(DOCS, dir, 'settings.md'))

  it('documents every PluginSettings key', () => {
    expect(PLUGIN_SETTINGS.length).toBeGreaterThan(8)
    for (const key of PLUGIN_SETTINGS) expect(md, key).toContain(`\`${key}\``)
  })

  it('gives a heading only to real settings', () => {
    for (const m of md.matchAll(/^## `([a-zA-Z]+)`/gm)) expect(PLUGIN_SETTINGS).toContain(m[1])
  })

  it('lists every environment variable the code reads', () => {
    const vars = new Set<string>()
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.ts')) {
          for (const m of read(p).matchAll(/process\.env\.(OXLINT_TAILWINDCSS_[A-Z_]+)/g))
            vars.add(m[1])
        }
      }
    }
    walk(join(PKG, 'src'))
    expect(vars.size).toBeGreaterThan(0)
    for (const v of vars) expect(md, v).toContain(`\`${v}\``)
    expect(md).toContain('DEBUG=oxlint-tailwindcss')
  })

  it('prints the real default extractor lists', () => {
    for (const callee of DEFAULT_EXTRACTOR_CONFIG.callees)
      expect(md, callee).toContain(`\`${callee}\``)
    for (const attr of DEFAULT_EXTRACTOR_CONFIG.attributes)
      expect(md, attr).toContain(`\`${attr}\``)
  })
})

describe('the numbers the setup page quotes', () => {
  it('~N default callees', () => {
    for (const dir of ['', 'es/']) {
      const n = Number(read(join(DOCS, dir, 'setup.md')).match(/~(\d+) callees/)?.[1])
      expect(n, `${dir}setup.md`).toBe(DEFAULT_EXTRACTOR_CONFIG.callees.length)
    }
  })

  it('the runtime dependencies', () => {
    const deps = Object.keys(
      (JSON.parse(read(join(PKG, 'package.json'))) as { dependencies: Record<string, string> })
        .dependencies,
    ).sort()
    const md = read(join(PKG, 'README.md'))
    const m = md.match(/Only (\d+) runtime dependencies: (.*)\./)
    expect(Number(m?.[1])).toBe(deps.length)
    for (const dep of deps) expect(m?.[2]).toContain(`\`${dep}\``)
  })
})

// ─── Floors ───────────────────────────────────────────────────────────────

describe('version floors match the code', () => {
  const guard = read(join(PKG, 'src/design-system/engine-guard.ts'))
  const [, maj, min, pat] = guard.match(
    /MIN_ENGINE: Semver = \{ major: (\d+), minor: (\d+), patch: (\d+)/,
  )!
  const tailwindFloor = `${maj}.${min}.${pat}`
  const nodeRange = (JSON.parse(read(join(PKG, 'package.json'))) as { engines: { node: string } })
    .engines.node
  // The floor CI actually smoke-tests (.github/workflows/ci.yml, job "floors").
  const oxlintFloor = read(join(REPO, '.github/workflows/ci.yml')).match(
    /oxlint (\d+\.\d+\.\d+) \(documented floor\)/,
  )?.[1]
  const pages = ['setup.md', 'es/setup.md'].map((p) => join(DOCS, p))
  const readmes = ['README.md', 'packages/oxlint-tailwindcss/README.md'].map((p) => join(REPO, p))

  it('Tailwind', () => {
    for (const file of [...pages, ...readmes]) {
      const md = read(file)
      expect(md, file).toContain(`v${tailwindFloor}`)
      expect(md, `${file} still says v4.1+`).not.toMatch(/v4\.1\+/)
    }
  })

  it('Node', () => {
    for (const file of [...pages, ...readmes]) expect(read(file), file).toContain(nodeRange)
  })

  it('oxlint', () => {
    expect(oxlintFloor).toBeDefined()
    for (const file of [...pages, ...readmes]) expect(read(file), file).toContain(oxlintFloor!)
  })
})
