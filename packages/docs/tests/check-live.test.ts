import { describe, expect, it } from 'vitest'
import { SITE_URL } from '../.vitepress/seo.ts'
import { CRAWLERS, checkLive } from '../scripts/check-live.ts'

interface Fake {
  status?: number
  body?: string
  headers?: Record<string, string>
}

/** What the deployed site serves when everything is right. */
function goodSite(): Record<string, Fake> {
  return {
    '/robots.txt': {
      body: `User-agent: *\nContent-Signal: search=yes\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    },
    '/sitemap.xml': {
      body: '<urlset><url><lastmod>2026-09-01T10:00:00.000Z</lastmod></url><url><lastmod>2026-09-20T12:00:00.000Z</lastmod></url></urlset>',
    },
    '/llms.txt': { body: '# x', headers: { 'content-type': 'text/plain; charset=utf-8' } },
    '/setup.md': {
      body: '# Setup',
      headers: { 'content-type': 'text/markdown; charset=utf-8', 'x-robots-tag': 'noindex' },
    },
    '/rules/_extras/no-unknown-classes': {
      status: 301,
      headers: { location: '/rules/no-unknown-classes' },
    },
    '/AGENTS': { status: 404 },
    '/CLAUDE': { status: 404 },
    '/': {
      body: `<link rel="canonical" href="${SITE_URL}/"><link rel="alternate" hreflang="es" href="${SITE_URL}/es/"><meta name="description" content="English."><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"oxlint-tailwindcss"}</script><script src="/assets/app.abc123.js"></script>`,
    },
    '/es/': { body: '<meta name="description" content="Español.">' },
    '/assets/app.abc123.js': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    '/rules/no-unknown-classes': { body: '<html></html>' },
  }
}

function fakeFetch(site: Record<string, Fake>) {
  const seen: { url: string; ua?: string }[] = []
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    const path = url.replace('https://example.test', '')
    seen.push({ url: path, ua: init?.headers?.['user-agent'] })
    const r = site[path] ?? { status: 404 }
    const headers = Object.fromEntries(
      Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    )
    return {
      status: r.status ?? 200,
      headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
      text: async () => r.body ?? '',
    }
  }
  return { fetch, seen }
}

const run = (site: Record<string, Fake>) => checkLive('https://example.test', fakeFetch(site).fetch)
const failing = async (site: Record<string, Fake>) =>
  (await run(site)).filter((r) => !r.ok).map((r) => r.check)

describe('checkLive', () => {
  it('passes the site as it should be served', async () => {
    expect(await failing(goodSite())).toEqual([])
  })

  it('asks as every crawler it promises access to', async () => {
    const { fetch, seen } = fakeFetch(goodSite())
    await checkLive('https://example.test', fetch)
    const uas = seen.filter((s) => s.ua).map((s) => s.ua)
    expect(uas).toEqual(Object.values(CRAWLERS))
  })

  it.each<[string, (s: Record<string, Fake>) => void, string]>([
    [
      'the platform robots.txt',
      (s) => (s['/robots.txt'] = { body: 'User-agent: *\nAllow: /\n' }),
      'robots.txt is ours',
    ],
    [
      'one date for every page',
      (s) => (s['/sitemap.xml'].body = '<lastmod>a</lastmod><lastmod>a</lastmod><urlset>'),
      'pages have their own last-updated dates',
    ],
    [
      'markdown served as HTML',
      (s) => (s['/setup.md'].headers = { 'content-type': 'text/html' }),
      'markdown copies are served as markdown, unindexed',
    ],
    [
      'a missing redirect',
      (s) => (s['/rules/_extras/no-unknown-classes'] = { status: 200 }),
      'old _extras URLs redirect to the rule page',
    ],
    ['published agent notes', (s) => (s['/AGENTS'] = { status: 200 }), '/AGENTS is not published'],
    [
      'no site name',
      (s) => (s['/'].body = s['/'].body!.replace('WebSite', 'Thing')),
      'the home page declares the site name (WebSite JSON-LD)',
    ],
    [
      'an English Spanish home',
      (s) => (s['/es/'].body = '<meta name="description" content="English.">'),
      'the Spanish home is described in Spanish',
    ],
    [
      'revalidated assets',
      (s) => (s['/assets/app.abc123.js'].headers = { 'cache-control': 'max-age=0' }),
      'hashed assets are cached as immutable',
    ],
    [
      'a blocked crawler',
      (s) => (s['/rules/no-unknown-classes'].status = 403),
      'GPTBot can read the pages',
    ],
  ])('reports %s', async (_, break_, check) => {
    const site = goodSite()
    break_(site)
    expect(await failing(site)).toContain(check)
  })

  it('treats a network error as a failure, not a crash', async () => {
    const results = await checkLive('https://example.test', async () => {
      throw new Error('ECONNRESET')
    })
    expect(results.length).toBeGreaterThan(10)
    expect(results.filter((r) => r.ok)).toEqual([])
  })
})
