/**
 * Rendering of one rule page, as pure functions — no file system, no plugin
 * import — so it can be tested with hand-built metadata.
 *
 * A rule page is: the page's frontmatter (title + description, for search
 * engines and link previews), the rule name, a one-sentence definition, an "At
 * a glance" table derived from `meta`, and the hand-written body from
 * `rules/_extras/<rule>.md`. The `_extras` file owns the prose and the
 * description (in its own frontmatter, per locale); the generator owns
 * everything derived from code.
 */

export type Locale = 'en' | 'es'

export interface RuleMeta {
  type?: string
  docs?: { description?: string; experimental?: boolean }
  fixable?: 'code' | 'whitespace'
  hasSuggestions?: boolean
  schema?: unknown
  defaultOptions?: unknown[]
  messages?: Record<string, string>
}

/** The messageId a rule declares when it can't run without the design system. */
const DS_UNAVAILABLE = 'designSystemUnavailable'

/** Search engines cut descriptions around here. */
export const MAX_DESCRIPTION = 160

/**
 * The frontmatter this site uses: flat `key: value` pairs, where a value is
 * either a JSON-quoted string on one line, or plain text — on the key's line
 * or indented on the lines below it (a folded scalar, as oxfmt wraps it).
 */
export function parseFrontmatter(md: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)
  if (!match) return { data: {}, body: md }
  const data: Record<string, string> = {}
  let key: string | null = null
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (pair) {
      key = pair[1]
      const value = pair[2].trim()
      data[key] = value.startsWith('"') ? (JSON.parse(value) as string) : value
    } else if (key && /^\s+\S/.test(line)) {
      data[key] = `${data[key]} ${line.trim()}`.trim()
    }
  }
  return { data, body: md.slice(match[0].length) }
}

/** A YAML-safe scalar for any string: JSON strings are valid YAML. */
const yamlString = (value: string) => JSON.stringify(value)

export function ruleTitle(name: string, locale: Locale): string {
  return locale === 'es'
    ? `${name} — regla de lint para Tailwind CSS`
    : `${name} — Tailwind CSS lint rule`
}

export type DesignSystemUse = 'required' | 'optional' | 'none'

/**
 * How a rule uses the design system. `required`: it may report
 * `designSystemUnavailable`, which oxlint only allows for a declared
 * messageId. `optional`: it accepts a per-rule `entryPoint` without being
 * able to fail on it — only the rules that consult the design system take one.
 */
export function designSystemUse(meta: RuleMeta): DesignSystemUse {
  if (meta.messages && DS_UNAVAILABLE in meta.messages) return 'required'
  return optionKeys(meta).includes('entryPoint') ? 'optional' : 'none'
}

export function optionKeys(meta: RuleMeta): string[] {
  const schema = meta.schema as { properties?: Record<string, unknown> }[] | undefined
  return Object.keys(Array.isArray(schema) ? (schema[0]?.properties ?? {}) : {})
}

const GLANCE = {
  en: {
    heading: '## At a glance',
    columns: ['Autofix', 'Editor suggestions', 'Design system', 'Options'],
    yes: 'Yes',
    no: 'No',
    ds: {
      required: 'Required (`entryPoint`)',
      optional: 'Optional — used when `entryPoint` is set',
      none: 'Not used',
    },
    none: 'None',
  },
  es: {
    heading: '## De un vistazo',
    columns: ['Autofix', 'Sugerencias en el editor', 'Design system', 'Opciones'],
    yes: 'Sí',
    no: 'No',
    ds: {
      required: 'Obligatorio (`entryPoint`)',
      optional: 'Opcional — se usa si hay `entryPoint`',
      none: 'No se usa',
    },
    none: 'Ninguna',
  },
} as const

export function atAGlance(meta: RuleMeta, locale: Locale): string {
  const t = GLANCE[locale]
  const keys = optionKeys(meta)
  const cells = [
    meta.fixable ? t.yes : t.no,
    meta.hasSuggestions ? t.yes : t.no,
    t.ds[designSystemUse(meta)],
    keys.length > 0 ? keys.map((k) => `\`${k}\``).join(', ') : t.none,
  ]
  return [
    t.heading,
    '',
    `| ${t.columns.join(' | ')} |`,
    `| ${t.columns.map(() => '---').join(' | ')} |`,
    `| ${cells.join(' | ')} |`,
  ].join('\n')
}

/**
 * Under an experimental rule's description: what "experimental" promises. The
 * opener, body and closer are separate paragraphs, or oxfmt reflows them into
 * one and the container never opens (tests/docs/markdown-containers.test.ts).
 */
const EXPERIMENTAL = {
  en: [
    '::: warning Experimental',
    '',
    'Its heuristics may still change in a minor release, adding or removing reports. It is off in the recommended config.',
    '',
    ':::',
  ],
  es: [
    '::: warning Experimental',
    '',
    'Sus heurísticas aún pueden cambiar en una versión minor, agregando o quitando reportes. Viene apagada en la config recomendada.',
    '',
    ':::',
  ],
} as const

export interface RulePageInput {
  name: string
  meta: RuleMeta
  /** The `_extras/<rule>.md` file for this locale, frontmatter included. */
  extras: string
  locale: Locale
}

/**
 * Markdown inline code → plain text, for a `<meta>` description: backticks
 * would show up literally in a search result.
 */
export const plainText = (markdown: string) => markdown.replace(/`([^`]*)`/g, '$1')

/**
 * The whole page. Throws when the `_extras` file has no usable description:
 * every rule page ships one, in each locale, within search-engine length. The
 * description may use inline code — the page's first paragraph keeps it, the
 * `<meta>` description gets the plain text.
 */
export function renderRulePage({ name, meta, extras, locale }: RulePageInput): string {
  const { data, body } = parseFrontmatter(extras)
  const lede = data.description?.trim()
  if (!lede) {
    throw new Error(`${locale} rules/_extras/${name}.md has no \`description\` in its frontmatter`)
  }
  const description = plainText(lede)
  if (description.length > MAX_DESCRIPTION) {
    throw new Error(
      `${locale} rules/_extras/${name}.md: description is ${description.length} characters (max ${MAX_DESCRIPTION})`,
    )
  }
  return [
    '---',
    `title: ${yamlString(ruleTitle(name, locale))}`,
    `description: ${yamlString(description)}`,
    '---',
    '',
    `# ${name}`,
    '',
    lede,
    '',
    ...(meta.docs?.experimental ? [...EXPERIMENTAL[locale], ''] : []),
    atAGlance(meta, locale),
    '',
    body.trim(),
    '',
  ].join('\n')
}
