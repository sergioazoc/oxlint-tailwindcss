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
        .map((r) => `\`${r.name}\``)
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
