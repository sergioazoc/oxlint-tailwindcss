/**
 * The agent skill, `skills/oxlint-tailwindcss/SKILL.md` — what an agent reads
 * instead of the docs (`npx skills add sergioazoc/oxlint-tailwindcss --skill
 * oxlint-tailwindcss`), so it must say what they say. Its config runs with the
 * real oxlint (doc-configs.test.ts), its floors and callee count are the code's
 * (docs-sync.test.ts), and its recommended config is the generated one
 * (packages/docs/tests/blocks.test.ts); this holds the rest.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import plugin from '../../src/index'
import { DOCS_URL } from '../../src/utils/rule-docs'

const REPO = resolve(__dirname, '../../../..')
const DIR = join(REPO, 'skills/oxlint-tailwindcss')
const SKILL = readFileSync(join(DIR, 'SKILL.md'), 'utf8')
const RULES = new Set(Object.keys(plugin.rules))

const frontmatter = Object.fromEntries(
  (/^---\n([\s\S]*?)\n---\n/.exec(SKILL)?.[1] ?? '')
    .split('\n')
    .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]),
)

describe('the agent skill', () => {
  it('is named after its directory, and says when to use it in one line', () => {
    expect(frontmatter.name).toBe('oxlint-tailwindcss')
    expect(frontmatter.description.length).toBeGreaterThan(40)
    // The skills spec caps it at 1024 characters.
    expect(frontmatter.description.length).toBeLessThanOrEqual(1024)
    expect(frontmatter.description).toMatch(/Use when/)
  })

  it('names only rules that exist', () => {
    const table = SKILL.slice(SKILL.search(/\| Diagnostic +\|/), SKILL.indexOf('## Fix with'))
    const named = [...table.matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)].map((m) => m[1])
    expect(named.length).toBeGreaterThan(8)
    expect(named.filter((r) => !RULES.has(r))).toEqual([])
    for (const m of SKILL.matchAll(/tailwindcss\/([a-z-]+)/g)) {
      if (m[1] !== '') expect(RULES.has(m[1]) || m[1] === 'rule', m[0]).toBe(true)
    }
  })

  it('links docs pages that exist, as their markdown copies', () => {
    const links = [...SKILL.matchAll(/https:\/\/oxlint-tailwindcss\.pages\.dev\/([\w/-]+)\.md/g)]
    expect(links.length).toBeGreaterThan(5)
    expect(SKILL).toContain(DOCS_URL)
    for (const [url, path] of links) {
      expect(existsSync(join(REPO, 'packages/docs', `${path}.md`)), url).toBe(true)
    }
  })

  it('quotes the no-unknown-classes suggestion as the rule words it', () => {
    const messages = Object.values(plugin.rules['no-unknown-classes'].meta?.messages ?? {})
    expect(SKILL).toContain('Did you mean …?')
    expect(messages.some((m) => m.includes('Did you mean'))).toBe(true)
  })
})
