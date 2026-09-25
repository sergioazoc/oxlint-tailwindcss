/**
 * Every JSON config the docs, the READMEs and the skills show, loaded by the
 * real tool it's for.
 *
 * A block can hold several documents; each one is placed by the comment that
 * names its file (`// packages/ui/.oxlintrc.json`, `// .oxfmtrc.json`) or, with
 * none, is an `.oxlintrc.json` — a bare `{ "tailwindcss/…": … }` fragment goes
 * under `rules`. oxlint rejects unknown rules, bad severities and options its
 * schema doesn't allow, so loading a config is the test; `settings` it doesn't
 * check, so `settings.tailwindcss` is checked here against `PluginSettings`
 * (src/types.ts). oxfmt configs are loaded by oxfmt, and their
 * `sortTailwindcss` keys checked against oxfmt's own schema. `jsPlugins:
 * ["oxlint-tailwindcss"]` resolves through a `node_modules` link to this
 * package, the way it does in a project.
 *
 * Skipped, by the comment above them: `// v0…` documents (old syntax, shown on
 * the migration guide on purpose) and `.prettierrc` (Prettier isn't installed).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { assertFreshDist } from '../e2e/helpers/dist'

const ROOT = resolve(__dirname, '../..')
const REPO = resolve(ROOT, '../..')
const DOCS = resolve(REPO, 'packages/docs')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const OXFMT = resolve(REPO, 'node_modules/.bin', IS_WINDOWS ? 'oxfmt.cmd' : 'oxfmt')

// ── Where configs are shown ─────────────────────────────────────────────────

function markdownUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.vitepress', 'public', 'scripts', 'tests'].includes(entry.name)) {
        out.push(...markdownUnder(path))
      }
    } else if (entry.name.endsWith('.md') && !['CLAUDE.md', 'AGENTS.md'].includes(entry.name)) {
      // A generated rule page repeats its `_extras` source, which is read instead.
      if (!existsSync(join(dir, '_extras', entry.name))) out.push(path)
    }
  }
  return out
}

const SOURCES = [
  ...markdownUnder(DOCS),
  resolve(REPO, 'README.md'),
  resolve(ROOT, 'README.md'),
  resolve(REPO, 'CONTRIBUTING.md'),
  ...readdirSync(resolve(REPO, '.claude/skills')).map((s) =>
    resolve(REPO, '.claude/skills', s, 'SKILL.md'),
  ),
].filter((f) => existsSync(f))

// ── JSONC ───────────────────────────────────────────────────────────────────

/** JSON with comments and trailing commas → JSON. */
function stripJsonc(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      const start = i
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\') i++
      }
      out += text.slice(start, i + 1)
    } else if (text.startsWith('//', i)) {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (text.startsWith('/*', i)) {
      i = text.indexOf('*/', i) + 1
    } else out += ch
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

interface Doc {
  source: string
  /** The comment lines right above it. */
  comment: string[]
  value: unknown
}

/** The JSON documents of one block, in order. */
function documents(source: string, block: string): Doc[] {
  const docs: Doc[] = []
  let comment: string[] = []
  let i = 0
  while (i < block.length) {
    if (/\s/.test(block[i])) {
      i++
    } else if (block.startsWith('//', i)) {
      const end = block.indexOf('\n', i)
      comment.push(block.slice(i + 2, end === -1 ? undefined : end).trim())
      i = end === -1 ? block.length : end + 1
    } else if (block[i] === '"') {
      // A bare `"tailwindcss/…": …` member: the rest of the block is one object.
      docs.push({ source, comment, value: JSON.parse(stripJsonc(`{${block.slice(i)}}`)) })
      break
    } else {
      let depth = 0
      const start = i
      for (; i < block.length; i++) {
        const ch = block[i]
        if (ch === '"') {
          for (i++; i < block.length && block[i] !== '"'; i++) {
            if (block[i] === '\\') i++
          }
        } else if (block.startsWith('//', i)) {
          const end = block.indexOf('\n', i)
          i = end === -1 ? block.length : end
        } else if (ch === '{' || ch === '[') {
          depth++
        } else if ((ch === '}' || ch === ']') && --depth === 0) {
          break
        }
      }
      const text = block.slice(start, ++i)
      try {
        docs.push({ source, comment, value: JSON.parse(stripJsonc(text)) })
      } catch (error) {
        throw new Error(`${source}: not valid JSON(C):\n${text}\n${String(error)}`, {
          cause: error,
        })
      }
      comment = []
    }
  }
  return docs
}

const DOCS_FOUND: Doc[] = []
for (const file of SOURCES) {
  const md = readFileSync(file, 'utf8')
  for (const m of md.matchAll(/```(?:json|jsonc|json5)\b[^\n]*\n([\s\S]*?)```/g)) {
    const line = md.slice(0, m.index).split('\n').length
    DOCS_FOUND.push(...documents(`${relative(REPO, file)}:${line}`, m[1]))
  }
}

type Kind = 'oxlint' | 'oxfmt' | 'skip'

/** The file a document names in the comment above it, if any. */
function namedFile(doc: Doc): string | undefined {
  for (const line of doc.comment) {
    const m = /^(\S*(?:\.oxlintrc\.json|\.oxfmtrc\.jsonc?|\.prettierrc\S*))\b/.exec(line)
    if (m) return m[1].replace(/^\/[^/]+\//, '') // `/my-monorepo/.oxlintrc.json` → root
  }
  return undefined
}

function kindOf(doc: Doc): Kind {
  const file = namedFile(doc)
  if (doc.comment.some((l) => /^v0\b/.test(l))) return 'skip'
  if (file?.includes('.prettierrc')) return 'skip'
  if (file?.includes('.oxfmtrc') || (isObject(doc.value) && 'sortTailwindcss' in doc.value)) {
    return 'oxfmt'
  }
  return 'oxlint'
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * A document as the `.oxlintrc.json` it is, or the one a fragment goes in: bare
 * rules go under `rules`, and a `rules` / `settings` excerpt gets the plugin. A
 * config with `$schema` or `extends` is shown whole, so it must name the plugin
 * itself (or inherit it).
 */
function asOxlintConfig(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('not an object')
  const keys = Object.keys(value)
  if (keys.length > 0 && keys.every((k) => k.startsWith('tailwindcss/'))) {
    return { jsPlugins: ['oxlint-tailwindcss'], rules: value }
  }
  if (!('jsPlugins' in value) && !('$schema' in value) && !('extends' in value)) {
    return { jsPlugins: ['oxlint-tailwindcss'], ...value }
  }
  return value
}

// ── settings.tailwindcss, checked against PluginSettings ─────────────────────

const TYPES = readFileSync(resolve(ROOT, 'src/types.ts'), 'utf8')

function fieldsOf(name: string): Map<string, string> {
  const start = TYPES.indexOf(`export interface ${name} {`)
  const body = TYPES.slice(start, TYPES.indexOf('\n}', start))
  return new Map([...body.matchAll(/^ {2}(\w+)\?: (.+)$/gm)].map((m) => [m[1], m[2].trim()]))
}

const SETTINGS = fieldsOf('PluginSettings')
const EXCLUSIONS = fieldsOf('ExtractorExclusions')
const EXTRACTOR_KINDS = [
  ...(/export type CalleeExtractorKind = (.+)/.exec(TYPES)?.[1] ?? '').matchAll(/'(\w+)'/g),
].map((m) => m[1])

const isStrings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string')

function checkType(type: string, v: unknown): boolean {
  switch (type) {
    case 'boolean':
    case 'number':
      return typeof v === type
    case 'string[]':
      return isStrings(v)
    case 'string | EntryPointMapping[]':
      return (
        typeof v === 'string' ||
        (Array.isArray(v) &&
          v.every(
            (m) =>
              isObject(m) &&
              Object.keys(m).every((k) => k === 'files' || k === 'use') &&
              typeof m.use === 'string' &&
              (typeof m.files === 'string' || isStrings(m.files)),
          ))
      )
    case 'Record<string, CalleeExtractorKind>':
      return isObject(v) && Object.values(v).every((k) => EXTRACTOR_KINDS.includes(k as string))
    case 'ExtractorExclusions':
      return (
        isObject(v) &&
        Object.entries(v).every(([k, x]) => EXCLUSIONS.get(k) === 'string[]' && isStrings(x))
      )
    default:
      throw new Error(`teach doc-configs.test.ts the PluginSettings type \`${type}\``)
  }
}

/** What's wrong with a `settings.tailwindcss` object, one line per problem. */
function settingsProblems(settings: unknown): string[] {
  if (!isObject(settings)) return ['settings.tailwindcss is not an object']
  return Object.entries(settings).flatMap(([key, v]) => {
    const type = SETTINGS.get(key)
    if (!type) return [`unknown setting "${key}"`]
    return checkType(type, v) ? [] : [`"${key}" is not ${type}: ${JSON.stringify(v)}`]
  })
}

/** Every `settings.tailwindcss` in a config, top level and overrides. */
function tailwindSettings(config: Record<string, unknown>): unknown[] {
  const all = [config, ...(Array.isArray(config.overrides) ? config.overrides : [])]
  return all.flatMap((c) =>
    isObject(c) && isObject(c.settings) && 'tailwindcss' in c.settings
      ? [c.settings.tailwindcss]
      : [],
  )
}

// ── Running the tools ────────────────────────────────────────────────────────

let WORK: string

function run(bin: string, args: string[], cwd: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync(bin, args, {
      cwd,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
      shell: IS_WINDOWS,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, out }
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/** A project for one oxlint document, under `dir`; returns its lint target. */
function oxlintProject(dir: string, doc: Doc): void {
  const file = namedFile(doc) ?? '.oxlintrc.json'
  const config = asOxlintConfig(doc.value)
  const path = join(dir, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(config))
  for (const target of Array.isArray(config.extends) ? config.extends : []) {
    const extended = resolve(dirname(path), String(target))
    if (!existsSync(extended)) writeFileSync(extended, '{}')
  }
  mkdirSync(join(dirname(path), 'src'), { recursive: true })
  writeFileSync(
    join(dirname(path), 'src/a.tsx'),
    'export const A = () => <div className="flex" />\n',
  )
}

/** Whether oxlint loaded the configs under `paths`: JSON out means it did. */
function oxlintLoads(cwd: string, paths = ['.']): { ok: boolean; out: string } {
  const { out } = run(OXLINT, ['-f', 'json', ...paths], cwd)
  try {
    JSON.parse(out)
    return { ok: true, out }
  } catch {
    return { ok: false, out }
  }
}

const OXLINT_DOCS = DOCS_FOUND.filter((d) => kindOf(d) === 'oxlint')
const OXFMT_DOCS = DOCS_FOUND.filter((d) => kindOf(d) === 'oxfmt')
let batch: { ok: boolean; out: string }

beforeAll(() => {
  assertFreshDist()
  WORK = mkdtempSync(resolve(tmpdir(), 'oxtw-doc-configs-'))
  // `jsPlugins: ["oxlint-tailwindcss"]`, resolved the way a project resolves it.
  mkdirSync(join(WORK, 'node_modules'))
  symlinkSync(ROOT, join(WORK, 'node_modules/oxlint-tailwindcss'), 'junction')
  // Each document in its own directory: nested configs, one oxlint process.
  OXLINT_DOCS.forEach((doc, i) => oxlintProject(join(WORK, `d${i}`), doc))
  batch = oxlintLoads(
    WORK,
    OXLINT_DOCS.map((_, i) => `d${i}`),
  )
})

afterAll(() => {
  if (WORK) rmSync(WORK, { recursive: true, force: true })
})

describe('config snippets in the docs', () => {
  it('finds them', () => {
    expect(OXLINT_DOCS.length).toBeGreaterThan(50)
    expect(OXFMT_DOCS.length).toBeGreaterThan(3)
  })

  it('oxlint loads every .oxlintrc.json shown', () => {
    if (batch.ok) return
    // Name the culprits: load each one on its own.
    const failing = OXLINT_DOCS.filter((_, i) => !oxlintLoads(join(WORK, `d${i}`)).ok)
    expect(failing.map((d) => d.source)).toEqual([])
    expect.fail(batch.out)
  })

  it.each(OXLINT_DOCS.map((d) => [d.source, d] as const))(
    'settings.tailwindcss in %s',
    (_, doc) => {
      const config = asOxlintConfig(doc.value)
      expect(tailwindSettings(config).flatMap(settingsProblems)).toEqual([])
    },
  )

  const SORT_KEYS = Object.keys(
    (
      JSON.parse(
        readFileSync(resolve(REPO, 'node_modules/oxfmt/configuration_schema.json'), 'utf8'),
      ).definitions as Record<string, { properties?: Record<string, unknown> }>
    ).SortTailwindcssConfig.properties ?? {},
  )

  it.each(OXFMT_DOCS.map((d) => [d.source, d] as const))('oxfmt loads %s', (_, doc) => {
    const config = doc.value as Record<string, unknown>
    const sorts = [
      config.sortTailwindcss,
      ...(Array.isArray(config.overrides)
        ? config.overrides.map(
            (o: { options?: { sortTailwindcss?: unknown } }) => o.options?.sortTailwindcss,
          )
        : []),
    ].filter(isObject)
    expect(sorts.length).toBeGreaterThan(0)
    for (const sort of sorts) {
      expect(Object.keys(sort).filter((k) => !SORT_KEYS.includes(k))).toEqual([])
    }
    const dir = mkdtempSync(join(WORK, 'oxfmt-'))
    writeFileSync(join(dir, '.oxfmtrc.json'), JSON.stringify(config))
    writeFileSync(join(dir, 'a.tsx'), 'export const A = () => <div className="flex" />;\n')
    const { out } = run(OXFMT, ['--check', 'a.tsx'], dir)
    expect(out).not.toContain('Failed to parse configuration')
  })
})
