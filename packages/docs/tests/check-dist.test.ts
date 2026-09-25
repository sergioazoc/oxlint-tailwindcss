import { describe, expect, it } from 'vitest'
import { SITE_NAME, SITE_URL, pageHead, siteHead } from '../.vitepress/seo.ts'
import { checkDist, type DistFiles } from '../scripts/check-dist.ts'

type Entry = [string, Record<string, string>, string?]
const render = ([tag, attrs, inner]: Entry) => {
  const a = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')
  return tag === 'script' ? `<script${a}>${inner}</script>` : `<${tag}${a}>`
}

/** A built page the way VitePress + seo.ts produce it. */
function html(source: string, title: string, description: string, body = '<p>Body</p>'): string {
  const lang = source.startsWith('es/') ? 'es' : 'en'
  const head = [...siteHead(), ...pageHead({ relativePath: source, title, description })] as Entry[]
  return `<!DOCTYPE html><html lang="${lang}" dir="ltr"><head><title>${title}</title><meta name="description" content="${description}">${head.map(render).join('')}</head><body>${body}</body></html>`
}

const PAGES: [string, string, string][] = [
  ['index.md', 'Home | x', 'The home page of the site, in English.'],
  ['es/index.md', 'Inicio | x', 'La página de inicio del sitio, en español.'],
  ['rules/foo.md', 'foo — rule | x', 'An English rule page about foo.'],
  ['es/rules/foo.md', 'foo — regla | x', 'Una página de regla en español sobre foo.'],
]

function site(): DistFiles {
  const files: DistFiles = new Map()
  const locs: string[] = []
  for (const [source, title, description] of PAGES) {
    files.set(source.replace(/\.md$/, '.html'), html(source, title, description))
    files.set(source, `# ${title}\n`)
    locs.push(
      pageHead({ relativePath: source, title, description }).find(
        (e) => e[1].rel === 'canonical',
      )![1].href,
    )
  }
  files.set(
    '404.html',
    '<html lang="en"><head><title>404</title><meta name="robots" content="noindex"></head></html>',
  )
  files.set(
    'sitemap.xml',
    `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`,
  )
  files.set('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`)
  files.set('llms.txt', '# x\n')
  files.set('llms-full.txt', '# x\n')
  return files
}

const edit = (files: DistFiles, file: string, from: string | RegExp, to: string) => {
  const before = files.get(file)!
  const after = before.replace(from, to)
  expect(after, `edit of ${file} applied`).not.toBe(before)
  files.set(file, after)
  return files
}

describe('checkDist', () => {
  it('passes a well-formed site', () => {
    expect(checkDist(site())).toEqual([])
  })

  // One case per class of failure: the check must name it.
  const cases: [string, (f: DistFiles) => DistFiles, RegExp][] = [
    [
      'an internal page',
      (f) => f.set('rules/_extras/foo.html', '<html></html>'),
      /internal file published/,
    ],
    ['agent notes', (f) => f.set('CLAUDE.html', '<html></html>'), /internal file published/],
    [
      'a wrong <html lang>',
      (f) => edit(f, 'es/index.html', 'lang="es"', 'lang="es-ES"'),
      /lang="es-ES"/,
    ],
    [
      'a missing description',
      (f) => edit(f, 'index.html', /<meta name="description"[^>]*>/, ''),
      /no meta description/,
    ],
    [
      'an overlong description',
      (f) => edit(f, 'rules/foo.html', 'An English rule page about foo.', 'x'.repeat(161)),
      /161 characters/,
    ],
    [
      'a duplicate title',
      (f) => edit(f, 'rules/foo.html', '<title>foo — rule | x</title>', '<title>Home | x</title>'),
      /same title as/,
    ],
    [
      'a Spanish description copied from English',
      (f) =>
        edit(
          f,
          'es/rules/foo.html',
          /<meta name="description" content="[^"]*">/,
          '<meta name="description" content="An English rule page about foo.">',
        ),
      /copied from English/,
    ],
    [
      'a wrong canonical',
      (f) =>
        edit(
          f,
          'rules/foo.html',
          /rel="canonical" href="[^"]*"/,
          'rel="canonical" href="https://x/"',
        ),
      /canonical is/,
    ],
    [
      'a missing og tag',
      (f) => edit(f, 'index.html', /<meta property="og:image"[^>]*>/, ''),
      /no og:image/,
    ],
    ['a missing counterpart', (f) => (f.delete('es/rules/foo.html'), f), /no Spanish counterpart/],
    [
      'a broken hreflang',
      (f) =>
        edit(f, 'rules/foo.html', /hreflang="es" href="[^"]*"/, 'hreflang="es" href="https://x/"'),
      /hreflang es is/,
    ],
    [
      'an unrendered container',
      (f) => edit(f, 'index.html', '<p>Body</p>', '<p>::: warning Oops</p>'),
      /unrendered ::: container/,
    ],
    [
      'a rule page without breadcrumbs',
      (f) => edit(f, 'rules/foo.html', /BreadcrumbList/, 'Thing'),
      /without BreadcrumbList/,
    ],
    ['a missing markdown copy', (f) => (f.delete('rules/foo.md'), f), /no markdown copy/],
    [
      'no WebSite JSON-LD on the home page',
      (f) => edit(f, 'index.html', /"@type":"WebSite"/, '"@type":"Thing"'),
      /no WebSite JSON-LD/,
    ],
    [
      'a WebSite name that disagrees with og:site_name',
      (f) =>
        edit(
          f,
          'index.html',
          `"name":"${SITE_NAME}","alternateName"`,
          '"name":"Cloudflare","alternateName"',
        ),
      /WebSite name "Cloudflare"/,
    ],
    [
      'a 404 that can be indexed',
      (f) => edit(f, '404.html', /<meta name="robots"[^>]*>/, ''),
      /not noindex/,
    ],
    [
      'a sitemap missing a page',
      (f) => edit(f, 'sitemap.xml', /<url><loc>[^<]*\/rules\/foo<\/loc><\/url>/, ''),
      /missing https/,
    ],
    [
      'a sitemap listing a non-canonical URL',
      (f) => edit(f, 'sitemap.xml', '</urlset>', '<url><loc>https://x/old</loc></url></urlset>'),
      /non-canonical/,
    ],
    [
      'robots.txt without the sitemap',
      (f) => edit(f, 'robots.txt', /Sitemap: .*/, ''),
      /no Sitemap line/,
    ],
    ['a missing llms.txt', (f) => (f.delete('llms.txt'), f), /llms\.txt: missing/],
    [
      'a link to a heading that does not exist',
      (f) =>
        edit(f, 'index.html', '<p>Body</p>', '<p><a href="/rules/foo#options">Options</a></p>'),
      /index\.html: link to \/rules\/foo#options: no such heading/,
    ],
    [
      'a same-page link to a heading that does not exist',
      (f) => edit(f, 'index.html', '<p>Body</p>', '<p><a href="#nope">x</a></p>'),
      /index\.html: link to #nope: no such heading/,
    ],
  ]

  it('accepts links to headings that exist, on this page or another', () => {
    const files = site()
    edit(files, 'rules/foo.html', '<p>Body</p>', '<h2 id="options">Options</h2>')
    edit(
      files,
      'index.html',
      '<p>Body</p>',
      '<h2 id="intro">x</h2><a href="#intro">x</a> <a href="/rules/foo#options">y</a> <a href="/es/#top">z</a>',
    )
    edit(files, 'es/index.html', '<p>Body</p>', '<p id="top">x</p>')
    expect(checkDist(files)).toEqual([])
  })

  it.each(cases)('catches %s', (_, mutate, message) => {
    const problems = checkDist(mutate(site()))
    expect(
      problems.some((p) => message.test(p)),
      problems.join('\n'),
    ).toBe(true)
  })
})
