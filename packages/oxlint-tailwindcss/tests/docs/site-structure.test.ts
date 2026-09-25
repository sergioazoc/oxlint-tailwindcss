/**
 * What the docs site's config assumes about the source tree.
 *
 * `.vitepress/config.ts` sends "Edit this page" on every `rules/<name>.md`
 * except `index.md` to `rules/_extras/<name>.md`, because those pages are
 * generated from the rule registry plus that hand-written fragment. That holds
 * only while every such page IS a generated rule page with a fragment behind it,
 * in both locales. `public/_redirects` sends the `_extras` URLs Google indexed
 * (they were published as pages until `srcExclude` removed them) to the real
 * rule page.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import plugin from '../../src/index'

const DOCS = resolve(__dirname, '../../../docs')
const RULES = Object.keys(plugin.rules).sort()

describe.each(['rules', 'es/rules'])('%s/', (dir) => {
  const pages = readdirSync(join(DOCS, dir))
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => f.slice(0, -3))
    .sort()
  const extras = readdirSync(join(DOCS, dir, '_extras'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .sort()

  it('holds exactly one generated page per rule, besides index.md', () => {
    expect(pages).toEqual(RULES)
  })

  it('has the hand-written _extras fragment each page is generated from', () => {
    expect(extras).toEqual(RULES)
  })
})

describe('public/_redirects', () => {
  const lines = readFileSync(join(DOCS, 'public/_redirects'), 'utf8')
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((l) => l[0])

  it('sends the old _extras URLs to the rule page, permanently', () => {
    expect(lines).toContainEqual(['/rules/_extras/*', '/rules/:splat', '301'])
    expect(lines).toContainEqual(['/es/rules/_extras/*', '/es/rules/:splat', '301'])
  })
})
