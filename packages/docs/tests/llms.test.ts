import { describe, expect, it } from 'vitest'
import { SITE_URL } from '../.vitepress/seo.ts'
import { buildLlmsFull, buildLlmsTxt, markdownCopy, type DocPage } from '../scripts/llms.ts'

const page = (path: string, title: string, body = `# ${title}\n\nBody of ${path}.\n`): DocPage => ({
  path,
  title,
  description: `About ${path}, with \`code\`.`,
  body,
})

const PAGES = [
  page('index.md', 'Home', ''),
  page('setup.md', 'Setup'),
  page('rules/index.md', 'Rules'),
  page('rules/no-unknown-classes.md', 'no-unknown-classes — Tailwind CSS lint rule'),
  page('rules/enforce-canonical.md', 'enforce-canonical — Tailwind CSS lint rule'),
  page('es/index.md', 'Inicio', ''),
  page('es/setup.md', 'Instalación'),
]

describe('llms.txt', () => {
  const txt = buildLlmsTxt(PAGES, 'The summary.')

  it('follows llmstxt.org: H1, a blockquote summary, then link sections', () => {
    const lines = txt.split('\n')
    expect(lines[0]).toBe('# oxlint-tailwindcss')
    expect(lines[2]).toBe('> The summary.')
    expect(txt.match(/^## .+$/gm)).toEqual(['## Docs', '## Rules', '## Optional'])
  })

  it('links every English page once, at its markdown copy, with a plain-text description', () => {
    for (const p of PAGES.filter((p) => !p.path.startsWith('es/'))) {
      expect(txt.split(`](${SITE_URL}/${p.path})`).length - 1, p.path).toBe(1)
    }
    expect(txt).toContain(`- [Setup](${SITE_URL}/setup.md): About setup.md, with code.`)
  })

  it('lists rules by name, sorted, and guides home-first', () => {
    const rules = txt.slice(txt.indexOf('## Rules'), txt.indexOf('## Optional'))
    expect([...rules.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1])).toEqual([
      'enforce-canonical',
      'no-unknown-classes',
    ])
    const docs = txt.slice(txt.indexOf('## Docs'), txt.indexOf('## Rules'))
    expect([...docs.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1])).toEqual([
      'Home',
      'Setup',
      'Rules',
    ])
  })

  it('keeps Spanish pages out, except a pointer to the Spanish docs', () => {
    expect(txt).not.toContain('/es/setup.md')
    expect(txt).toContain(`(${SITE_URL}/es/index.md)`)
  })
})

describe('llms-full.txt', () => {
  const full = buildLlmsFull(PAGES, 'The summary.')

  it('holds every English page, each marked with its URL', () => {
    expect(full).toContain(`<!-- ${SITE_URL}/setup.md -->`)
    expect(full).toContain('Body of rules/no-unknown-classes.md.')
    expect(full).not.toContain('Body of es/setup.md.')
  })
})

describe('markdownCopy', () => {
  it('is the page body, starting at its H1', () => {
    expect(markdownCopy(PAGES[1])).toBe('# Setup\n\nBody of setup.md.\n')
  })

  it('gives a page with no body its title and description', () => {
    expect(markdownCopy(PAGES[0])).toBe('# Home\n\nAbout index.md, with code.\n')
  })
})
