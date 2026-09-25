/**
 * Check the BUILT site — what visitors, search engines and LLMs actually get —
 * and fail the docs build on any regression. Runs after `vitepress build`
 * (`pnpm -C packages/docs build`), so it gates both pull requests (docs.yml)
 * and the deploy (release.yml).
 *
 * `checkDist` is pure (a map of files in, a list of problems out) and tested
 * with one case per class of failure in `tests/check-dist.test.ts`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE_URL } from '../.vitepress/seo.ts'

export type DistFiles = Map<string, string>

const MAX_DESCRIPTION = 160

interface Page {
  file: string
  lang: string | undefined
  title: string | undefined
  description: string | undefined
  canonical: string | undefined
  hreflang: Record<string, string>
  og: Record<string, string>
  jsonLd: { '@type'?: string }[]
  robots: string | undefined
  markdownAlternate: string | undefined
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]?.replace(/&amp;/g, '&')

function parse(file: string, html: string): Page {
  const head = html.slice(0, html.indexOf('</head>') + 1 || undefined)
  const tags = (re: RegExp) => [...head.matchAll(re)].map((m) => m[0])
  const links = tags(/<link\b[^>]*>/g)
  const metas = tags(/<meta\b[^>]*>/g)
  const hreflang: Record<string, string> = {}
  for (const l of links) {
    if (attr(l, 'rel') === 'alternate' && attr(l, 'hreflang'))
      hreflang[attr(l, 'hreflang')!] = attr(l, 'href')!
  }
  const og: Record<string, string> = {}
  for (const m of metas) {
    const property = attr(m, 'property')
    if (property?.startsWith('og:')) og[property] = attr(m, 'content') ?? ''
  }
  const jsonLd = [
    ...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].map((m) => JSON.parse(m[1]) as { '@type'?: string })
  return {
    file,
    lang: /<html\b[^>]*\blang="([^"]*)"/.exec(html)?.[1],
    title: /<title>([\s\S]*?)<\/title>/.exec(head)?.[1],
    description: attr(metas.find((m) => attr(m, 'name') === 'description') ?? '', 'content'),
    canonical: attr(links.find((l) => attr(l, 'rel') === 'canonical') ?? '', 'href'),
    hreflang,
    og,
    jsonLd,
    robots: attr(metas.find((m) => attr(m, 'name') === 'robots') ?? '', 'content'),
    markdownAlternate: attr(
      links.find((l) => attr(l, 'rel') === 'alternate' && attr(l, 'type') === 'text/markdown') ??
        '',
      'href',
    ),
  }
}

/** `setup.html` → `/setup`, `rules/index.html` → `/rules/`, `index.html` → `/`. */
function urlOf(file: string): string {
  const path = file.replace(/\.html$/, '')
  if (path === 'index') return `${SITE_URL}/`
  if (path.endsWith('/index')) return `${SITE_URL}/${path.slice(0, -'index'.length)}`
  return `${SITE_URL}/${path}`
}

/** The source-page markdown copy a built page should have: `setup.html` → `setup.md`. */
const markdownOf = (file: string) => file.replace(/\.html$/, '.md')

const isSpanish = (file: string) => file.startsWith('es/')
const counterpartOf = (file: string) => (isSpanish(file) ? file.slice(3) : `es/${file}`)
const isRulePage = (file: string) => /^(es\/)?rules\/(?!index\.html$)[^/]+\.html$/.test(file)

export function checkDist(files: DistFiles): string[] {
  const problems: string[] = []
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`)

  const htmlFiles = [...files.keys()].filter((f) => f.endsWith('.html')).sort()
  const pages = htmlFiles.filter((f) => f !== '404.html').map((f) => parse(f, files.get(f)!))
  const byFile = new Map(pages.map((p) => [p.file, p]))

  // ── Nothing internal is published.
  for (const f of files.keys()) {
    if (/(^|\/)_extras\//.test(f) || /(^|\/)(AGENTS|CLAUDE)\.(html|md)$/.test(f)) {
      fail(f, 'internal file published')
    }
  }

  // ── Per page.
  const seen = { title: new Map<string, string>(), description: new Map<string, string>() }
  for (const p of pages) {
    const spanish = isSpanish(p.file)
    if (p.lang !== (spanish ? 'es' : 'en'))
      fail(p.file, `<html lang="${p.lang}">, expected "${spanish ? 'es' : 'en'}"`)
    if (!p.title) fail(p.file, 'no <title>')
    if (!p.description) fail(p.file, 'no meta description')
    else if (p.description.length > MAX_DESCRIPTION) {
      fail(
        p.file,
        `meta description is ${p.description.length} characters (max ${MAX_DESCRIPTION})`,
      )
    }
    for (const key of ['title', 'description'] as const) {
      const value = p[key]
      if (!value) continue
      const locale = spanish ? 'es' : 'en'
      const other = seen[key].get(`${locale}\0${value}`)
      if (other) fail(p.file, `same ${key} as ${other}`)
      else seen[key].set(`${locale}\0${value}`, p.file)
    }
    const url = urlOf(p.file)
    if (p.canonical !== url) fail(p.file, `canonical is ${p.canonical}, expected ${url}`)
    if (p.og['og:url'] !== url) fail(p.file, `og:url is ${p.og['og:url']}`)
    for (const key of ['og:title', 'og:description', 'og:site_name', 'og:image', 'og:locale']) {
      if (!p.og[key]) fail(p.file, `no ${key}`)
    }
    const twin = byFile.get(counterpartOf(p.file))
    if (!twin)
      fail(p.file, `no ${spanish ? 'English' : 'Spanish'} counterpart (${counterpartOf(p.file)})`)
    else {
      if (p.description && p.description === twin.description && spanish) {
        fail(p.file, 'Spanish description copied from English')
      }
      const expected = {
        en: urlOf(spanish ? twin.file : p.file),
        es: urlOf(spanish ? p.file : twin.file),
      }
      for (const lang of ['en', 'es'] as const) {
        if (p.hreflang[lang] !== expected[lang])
          fail(p.file, `hreflang ${lang} is ${p.hreflang[lang]}`)
      }
      if (p.hreflang['x-default'] !== expected.en)
        fail(p.file, `hreflang x-default is ${p.hreflang['x-default']}`)
    }
    const body = files.get(p.file)!
    if (/<p>:::/.test(body) || /^:::/m.test(body.replace(/<pre[\s\S]*?<\/pre>/g, ''))) {
      fail(p.file, 'unrendered ::: container')
    }
    if (isRulePage(p.file) && !p.jsonLd.some((d) => d['@type'] === 'BreadcrumbList')) {
      fail(p.file, 'rule page without BreadcrumbList')
    }
    const md = markdownOf(p.file)
    if (!files.has(md)) fail(p.file, `no markdown copy (${md})`)
    if (p.markdownAlternate !== `${SITE_URL}/${md}`)
      fail(p.file, `markdown alternate is ${p.markdownAlternate}`)
  }

  // ── Home page: the site name.
  const home = byFile.get('index.html')
  const website = home?.jsonLd.find((d) => d['@type'] === 'WebSite') as
    | { name?: string }
    | undefined
  if (!website) fail('index.html', 'no WebSite JSON-LD (the site-name signal)')
  else if (website.name !== home?.og['og:site_name']) {
    fail(
      'index.html',
      `WebSite name "${website.name}" ≠ og:site_name "${home?.og['og:site_name']}"`,
    )
  }
  for (const p of pages) {
    if (p.file !== 'index.html' && p.jsonLd.some((d) => d['@type'] === 'WebSite')) {
      fail(p.file, 'WebSite JSON-LD outside the home page')
    }
  }

  // ── 404: kept out of the index.
  if (files.has('404.html') && parse('404.html', files.get('404.html')!).robots !== 'noindex') {
    fail('404.html', 'not noindex')
  }

  // ── sitemap.xml lists exactly the canonical URLs.
  const sitemap = files.get('sitemap.xml')
  if (!sitemap) fail('sitemap.xml', 'missing')
  else {
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).sort()
    const canonicals = pages.map((p) => p.canonical ?? '').sort()
    const missing = canonicals.filter((c) => !locs.includes(c))
    const extra = locs.filter((l) => !canonicals.includes(l))
    if (missing.length) fail('sitemap.xml', `missing ${missing.join(', ')}`)
    if (extra.length) fail('sitemap.xml', `lists non-canonical URLs ${extra.join(', ')}`)
  }

  // ── robots.txt and the LLM files.
  const robots = files.get('robots.txt')
  if (!robots) fail('robots.txt', 'missing')
  else if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`))
    fail('robots.txt', 'no Sitemap line')
  for (const f of ['llms.txt', 'llms-full.txt'])
    if (!files.get(f)?.trim()) fail(f, 'missing or empty')

  return problems
}

/** Every file under `dir`, keyed by forward-slash path relative to it. */
export function readDist(dir: string): DistFiles {
  const files: DistFiles = new Map()
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const path = join(d, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(html|md|txt|xml)$/.test(entry)) {
        files.set(relative(dir, path).split('\\').join('/'), readFileSync(path, 'utf8'))
      }
    }
  }
  walk(dir)
  return files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = resolve(fileURLToPath(new URL('../.vitepress/dist', import.meta.url)))
  const problems = checkDist(readDist(dist))
  if (problems.length > 0) {
    console.error(`[check-dist] ${problems.length} problem(s) in the built site:`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log('[check-dist] ok')
}
