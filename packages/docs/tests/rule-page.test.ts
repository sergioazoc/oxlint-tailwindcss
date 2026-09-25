import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  atAGlance,
  designSystemUse,
  parseFrontmatter,
  plainText,
  renderRulePage,
  ruleTitle,
  type RuleMeta,
} from '../scripts/rule-page.ts'
import { RULE_NAMES, oxlintPlugin } from '../scripts/rules.ts'

const DOCS = resolve(__dirname, '..')

const DS_RULE: RuleMeta = {
  fixable: 'code',
  hasSuggestions: true,
  schema: [
    { type: 'object', properties: { entryPoint: { type: 'string' }, mode: { type: 'string' } } },
  ],
  messages: { designSystemUnavailable: '{{message}}', unsorted: 'x' },
}
const OPTIONAL_RULE: RuleMeta = {
  schema: [
    { type: 'object', properties: { variants: { type: 'array' }, entryPoint: { type: 'string' } } },
  ],
  messages: { missing: 'x' },
}
const PLAIN_RULE: RuleMeta = { messages: { duplicate: 'x' } }

const extras = (description: string, body = '## What this rule does\n\nIt does things.\n') =>
  `---\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`

describe('parseFrontmatter', () => {
  it('reads JSON-quoted values, colons and quotes included', () => {
    const { data, body } = parseFrontmatter('---\ndescription: "a `dark:` \\"b\\""\n---\n\n# Hi\n')
    expect(data.description).toBe('a `dark:` "b"')
    expect(body).toBe('\n# Hi\n')
  })

  it('reads plain values, folded over indented lines as oxfmt wraps them', () => {
    const md =
      '---\ntitle: Vue, Svelte & Astro\ndescription:\n  Which parts of .vue files\n  are checked.\n---\nbody'
    expect(parseFrontmatter(md).data).toEqual({
      title: 'Vue, Svelte & Astro',
      description: 'Which parts of .vue files are checked.',
    })
  })

  it('leaves a file without frontmatter alone', () => {
    expect(parseFrontmatter('# Title\n')).toEqual({ data: {}, body: '# Title\n' })
  })
})

describe('designSystemUse', () => {
  it('required: the rule declares designSystemUnavailable', () => {
    expect(designSystemUse(DS_RULE)).toBe('required')
  })
  it('optional: it takes an entryPoint but cannot fail without one', () => {
    expect(designSystemUse(OPTIONAL_RULE)).toBe('optional')
  })
  it('none: no entryPoint, no designSystemUnavailable', () => {
    expect(designSystemUse(PLAIN_RULE)).toBe('none')
  })

  it('agrees with the rules/index.md groups for every real rule', () => {
    const index = readFileSync(resolve(DOCS, 'rules/index.md'), 'utf8')
    const reference = index.slice(index.indexOf('## Defaults reference'))
    const [dependent, optional, independent] = reference
      .split(/\n### /)
      .slice(1)
      .map((table) => [...table.matchAll(/^\| `([a-z-]+)`/gm)].map((m) => m[1]))
    for (const name of RULE_NAMES) {
      const use = designSystemUse(oxlintPlugin.rules[name].meta ?? {})
      const group = dependent.includes(name)
        ? 'required'
        : optional.includes(name)
          ? 'optional'
          : 'none'
      expect(independent.includes(name) || group !== 'none', name).toBe(true)
      expect(use, name).toBe(group)
    }
  })
})

describe('atAGlance', () => {
  it('derives every cell from meta, in each locale', () => {
    expect(atAGlance(DS_RULE, 'en')).toContain(
      '| Yes | Yes | Required (`entryPoint`) | `entryPoint`, `mode` |',
    )
    expect(atAGlance(PLAIN_RULE, 'en')).toContain('| No | No | Not used | None |')
    expect(atAGlance(OPTIONAL_RULE, 'es')).toContain(
      '| No | No | Opcional — se usa si hay `entryPoint` | `variants`, `entryPoint` |',
    )
    expect(atAGlance(PLAIN_RULE, 'es')).toMatch(/^## De un vistazo/)
  })
})

describe('renderRulePage', () => {
  const page = renderRulePage({
    name: 'no-thing',
    meta: DS_RULE,
    extras: extras('oxlint rule that reports `dark:` things.'),
    locale: 'en',
  })

  it('writes the title and a plain-text description into the frontmatter', () => {
    const { data } = parseFrontmatter(page)
    expect(data.title).toBe(ruleTitle('no-thing', 'en'))
    expect(data.description).toBe('oxlint rule that reports dark: things.')
  })

  it('opens with the description as written, then the glance table, then the body', () => {
    const { body } = parseFrontmatter(page)
    expect(body.indexOf('# no-thing')).toBeLessThan(body.indexOf('reports `dark:` things.'))
    expect(body.indexOf('reports `dark:` things.')).toBeLessThan(body.indexOf('## At a glance'))
    expect(body.indexOf('## At a glance')).toBeLessThan(body.indexOf('## What this rule does'))
    expect(body).not.toContain('description:')
  })

  it('titles pages per locale', () => {
    expect(ruleTitle('x', 'en')).toBe('x — Tailwind CSS lint rule')
    expect(ruleTitle('x', 'es')).toBe('x — regla de lint para Tailwind CSS')
  })

  it('refuses a missing or overlong description', () => {
    expect(() =>
      renderRulePage({ name: 'a', meta: PLAIN_RULE, extras: '## Body\n', locale: 'es' }),
    ).toThrow(/no `description`/)
    expect(() =>
      renderRulePage({
        name: 'a',
        meta: PLAIN_RULE,
        extras: extras('x'.repeat(161)),
        locale: 'en',
      }),
    ).toThrow(/161 characters/)
    // The limit applies to what search engines show: inline-code marks don't count.
    expect(() =>
      renderRulePage({
        name: 'a',
        meta: PLAIN_RULE,
        extras: extras(`\`${'x'.repeat(160)}\``),
        locale: 'en',
      }),
    ).not.toThrow()
  })

  it('plainText drops inline-code marks only', () => {
    expect(plainText('like `flex flex` and `p-[2px]`')).toBe('like flex flex and p-[2px]')
  })
})

describe('the generated pages on disk', () => {
  it.each(RULE_NAMES.flatMap((n) => [[n, 'en'] as const, [n, 'es'] as const]))(
    '%s (%s) is what the generator renders',
    (name, locale) => {
      const dir = resolve(DOCS, locale === 'es' ? 'es' : '', 'rules')
      const onDisk = readFileSync(resolve(dir, `${name}.md`), 'utf8')
      const rendered = renderRulePage({
        name,
        meta: oxlintPlugin.rules[name].meta ?? {},
        extras: readFileSync(resolve(dir, '_extras', `${name}.md`), 'utf8'),
        locale,
      })
      // oxfmt re-wraps prose after generating; compare with whitespace collapsed.
      const squash = (s: string) =>
        s
          .replace(/\s+/g, ' ')
          .replace(/\| -+ /g, '| --- ')
          .replace(/ +\|/g, ' |')
      expect(squash(parseFrontmatter(onDisk).data.description)).toBe(
        squash(parseFrontmatter(rendered).data.description),
      )
      expect(parseFrontmatter(onDisk).data.title).toBe(ruleTitle(name, locale))
    },
  )
})
