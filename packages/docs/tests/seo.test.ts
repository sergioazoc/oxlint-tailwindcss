import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SITE_NAME,
  SITE_URL,
  counterpart,
  isRulePage,
  localeOf,
  pageHead,
  siteHead,
  urlPath,
} from '../.vitepress/seo.ts'

type Entry = [string, Record<string, string>, string?]
const find = (head: Entry[], tag: string, attrs: Record<string, string>) =>
  head.filter(([t, a]) => t === tag && Object.entries(attrs).every(([k, v]) => a[k] === v))
const ld = (head: Entry[]) =>
  head
    .filter(([t, a]) => t === 'script' && a.type === 'application/ld+json')
    .map(([, , s]) => JSON.parse(s!))

const page = (relativePath: string) =>
  pageHead({ relativePath, title: 'T | oxlint-tailwindcss', description: 'D' }) as Entry[]

describe('URLs under cleanUrls', () => {
  it.each([
    ['index.md', '/'],
    ['setup.md', '/setup'],
    ['rules/index.md', '/rules/'],
    ['rules/no-unknown-classes.md', '/rules/no-unknown-classes'],
    ['migration/v0-to-v1.md', '/migration/v0-to-v1'],
    ['es/index.md', '/es/'],
    ['es/rules/index.md', '/es/rules/'],
    ['es/ci.md', '/es/ci'],
  ])('%s → %s', (source, path) => {
    expect(urlPath(source)).toBe(path)
  })

  it('pairs each page with its other-locale twin', () => {
    expect(counterpart('setup.md')).toBe('es/setup.md')
    expect(counterpart('es/rules/index.md')).toBe('rules/index.md')
    expect(localeOf('es/index.md')).toBe('es')
    expect(localeOf('rules/index.md')).toBe('en')
  })
})

describe('pageHead', () => {
  it('points canonical and og:url at the page itself', () => {
    const head = page('es/settings.md')
    expect(find(head, 'link', { rel: 'canonical' })[0][1].href).toBe(`${SITE_URL}/es/settings`)
    expect(find(head, 'meta', { property: 'og:url' })[0][1].content).toBe(`${SITE_URL}/es/settings`)
    expect(find(head, 'meta', { property: 'og:locale' })[0][1].content).toBe('es_ES')
  })

  it('declares both locales and x-default, the same set from either side', () => {
    const alternates = (p: string) =>
      find(page(p), 'link', { rel: 'alternate' }).map(([, a]) => `${a.hreflang} ${a.href}`)
    const expected = [
      `en ${SITE_URL}/monorepo`,
      `es ${SITE_URL}/es/monorepo`,
      `x-default ${SITE_URL}/monorepo`,
    ]
    expect(alternates('monorepo.md')).toEqual(expected)
    expect(alternates('es/monorepo.md')).toEqual(expected)
  })

  it('names the site on the home page: WebSite JSON-LD (the "Cloudflare" fix)', () => {
    const website = ld(page('index.md')).find((d) => d['@type'] === 'WebSite')
    expect(website).toMatchObject({
      '@context': 'https://schema.org',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    })
    const code = ld(page('index.md')).find((d) => d['@type'] === 'SoftwareSourceCode')
    expect(code?.codeRepository).toMatch(/^https:\/\/github\.com\//)
    // Only the site's home page carries it.
    expect(ld(page('es/index.md')).some((d) => d['@type'] === 'WebSite')).toBe(false)
    expect(ld(page('setup.md'))).toEqual([])
  })

  it('gives rule pages a breadcrumb, in their locale', () => {
    expect(isRulePage('rules/no-unknown-classes.md')).toBe(true)
    expect(isRulePage('rules/index.md')).toBe(false)
    const [crumbs] = ld(page('es/rules/max-class-count.md'))
    expect(crumbs['@type']).toBe('BreadcrumbList')
    expect(
      crumbs.itemListElement.map((i: { name: string; item: string }) => [i.name, i.item]),
    ).toEqual([
      [SITE_NAME, `${SITE_URL}/es/`],
      ['Reglas', `${SITE_URL}/es/rules/`],
      ['max-class-count', `${SITE_URL}/es/rules/max-class-count`],
    ])
  })

  it('keeps the 404 page out of the index', () => {
    const head = pageHead({
      relativePath: '404.md',
      title: 'x',
      description: 'y',
      isNotFound: true,
    })
    expect(head).toEqual([['meta', { name: 'robots', content: 'noindex' }]])
  })
})

describe('siteHead', () => {
  it('names the site and gives previews an image of the right size', () => {
    const head = siteHead() as Entry[]
    expect(find(head, 'meta', { property: 'og:site_name' })[0][1].content).toBe(SITE_NAME)
    expect(find(head, 'meta', { property: 'og:image' })[0][1].content).toBe(`${SITE_URL}/og.png`)
    expect(find(head, 'meta', { property: 'og:image:width' })[0][1].content).toBe('1200')
    expect(find(head, 'link', { rel: 'icon', type: 'image/svg+xml' })).toHaveLength(1)
  })
})

describe('one site URL everywhere', () => {
  it('npm lists the docs site as the package homepage (a site-name signal too)', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../oxlint-tailwindcss/package.json'), 'utf8'),
    ) as { homepage: string }
    expect(pkg.homepage).toBe(SITE_URL)
  })
})
