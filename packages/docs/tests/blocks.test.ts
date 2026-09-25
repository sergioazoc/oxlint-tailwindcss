import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { recommendedConfig, replaceBlock, ruleList, type RuleForBlocks } from '../scripts/blocks.ts'
import { RULE_NAMES, oxlintPlugin } from '../scripts/rules.ts'

const RULES: RuleForBlocks[] = RULE_NAMES.map((name) => {
  const docs = oxlintPlugin.rules[name].meta?.docs as Omit<RuleForBlocks, 'name'>
  return { name, category: docs.category, recommended: docs.recommended }
})

/** The jsonc fence → the parsed config (comments stripped). */
const parse = (fence: string) =>
  JSON.parse(
    fence
      .replace(/^```jsonc\n|\n```$/g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n'),
  ) as { rules: Record<string, string>; $schema?: string }

describe('recommendedConfig', () => {
  it('only the recommended rules, at their severity', () => {
    const { rules } = parse(recommendedConfig(RULES, { locale: 'en', all: false }))
    const expected = Object.fromEntries(
      RULES.filter((r) => r.recommended).map((r) => [`tailwindcss/${r.name}`, r.recommended]),
    )
    expect(rules).toEqual(expected)
    expect(Object.values(rules)).not.toContain('off')
  })

  it('every rule, "off" for the opt-in ones', () => {
    const { rules } = parse(recommendedConfig(RULES, { locale: 'en', all: true }))
    expect(Object.keys(rules).sort()).toEqual(RULES.map((r) => `tailwindcss/${r.name}`).sort())
    expect(rules['tailwindcss/enforce-logical']).toBe('off')
  })

  it('groups by category with localized headings, and optionally names the schema', () => {
    const es = recommendedConfig(RULES, { locale: 'es', all: false, schema: true })
    expect(es).toContain('// Corrección')
    expect(es.indexOf('// Corrección')).toBeLessThan(es.indexOf('// Modernización'))
    expect(parse(es).$schema).toBe('./node_modules/oxlint/configuration_schema.json')
  })
})

describe('ruleList', () => {
  it('names every rule once, under its category', () => {
    const list = ruleList(RULES, 'en')
    for (const r of RULES) expect(list.split(`\`${r.name}\``).length - 1, r.name).toBe(1)
    expect(list.split('\n\n')).toHaveLength(4)
  })
})

describe('replaceBlock', () => {
  it('replaces between the markers and keeps them', () => {
    const text = 'a\n<!-- generated:x -->\nold\n<!-- /generated:x -->\nb'
    expect(replaceBlock(text, 'x', 'new')).toBe(
      'a\n<!-- generated:x -->\nnew\n<!-- /generated:x -->\nb',
    )
  })
  it('refuses a file without them', () => {
    expect(() => replaceBlock('nothing', 'x', 'new')).toThrow(/missing/)
  })
})

describe('the committed files hold the current blocks', () => {
  // `pnpm -C packages/docs generate` writes them; formatting can re-wrap prose,
  // so compare what a reader gets: the config's rules, the list's rule names.
  const REPO = resolve(__dirname, '../../..')
  const between = (path: string, id: string) => {
    const text = readFileSync(resolve(REPO, path), 'utf8')
    return text.slice(
      text.indexOf(`<!-- generated:${id} -->`),
      text.indexOf(`<!-- /generated:${id} -->`),
    )
  }
  it.each([
    ['packages/oxlint-tailwindcss/README.md', 'full-config', true],
    ['packages/docs/setup.md', 'recommended-config', false],
    ['packages/docs/es/setup.md', 'recommended-config', false],
  ] as const)('%s', (path, id, all) => {
    const block = between(path, id)
    const fence = block.slice(block.indexOf('```jsonc'), block.lastIndexOf('```') + 3)
    expect(parse(fence).rules).toEqual(parse(recommendedConfig(RULES, { locale: 'en', all })).rules)
  })
})
