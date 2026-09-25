/**
 * What search engines and link previews read in each page's `<head>`, as pure
 * functions of the page — tested in `tests/seo.test.ts`, wired into
 * `config.ts` (`head` + `transformHead`).
 *
 * The site-name fix lives here. The site is served from a `pages.dev`
 * subdomain, and `pages.dev`'s own root redirects to cloudflare.com, which
 * declares itself as a `WebSite` named "Cloudflare". With no site-name signal of
 * its own, Google fell back to that and showed "Cloudflare" above our results.
 * Google reads the site name from a `WebSite` JSON-LD on the home page, backed
 * by `og:site_name` and the home page title — so all three say `SITE_NAME`.
 */

type HeadConfig = [string, Record<string, string>] | [string, Record<string, string>, string]

export const SITE_URL = 'https://oxlint-tailwindcss.pages.dev'
export const SITE_NAME = 'oxlint-tailwindcss'
export const REPO_URL = 'https://github.com/sergioazoc/oxlint-tailwindcss'
const OG_IMAGE = `${SITE_URL}/og.png`

export type Locale = 'en' | 'es'

/** `es/...` pages are Spanish; everything else is English. */
export function localeOf(relativePath: string): Locale {
  return relativePath === 'es/index.md' || relativePath.startsWith('es/') ? 'es' : 'en'
}

/**
 * The public URL path of a source page under `cleanUrls`: `setup.md` →
 * `/setup`, `rules/index.md` → `/rules/`, `index.md` → `/`.
 */
export function urlPath(relativePath: string): string {
  const path = relativePath.replace(/\\/g, '/').replace(/\.md$/, '')
  if (path === 'index') return '/'
  if (path.endsWith('/index')) return `/${path.slice(0, -'index'.length)}`
  return `/${path}`
}

/** The same page in the other locale (every page exists in both). */
export function counterpart(relativePath: string): string {
  return localeOf(relativePath) === 'es' ? relativePath.slice('es/'.length) : `es/${relativePath}`
}

export function absoluteUrl(relativePath: string): string {
  return `${SITE_URL}${urlPath(relativePath)}`
}

const OG_LOCALE: Record<Locale, string> = { en: 'en_US', es: 'es_ES' }

/** `<head>` entries every page shares. */
export function siteHead(): HeadConfig[] {
  return [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['meta', { name: 'theme-color', content: '#0b1220' }],
    ['meta', { property: 'og:site_name', content: SITE_NAME }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    [
      'meta',
      { property: 'og:image:alt', content: `${SITE_NAME} — Tailwind CSS linting for oxlint` },
    ],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ]
}

const jsonLd = (data: Record<string, unknown>): HeadConfig => [
  'script',
  { type: 'application/ld+json' },
  JSON.stringify({ '@context': 'https://schema.org', ...data }),
]

function breadcrumb(relativePath: string, title: string): HeadConfig {
  const es = localeOf(relativePath) === 'es'
  const home = es ? 'es/index.md' : 'index.md'
  const rules = es ? 'es/rules/index.md' : 'rules/index.md'
  return jsonLd({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl(home) },
      { '@type': 'ListItem', position: 2, name: es ? 'Reglas' : 'Rules', item: absoluteUrl(rules) },
      { '@type': 'ListItem', position: 3, name: title, item: absoluteUrl(relativePath) },
    ],
  })
}

/** A generated rule page: `rules/<name>.md` or `es/rules/<name>.md`, not the index. */
export function isRulePage(relativePath: string): boolean {
  return /^(es\/)?rules\/(?!index\.md$)[^/]+\.md$/.test(relativePath)
}

export interface PageInfo {
  relativePath: string
  /** The page's final `<title>`. */
  title: string
  description: string
  isNotFound?: boolean
}

/** `<head>` entries for one page. */
export function pageHead({ relativePath, title, description, isNotFound }: PageInfo): HeadConfig[] {
  if (isNotFound) return [['meta', { name: 'robots', content: 'noindex' }]]

  const locale = localeOf(relativePath)
  const url = absoluteUrl(relativePath)
  const en = locale === 'en' ? relativePath : counterpart(relativePath)
  const es = locale === 'es' ? relativePath : counterpart(relativePath)
  const head: HeadConfig[] = [
    ['link', { rel: 'canonical', href: url }],
    ['link', { rel: 'alternate', hreflang: 'en', href: absoluteUrl(en) }],
    ['link', { rel: 'alternate', hreflang: 'es', href: absoluteUrl(es) }],
    ['link', { rel: 'alternate', hreflang: 'x-default', href: absoluteUrl(en) }],
    ['meta', { property: 'og:url', content: url }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:locale', content: OG_LOCALE[locale] }],
    [
      'meta',
      { property: 'og:locale:alternate', content: OG_LOCALE[locale === 'en' ? 'es' : 'en'] },
    ],
  ]

  if (relativePath === 'index.md') {
    head.push(
      jsonLd({
        '@type': 'WebSite',
        name: SITE_NAME,
        alternateName: ['oxlint tailwindcss', 'oxlint Tailwind CSS plugin'],
        url: `${SITE_URL}/`,
        inLanguage: ['en', 'es'],
      }),
      jsonLd({
        '@type': 'SoftwareSourceCode',
        name: SITE_NAME,
        description,
        url: `${SITE_URL}/`,
        codeRepository: REPO_URL,
        programmingLanguage: 'TypeScript',
        runtimePlatform: 'oxlint',
        license: 'https://opensource.org/licenses/MIT',
      }),
    )
  }
  if (isRulePage(relativePath)) {
    head.push(breadcrumb(relativePath, relativePath.replace(/^.*\//, '').replace(/\.md$/, '')))
  }
  return head
}
