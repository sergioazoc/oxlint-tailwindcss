/**
 * The sidebar and nav of both locales: the same shape (the Spanish links are
 * the English ones under `/es`), every link reaching a page, and every
 * hand-written page reachable from the sidebar. VitePress checks the links
 * inside pages, not these.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import config from '../.vitepress/config.ts'

const DOCS = resolve(__dirname, '..')

interface Item {
  text?: string
  link?: string
  items?: Item[]
}
interface ThemeConfig {
  nav: Item[]
  sidebar: Record<string, Item[]>
}
const theme = (locale: 'root' | 'es') =>
  config.locales![locale].themeConfig as unknown as ThemeConfig

/** The internal links of a tree, in order, with its nesting as `>`. */
function shape(items: Item[], depth = 0): string[] {
  return items.flatMap((i) => [
    `${'>'.repeat(depth)}${i.link && !i.link.startsWith('http') ? i.link : i.link ? 'external' : 'group'}`,
    ...shape(i.items ?? [], depth + 1),
  ])
}

const toSpanish = (link: string) => (link.startsWith('/') ? `/es${link}` : link)

/** The source page of a link: `/setup` → `setup.md`, `/rules/` → `rules/index.md`. */
function sourceOf(link: string): string {
  const path = link.split('#')[0].slice(1)
  return path === '' || path.endsWith('/') ? `${path}index.md` : `${path}.md`
}

function handWrittenPages(dir = DOCS): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) {
      return [
        'node_modules',
        '.vitepress',
        'public',
        'scripts',
        'tests',
        'data',
        '_extras',
      ].includes(e.name)
        ? []
        : handWrittenPages(path)
    }
    if (!e.name.endsWith('.md') || ['AGENTS.md', 'CLAUDE.md'].includes(e.name)) return []
    const rel = relative(DOCS, path).split('\\').join('/')
    // Rule pages are generated, and all listed under Rules.
    return /^(es\/)?rules\/(?!index\.md$)/.test(rel) ? [] : [rel]
  })
}

describe('sidebar and nav', () => {
  const en = theme('root')
  const es = theme('es')

  it('have the same shape in both locales', () => {
    expect(shape(es.sidebar['/es/']).map((l) => l.replace(/^(>*)\/es/, '$1'))).toEqual(
      shape(en.sidebar['/']),
    )
    expect(shape(es.nav)).toEqual(shape(en.nav).map((l) => l.replace(/^(>*)(\/)/, '$1/es$2')))
  })

  it('link only to pages that exist', () => {
    const links = [...shape(en.sidebar['/']), ...shape(en.nav)]
      .map((l) => l.replace(/^>*/, ''))
      .filter((l) => l.startsWith('/'))
    const missing = [...links, ...links.map(toSpanish)].filter(
      (l) => !existsSync(join(DOCS, sourceOf(l))),
    )
    expect(missing).toEqual([])
  })

  it('reach every hand-written page', () => {
    const linked = new Set(
      [...shape(en.sidebar['/']), ...shape(es.sidebar['/es/'])]
        .map((l) => l.replace(/^>*/, ''))
        .filter((l) => l.startsWith('/'))
        .map(sourceOf),
    )
    expect(handWrittenPages().filter((p) => !linked.has(p))).toEqual([])
  })
})
