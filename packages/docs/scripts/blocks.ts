/**
 * Blocks of the docs and READMEs generated from each rule's `meta.docs` — the
 * recommended configs and the rule list by category — so they can't drift from
 * the rules or from each other. Pure; `generate-blocks.ts` writes them between
 * `<!-- generated:<id> -->` / `<!-- /generated:<id> -->` markers.
 */

export type Locale = 'en' | 'es'
type Category = 'correctness' | 'design-system' | 'modernization' | 'consistency'

export interface RuleForBlocks {
  name: string
  category: Category
  recommended: 'error' | 'warn' | false
  experimental?: boolean
}

export const CATEGORY_ORDER: readonly Category[] = [
  'correctness',
  'modernization',
  'consistency',
  'design-system',
]

export const CATEGORY_LABEL: Record<Locale, Record<Category, string>> = {
  en: {
    correctness: 'Correctness',
    modernization: 'Modernization',
    consistency: 'Consistency',
    'design-system': 'Design-system guardrails',
  },
  es: {
    correctness: 'Corrección',
    modernization: 'Modernización',
    consistency: 'Consistencia',
    'design-system': 'Protección del design system',
  },
}

/** Rules of one category, by name. */
function inCategory(rules: readonly RuleForBlocks[], category: Category): RuleForBlocks[] {
  return rules.filter((r) => r.category === category).sort((a, b) => a.name.localeCompare(b.name))
}

export interface ConfigOptions {
  locale: Locale
  /** Every rule (`"off"` when not recommended), or only the recommended ones. */
  all: boolean
  /** Include `"$schema"` (the docs do; the README keeps it short). */
  schema?: boolean
}

/** A `.oxlintrc.json`, as a jsonc code fence, grouped by category. */
export function recommendedConfig(rules: readonly RuleForBlocks[], options: ConfigOptions): string {
  const lines: string[] = []
  for (const category of CATEGORY_ORDER) {
    const group = inCategory(rules, category).filter((r) => options.all || r.recommended)
    if (group.length === 0) continue
    lines.push(`    // ${CATEGORY_LABEL[options.locale][category]}`)
    for (const r of group) lines.push(`    "tailwindcss/${r.name}": "${r.recommended || 'off'}",`)
  }
  // No trailing comma after the last rule: the block is valid JSON-with-comments.
  const last = lines.length - 1
  lines[last] = lines[last].replace(/,$/, '')
  return [
    '```jsonc',
    '{',
    ...(options.schema ? ['  "$schema": "./node_modules/oxlint/configuration_schema.json",'] : []),
    '  "jsPlugins": ["oxlint-tailwindcss"],',
    '  "settings": {',
    '    "tailwindcss": {',
    '      "entryPoint": "src/styles.css"',
    '    }',
    '  },',
    '  "rules": {',
    ...lines,
    '  }',
    '}',
    '```',
  ].join('\n')
}

/** `**Correctness** — `a` · `b`` paragraphs, one per category. */
export function ruleList(rules: readonly RuleForBlocks[], locale: Locale): string {
  return CATEGORY_ORDER.map(
    (category) =>
      `**${CATEGORY_LABEL[locale][category]}** — ${inCategory(rules, category)
        .map((r) => `\`${r.name}\`${r.experimental ? ' (experimental)' : ''}`)
        .join(' · ')}`,
  ).join('\n\n')
}

/** Replace the content between a block's markers; throws when they're missing. */
export function replaceBlock(text: string, id: string, content: string): string {
  const open = `<!-- generated:${id} -->`
  const close = `<!-- /generated:${id} -->`
  const start = text.indexOf(open)
  const end = text.indexOf(close)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`missing <!-- generated:${id} --> … <!-- /generated:${id} --> markers`)
  }
  return `${text.slice(0, start + open.length)}\n${content}\n${text.slice(end)}`
}

// ── /shadcn: data/shadcn-lint.json ──────────────────────────────────────────

export interface ShadcnConcern {
  id: string
  label: Record<Locale, string>
  examples: string[]
  shadcn: string[]
  ours: string[]
  /** Who reports it under the combined config. */
  use: 'ours' | 'shadcn' | 'both'
}

export interface ShadcnData {
  shadcnLint: string
  concerns: ShadcnConcern[]
  combined: {
    ours: { off: string[]; on: Record<string, string> }
    shadcn: Record<string, unknown>
    componentsDir: string
  }
}

const SHADCN_TABLE: Record<
  Locale,
  { head: string[]; use: Record<ShadcnConcern['use'], string>; none: string }
> = {
  en: {
    head: ['What', 'Example', '@shadcn/lint', 'oxlint-tailwindcss', 'Combined config'],
    use: { ours: 'oxlint-tailwindcss', shadcn: '@shadcn/lint', both: 'both' },
    none: '—',
  },
  es: {
    head: ['Qué', 'Ejemplo', '@shadcn/lint', 'oxlint-tailwindcss', 'Config combinada'],
    use: { ours: 'oxlint-tailwindcss', shadcn: '@shadcn/lint', both: 'las dos' },
    none: '—',
  },
}

/**
 * A table cell holding code: backticks, with `|` escaped for the table, and
 * `v-pre` around it when it holds `{{`, which VitePress would read as Vue.
 */
function code(text: string): string {
  const cell = `\`${text.replaceAll('|', '\\|')}\``
  return text.includes('{{') ? `<span v-pre>${cell}</span>` : cell
}

/** Who reports what: one row per concern, its first example, each tool's rules. */
export function shadcnTable(data: ShadcnData, locale: Locale): string {
  const t = SHADCN_TABLE[locale]
  const rules = (list: string[]) => (list.length ? list.map(code).join(', ') : t.none)
  const rows = data.concerns.map((c) =>
    [c.label[locale], code(c.examples[0]), rules(c.shadcn), rules(c.ours), t.use[c.use]].join(
      ' | ',
    ),
  )
  return [
    `| ${t.head.join(' | ')} |`,
    `| ${t.head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r} |`),
  ].join('\n')
}

const SHADCN_CONFIG_LABEL: Record<Locale, { ours: string; shadcn: string }> = {
  en: {
    ours: 'oxlint-tailwindcss: the recommended rules, adjusted for shadcn/ui',
    shadcn: '@shadcn/lint',
  },
  es: {
    ours: 'oxlint-tailwindcss: las reglas recomendadas, ajustadas para shadcn/ui',
    shadcn: '@shadcn/lint',
  },
}

/** JSON on one line, spaced the way the docs write it: `["error", { "allow": ["layout"] }]`. */
function inlineJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inlineJson(v)}`)
    return `{ ${entries.join(', ')} }`
  }
  return JSON.stringify(value)
}

/** The `.oxlintrc.json` that runs both plugins, each problem reported by one of them. */
export function shadcnConfig(
  data: ShadcnData,
  rules: readonly RuleForBlocks[],
  locale: Locale,
): string {
  const off = new Set(data.combined.ours.off)
  const ours: [string, string][] = []
  for (const category of CATEGORY_ORDER) {
    for (const r of inCategory(rules, category)) {
      const severity = data.combined.ours.on[r.name] ?? (off.has(r.name) ? false : r.recommended)
      if (severity) ours.push([r.name, severity])
    }
  }
  const lines = [
    `    // ${SHADCN_CONFIG_LABEL[locale].ours}`,
    ...ours.map(([name, severity]) => `    "tailwindcss/${name}": "${severity}",`),
    `    // ${SHADCN_CONFIG_LABEL[locale].shadcn}`,
    ...Object.entries(data.combined.shadcn).map(
      ([name, value]) => `    "shadcn/${name}": ${inlineJson(value)},`,
    ),
  ]
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '')
  return [
    '```jsonc',
    '{',
    '  "$schema": "./node_modules/oxlint/configuration_schema.json",',
    '  "jsPlugins": ["oxlint-tailwindcss", "@shadcn/lint"],',
    '  "settings": {',
    '    "tailwindcss": {',
    '      "entryPoint": "app/globals.css"',
    '    }',
    '  },',
    '  "rules": {',
    ...lines,
    '  },',
    '  "overrides": [',
    '    {',
    `      "files": ["${data.combined.componentsDir}"],`,
    '      "rules": { "shadcn/no-restyle": "off" }',
    '    }',
    '  ]',
    '}',
    '```',
  ].join('\n')
}

// ── /migration/from-better-tailwindcss: data/better-tailwindcss.json ────────

export interface BtwData {
  betterTailwindcss: string
  rules: {
    theirs: string
    ours: string
    example: string
    options?: { theirs: unknown; ours: unknown }
    notes?: Record<Locale, string>
  }[]
  settings: { theirs: string; ours: string | null; notes?: Record<Locale, string> }[]
}

const BTW_HEAD: Record<Locale, { rules: string[]; settings: string[] }> = {
  en: {
    rules: ['better-tailwindcss', 'oxlint-tailwindcss', 'Notes'],
    settings: ['`settings["better-tailwindcss"]`', '`settings.tailwindcss`', 'Notes'],
  },
  es: {
    rules: ['better-tailwindcss', 'oxlint-tailwindcss', 'Notas'],
    settings: ['`settings["better-tailwindcss"]`', '`settings.tailwindcss`', 'Notas'],
  },
}

function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n')
}

/** Each of their rules, the rule it maps to (linked), and what differs. */
export function btwRulesTable(data: BtwData, locale: Locale): string {
  const base = locale === 'en' ? '/rules/' : '/es/rules/'
  return table(
    BTW_HEAD[locale].rules,
    data.rules.map((r) => [
      `\`${r.theirs}\``,
      `[\`${r.ours}\`](${base}${r.ours})`,
      r.notes?.[locale] ?? '',
    ]),
  )
}

/** Each of their settings, the setting(s) it maps to, and what differs. */
export function btwSettingsTable(data: BtwData, locale: Locale): string {
  return table(
    BTW_HEAD[locale].settings,
    data.settings.map((s) => [
      `\`${s.theirs}\``,
      s.ours === null
        ? '—'
        : s.ours
            .split(', ')
            .map((k) => `\`${k}\``)
            .join(', '),
      s.notes?.[locale] ?? '',
    ]),
  )
}

/** The rules no row maps to, linked: `[a](/rules/a) · [b](/rules/b)`. */
export function btwExtraRules(data: BtwData, ruleNames: readonly string[], locale: Locale): string {
  const mapped = new Set(data.rules.map((r) => r.ours))
  const base = locale === 'en' ? '/rules/' : '/es/rules/'
  return ruleNames
    .filter((name) => !mapped.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `[\`${name}\`](${base}${name})`)
    .join(' · ')
}
