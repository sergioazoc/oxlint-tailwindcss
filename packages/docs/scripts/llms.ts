/**
 * `llms.txt`, `llms-full.txt` and a markdown copy of every page — the docs in
 * the form language models and agent tools read best. Pure functions of the
 * pages; `.vitepress/config.ts` calls `writeLlmsFiles` from `buildEnd`.
 *
 * Format: https://llmstxt.org — an H1 with the project name, a one-paragraph
 * summary in a blockquote, then H2 sections of `[title](url): description`
 * links. Links point at the markdown copies (`/setup.md`), which carry the
 * same content as the HTML page without the site chrome.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SITE_URL, markdownPath } from '../.vitepress/seo.ts'
import { parseFrontmatter, plainText } from './rule-page.ts'

export interface DocPage {
  /** Source path relative to the docs root: `setup.md`, `es/rules/index.md`. */
  path: string
  title: string
  description: string
  /** The page's markdown without frontmatter. */
  body: string
}

export const isSpanish = (path: string) => path.startsWith('es/')
const isRule = (path: string) => /^rules\/(?!index\.md$)[^/]+\.md$/.test(path)

/** Order of the English guides in `llms.txt`; anything unlisted follows, sorted. */
const GUIDE_ORDER = [
  'index.md',
  'setup.md',
  'frameworks.md',
  'settings.md',
  'monorepo.md',
  'ci.md',
  'interop.md',
  'rules/index.md',
  'migration/v0-to-v1.md',
]

function byGuideOrder(a: DocPage, b: DocPage): number {
  const rank = (p: DocPage) => {
    const i = GUIDE_ORDER.indexOf(p.path)
    return i === -1 ? GUIDE_ORDER.length : i
  }
  return rank(a) - rank(b) || a.path.localeCompare(b.path)
}

/** A rule is listed by its name; a guide by its title. */
const label = (page: DocPage) =>
  isRule(page.path) ? page.path.slice('rules/'.length, -'.md'.length) : page.title

const link = (page: DocPage) =>
  `- [${label(page)}](${SITE_URL}${markdownPath(page.path)}): ${plainText(page.description)}`

export function buildLlmsTxt(pages: DocPage[], summary: string): string {
  const english = pages.filter((p) => !isSpanish(p.path))
  const guides = english.filter((p) => !isRule(p.path)).sort(byGuideOrder)
  const rules = english.filter((p) => isRule(p.path)).sort((a, b) => a.path.localeCompare(b.path))
  const spanishHome = pages.find((p) => p.path === 'es/index.md')
  return [
    '# oxlint-tailwindcss',
    '',
    `> ${summary}`,
    '',
    'Install with `npm install -D oxlint-tailwindcss` (or pnpm, yarn, bun), add it to `jsPlugins` in',
    '`.oxlintrc.json`, and point `settings.tailwindcss.entryPoint` at the CSS file that imports',
    'Tailwind. Every rule is documented below; each link is the page as markdown.',
    '',
    '## Docs',
    '',
    ...guides.map(link),
    '',
    '## Rules',
    '',
    ...rules.map(link),
    '',
    '## Optional',
    '',
    `- [llms-full.txt](${SITE_URL}/llms-full.txt): every English page above in one file`,
    ...(spanishHome
      ? [
          `- [Documentación en español](${SITE_URL}${markdownPath(spanishHome.path)}): ${plainText(spanishHome.description)}`,
        ]
      : []),
    '- [Changelog](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/packages/oxlint-tailwindcss/CHANGELOG.md): release notes',
    '- [npm](https://www.npmjs.com/package/oxlint-tailwindcss): the package',
    '',
  ].join('\n')
}

export function buildLlmsFull(pages: DocPage[], summary: string): string {
  const english = pages.filter((p) => !isSpanish(p.path)).sort(byGuideOrder)
  const sections = english.map(
    (p) => `<!-- ${SITE_URL}${markdownPath(p.path)} -->\n\n${markdownCopy(p).trim()}\n`,
  )
  return [`# oxlint-tailwindcss\n\n> ${summary}\n`, ...sections].join('\n---\n\n')
}

/** A source page as it is published in markdown: no frontmatter, starting at its H1. */
export function markdownCopy(page: DocPage): string {
  const body = page.body.trim() || plainText(page.description)
  return `${body.startsWith('# ') ? body : `# ${page.title}\n\n${body}`}\n`
}

/** Read the published source pages from `srcDir` (paths as VitePress lists them). */
export function readPages(srcDir: string, sourcePaths: string[]): DocPage[] {
  return sourcePaths.map((path) => {
    const { data, body } = parseFrontmatter(readFileSync(join(srcDir, path), 'utf8'))
    return { path, title: data.title ?? path, description: data.description ?? '', body }
  })
}

export function writeLlmsFiles(outDir: string, pages: DocPage[], summary: string): void {
  writeFileSync(join(outDir, 'llms.txt'), buildLlmsTxt(pages, summary))
  writeFileSync(join(outDir, 'llms-full.txt'), buildLlmsFull(pages, summary))
  for (const page of pages) {
    const target = join(outDir, markdownPath(page.path))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, markdownCopy(page))
  }
}
