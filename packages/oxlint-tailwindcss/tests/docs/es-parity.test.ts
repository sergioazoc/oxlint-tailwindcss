/**
 * The Spanish docs are a translation of the English ones — same pages, same
 * shape. Translating prose is free; dropping a section, a code block, a warning
 * box, a table row or a link is how one locale silently falls behind the other.
 *
 * Checked per page pair (`x.md` ↔ `es/x.md`, `_extras` included): both exist,
 * and they have the same headings by level, the same code blocks by language,
 * the same `:::` containers by kind, the same number of table rows, the same
 * external links, and the same internal links (`/x` ↔ `/es/x`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOCS = resolve(__dirname, '../../../docs')
const SKIP = new Set(['node_modules', '.vitepress', 'public', 'es', 'AGENTS.md', 'CLAUDE.md'])

function pages(dir: string, skip: Set<string>): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...pages(path, new Set(['node_modules'])))
    else if (entry.endsWith('.md')) out.push(relative(DOCS, path).split('\\').join('/'))
  }
  return out.sort()
}

const EN = pages(DOCS, SKIP)
const ES = pages(join(DOCS, 'es'), new Set(['node_modules'])).map((p) => p.replace(/^es\//, ''))

/** Code blocks removed, so their contents can't read as headings or links. */
const prose = (md: string) => md.replace(/^```[\s\S]*?^```/gm, '')

function shape(md: string, locale: 'en' | 'es') {
  const text = prose(md)
  return {
    headings: [...text.matchAll(/^(#{1,6}) /gm)].map((m) => m[1]),
    codeBlocks: [...md.matchAll(/^```(\S*)/gm)].map((m) => m[1]).filter((_, i) => i % 2 === 0),
    containers: [...text.matchAll(/^::: ?(\w+)/gm)].map((m) => m[1]),
    tableRows: text.split('\n').filter((l) => l.startsWith('|')).length,
    externalLinks: [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]).sort(),
    internalLinks: [...text.matchAll(/\]\((\/[^)\s]*)\)/g)]
      .map((m) => (locale === 'es' ? m[1].replace(/^\/es(?=\/|$)/, '') || '/' : m[1]))
      // Spanish slugs differ: compare the page, not the heading anchor.
      .map((link) => link.replace(/#.*$/, ''))
      .sort(),
  }
}

describe('Spanish docs mirror the English ones', () => {
  it('has the same pages in both locales', () => {
    expect(ES).toEqual(EN)
  })

  it.each(EN)('%s', (page) => {
    const en = shape(readFileSync(join(DOCS, page), 'utf8'), 'en')
    const es = shape(readFileSync(join(DOCS, 'es', page), 'utf8'), 'es')
    expect(es).toEqual(en)
  })
})

/**
 * Neutral Spanish, tuteo: the docs are written for every Spanish-speaking
 * reader (packages/docs/CLAUDE.md). Voseo verb forms and regional adverbs slip
 * in easily; these are the ones that did, or would.
 */
const REGIONAL =
  /\b(acá|vos|tenés|podés|querés|sabés|hacé|decí|usá|mirá|fijate|poné|agregá|ahorita)\b/i

describe('Spanish docs are neutral Spanish', () => {
  it.each(ES)('es/%s', (page) => {
    const offenders = prose(readFileSync(join(DOCS, 'es', page), 'utf8'))
      .split('\n')
      .filter((line) => REGIONAL.test(line))
    expect(offenders).toEqual([])
  })
})
