import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  btwExtraRules,
  btwRulesTable,
  btwSettingsTable,
  recommendedConfig,
  replaceBlock,
  ruleList,
  shadcnConfig,
  shadcnTable,
  type BtwData,
  type RuleForBlocks,
  type ShadcnData,
} from '../scripts/blocks.ts'
import { RULE_NAMES, oxlintPlugin } from '../scripts/rules.ts'

const RULES: RuleForBlocks[] = RULE_NAMES.map((name) => {
  const docs = oxlintPlugin.rules[name].meta?.docs as Omit<RuleForBlocks, 'name'>
  return {
    name,
    category: docs.category,
    recommended: docs.recommended,
    experimental: docs.experimental,
  }
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

  it('marks an experimental rule', () => {
    const rules: RuleForBlocks[] = [
      { name: 'a', category: 'design-system', recommended: false, experimental: true },
      { name: 'b', category: 'design-system', recommended: false },
    ]
    expect(ruleList(rules, 'en')).toContain('`a` (experimental) · `b`')
    expect(ruleList(rules, 'es')).toContain('`a` (experimental) · `b`')
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

describe('/shadcn blocks', () => {
  const DATA = JSON.parse(
    readFileSync(resolve(__dirname, '../data/shadcn-lint.json'), 'utf8'),
  ) as ShadcnData

  it('the table has a row per concern, in each locale', () => {
    for (const locale of ['en', 'es'] as const) {
      const rows = shadcnTable(DATA, locale).split('\n')
      expect(rows).toHaveLength(DATA.concerns.length + 2)
      expect(rows[2]).toContain(DATA.concerns[0].label[locale])
    }
    expect(shadcnTable(DATA, 'es')).toContain('| las dos |')
  })

  it('escapes a | inside code so it stays one cell', () => {
    const data = { ...DATA, concerns: [{ ...DATA.concerns[0], examples: ['a || b'] }] }
    expect(shadcnTable(data, 'en')).toContain('`a \\|\\| b`')
  })

  it('the combined config: recommended, minus off, plus on, plus @shadcn/lint', () => {
    const fence = shadcnConfig(DATA, RULES, 'en')
    const config = JSON.parse(
      fence
        .replace(/^```jsonc\n|\n```$/g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n'),
    ) as { rules: Record<string, unknown>; jsPlugins: string[]; overrides: unknown[] }
    const expected: Record<string, unknown> = {}
    for (const r of RULES) {
      const severity =
        DATA.combined.ours.on[r.name] ??
        (DATA.combined.ours.off.includes(r.name) ? false : r.recommended)
      if (severity) expected[`tailwindcss/${r.name}`] = severity
    }
    for (const [name, value] of Object.entries(DATA.combined.shadcn)) {
      expected[`shadcn/${name}`] = value
    }
    expect(config.rules).toEqual(expected)
    expect(config.jsPlugins).toEqual(['oxlint-tailwindcss', '@shadcn/lint'])
    expect(config.overrides).toEqual([
      { files: [DATA.combined.componentsDir], rules: { 'shadcn/no-restyle': 'off' } },
    ])
    expect(fence).toContain('"shadcn/no-restyle": ["error", { "allow": ["layout"] }]')
  })
})

describe('/shadcn table cells', () => {
  it("keeps {{ away from Vue's template compiler", () => {
    const data = JSON.parse(
      readFileSync(resolve(__dirname, '../data/shadcn-lint.json'), 'utf8'),
    ) as ShadcnData
    const one = {
      ...data,
      concerns: [{ ...data.concerns[0], examples: ['<a style={{ a: 1 }} />'] }],
    }
    expect(shadcnTable(one, 'en')).toContain('<span v-pre>`<a style={{ a: 1 }} />`</span>')
    expect(shadcnTable(data, 'en')).toContain('| `<div className="bg-red-500">Sale</div>` |')
  })
})

describe('/migration/from-better-tailwindcss blocks', () => {
  const DATA = JSON.parse(
    readFileSync(resolve(__dirname, '../data/better-tailwindcss.json'), 'utf8'),
  ) as BtwData

  it('a row per rule, linked to the rule page of each locale', () => {
    const en = btwRulesTable(DATA, 'en').split('\n')
    expect(en).toHaveLength(DATA.rules.length + 2)
    expect(en[2]).toContain(`[\`${DATA.rules[0].ours}\`](/rules/${DATA.rules[0].ours})`)
    expect(btwRulesTable(DATA, 'es')).toContain(`(/es/rules/${DATA.rules[0].ours})`)
  })

  it('settings: several targets as code, none as a dash', () => {
    const table = btwSettingsTable(DATA, 'en')
    expect(table).toContain('| `tsconfig` | — |')
    expect(table).toContain('`attributes`, `attributePatterns`')
  })

  it('lists the rules no row maps to, and only those', () => {
    const extra = btwExtraRules(DATA, RULE_NAMES, 'en')
    const listed = [...extra.matchAll(/\[`([^`]+)`\]/g)].map((m) => m[1])
    const mapped = new Set(DATA.rules.map((r) => r.ours))
    expect(listed).toEqual(RULE_NAMES.filter((r) => !mapped.has(r)).sort())
    expect(listed).toContain('enforce-physical')
  })
})
