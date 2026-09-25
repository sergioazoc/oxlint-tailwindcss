/**
 * Check the DEPLOYED site — what Cloudflare Pages actually serves, which the
 * build can't see: our robots.txt instead of a platform default, the
 * `_redirects` and `_headers` rules, crawler access, and per-page dates.
 *
 * Informational: release.yml runs it after the deploy without failing the
 * release (a CDN hiccup must not look like a broken release). Run it by hand
 * with `node --experimental-strip-types scripts/check-live.ts [base-url]`.
 *
 * `checkLive` takes the `fetch` to use, so the tests drive it with a fake.
 */

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { SITE_URL } from '../.vitepress/seo.ts'

type Fetch = (
  url: string,
  init?: { redirect?: 'manual'; headers?: Record<string, string> },
) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

export const CRAWLERS: Record<string, string> = {
  Googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  GPTBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  ClaudeBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
}

export interface LiveResult {
  check: string
  ok: boolean
  detail?: string
}

const meta = (html: string, name: string) =>
  new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html)?.[1]

export async function checkLive(base: string, fetch: Fetch): Promise<LiveResult[]> {
  const results: LiveResult[] = []
  const record = (check: string, ok: boolean, detail?: string) =>
    results.push({ check, ok, detail })
  const get = async (path: string, init?: Parameters<Fetch>[1]) => {
    try {
      const res = await fetch(`${base}${path}`, init)
      return { status: res.status, headers: res.headers, body: await res.text() }
    } catch (error) {
      return { status: 0, headers: { get: () => null }, body: String(error) }
    }
  }

  const robots = await get('/robots.txt')
  record(
    'robots.txt is ours',
    robots.status === 200 &&
      robots.body.includes('Content-Signal:') &&
      robots.body.includes(`Sitemap: ${SITE_URL}/sitemap.xml`),
    `HTTP ${robots.status}`,
  )

  const sitemap = await get('/sitemap.xml')
  record(
    'sitemap.xml is served',
    sitemap.status === 200 && sitemap.body.includes('<urlset'),
    `HTTP ${sitemap.status}`,
  )
  const lastmods = new Set(
    [...sitemap.body.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]),
  )
  record(
    'pages have their own last-updated dates',
    lastmods.size > 1,
    `${lastmods.size} distinct lastmod value(s)`,
  )

  const llms = await get('/llms.txt')
  record(
    'llms.txt is served as text',
    llms.status === 200 && /text\/plain/.test(llms.headers.get('content-type') ?? ''),
    `HTTP ${llms.status} ${llms.headers.get('content-type')}`,
  )

  const markdown = await get('/setup.md')
  record(
    'markdown copies are served as markdown, unindexed',
    markdown.status === 200 &&
      /text\/markdown/.test(markdown.headers.get('content-type') ?? '') &&
      /noindex/.test(markdown.headers.get('x-robots-tag') ?? ''),
    `HTTP ${markdown.status} ${markdown.headers.get('content-type')} / ${markdown.headers.get('x-robots-tag')}`,
  )

  const redirect = await get('/rules/_extras/no-unknown-classes', { redirect: 'manual' })
  const location = redirect.headers.get('location') ?? ''
  record(
    'old _extras URLs redirect to the rule page',
    redirect.status === 301 && /\/rules\/no-unknown-classes$/.test(location),
    `HTTP ${redirect.status} → ${location}`,
  )

  for (const path of ['/AGENTS', '/CLAUDE']) {
    const res = await get(path)
    record(`${path} is not published`, res.status === 404, `HTTP ${res.status}`)
  }

  const home = await get('/')
  record(
    'the home page declares the site name (WebSite JSON-LD)',
    /"@type":"WebSite","name":"oxlint-tailwindcss"/.test(home.body),
  )
  record(
    'the home page has a canonical URL',
    home.body.includes(`<link rel="canonical" href="${SITE_URL}/">`),
  )
  record(
    'the home page lists its Spanish alternate',
    home.body.includes(`hreflang="es" href="${SITE_URL}/es/"`),
  )

  const esHome = await get('/es/')
  const [en, es] = [meta(home.body, 'description'), meta(esHome.body, 'description')]
  record('the Spanish home is described in Spanish', !!es && es !== en, es)

  const asset = /\/assets\/[^"]+\.js/.exec(home.body)?.[0]
  const assetRes = asset ? await get(asset) : undefined
  record(
    'hashed assets are cached as immutable',
    !!assetRes && /immutable/.test(assetRes.headers.get('cache-control') ?? ''),
    assetRes?.headers.get('cache-control') ?? 'no asset found',
  )

  for (const [bot, ua] of Object.entries(CRAWLERS)) {
    const res = await get('/rules/no-unknown-classes', { headers: { 'user-agent': ua } })
    record(`${bot} can read the pages`, res.status === 200, `HTTP ${res.status}`)
  }
  return results
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = (process.argv[2] ?? SITE_URL).replace(/\/$/, '')
  const results = await checkLive(base, fetch as unknown as Fetch)
  for (const r of results)
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.check}${r.detail ? ` — ${r.detail}` : ''}`)
  const failed = results.filter((r) => !r.ok).length
  console.log(
    failed
      ? `\n[check-live] ${failed} check(s) failed on ${base}`
      : `\n[check-live] all good on ${base}`,
  )
  process.exitCode = failed ? 1 : 0
}
