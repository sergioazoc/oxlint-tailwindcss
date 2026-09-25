/**
 * Every published page carries its own title and description — what a search
 * engine or a link preview shows. Before this, every page shared the site-wide
 * English description, Spanish pages included.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_DESCRIPTION, parseFrontmatter, plainText } from '../scripts/rule-page.ts'

const DOCS = resolve(__dirname, '..')
// Not pages: excluded from the site by `srcExclude` in .vitepress/config.ts.
const NOT_PAGES = new Set(['node_modules', '.vitepress', 'public', 'tests', 'scripts', '_extras'])
const NOT_PAGE_FILES = new Set(['AGENTS.md', 'CLAUDE.md'])

function pages(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (NOT_PAGES.has(entry) || NOT_PAGE_FILES.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...pages(path))
    else if (entry.endsWith('.md')) out.push(relative(DOCS, path).split('\\').join('/'))
  }
  return out.sort()
}

const ALL = pages(DOCS)
const EN = ALL.filter((p) => !p.startsWith('es/'))
const meta = (page: string) => parseFrontmatter(readFileSync(join(DOCS, page), 'utf8')).data

describe('page frontmatter', () => {
  it('finds every page', () => {
    expect(EN.length).toBeGreaterThan(30)
    expect(ALL.length).toBe(EN.length * 2)
  })

  it.each(ALL)('%s has a title and a search-length description', (page) => {
    const { title, description } = meta(page)
    expect(title, 'title').toBeTruthy()
    expect(description, 'description').toBeTruthy()
    expect(plainText(description).length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    expect(plainText(description).length).toBeGreaterThanOrEqual(50)
  })

  it.each(EN)('es/%s is titled and described in Spanish, not copied from English', (page) => {
    expect(meta(`es/${page}`).description).not.toBe(meta(page).description)
    expect(meta(`es/${page}`).title).not.toBe(meta(page).title)
  })

  it.each(['en', 'es'])('no two %s pages share a title or a description', (locale) => {
    const set = ALL.filter((p) => (locale === 'es') === p.startsWith('es/'))
    const titles = set.map((p) => meta(p).title)
    const descriptions = set.map((p) => meta(p).description)
    expect(new Set(titles).size).toBe(set.length)
    expect(new Set(descriptions).size).toBe(set.length)
  })
})
