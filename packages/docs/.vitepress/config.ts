import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
// Extension included on purpose: Vite's native config loader (the planned
// default) cannot resolve an extensionless relative import, and warns about
// this one on every build.
import { RULE_NAMES } from '../scripts/rules.ts'
import { readPages, writeLlmsFiles } from '../scripts/llms.ts'
import { SITE_NAME, SITE_URL, pageHead, siteHead, sitemapItems } from './seo.ts'

// Read the published package version so the nav label never drifts from the
// real release. Resolved relative to this file, not the build cwd.
const PKG_VERSION = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../oxlint-tailwindcss/package.json', import.meta.url)),
    'utf-8',
  ),
).version as string

// Sidebar entries derive from the library's plugin registry — adding a rule
// to `src/index.ts` makes it visible in both locales' sidebars with no
// hand-editing here.
const RULES_NAV = RULE_NAMES.map((name) => ({ text: name, link: `/rules/${name}` }))

/**
 * "Edit this page" target. A rule page (`rules/<name>.md`, `es/rules/<name>.md`)
 * is GENERATED from the rule's metadata plus the hand-written
 * `rules/_extras/<name>.md`, so that is the file to edit — an edit to the page
 * itself is overwritten by the next `pnpm generate`. Everything under `rules/`
 * except `index.md` is generated (`tests/docs` holds that).
 *
 * VitePress serializes this function into the client bundle: it must not close
 * over anything in this module.
 */
function editLinkFor({ filePath }: { filePath: string }): string {
  const base = 'https://github.com/sergioazoc/oxlint-tailwindcss/edit/main/packages/docs'
  const m = /^((?:es\/)?rules)\/([^/]+)\.md$/.exec(filePath)
  if (m && m[2] !== 'index') return `${base}/${m[1]}/_extras/${m[2]}.md`
  return `${base}/${filePath}`
}

// Multi-locale VitePress v2 config. English is the default at `/`,
// Spanish lives at `/es`. The sidebar and nav structures mirror each
// other so users can switch locale at any depth without losing context.
export default defineConfig({
  title: SITE_NAME,
  description:
    'Tailwind CSS linting rules for oxlint — fast, deterministic, designed for Tailwind v4.',

  // Site-wide <head>: favicon, og:site_name, the preview image. Per-page
  // canonical, hreflang, og:* and JSON-LD come from `transformHead`; both are
  // defined (and tested) in ./seo.ts.
  head: siteHead(),
  sitemap: { hostname: SITE_URL, transformItems: sitemapItems },
  // llms.txt, llms-full.txt and a markdown copy of every page (scripts/llms.ts).
  // The summary is the home page's own description.
  buildEnd: ({ srcDir, outDir, pages }) => {
    const docs = readPages(srcDir, pages)
    const home = docs.find((p) => p.path === 'index.md')
    writeLlmsFiles(outDir, docs, home?.description ?? '')
  },
  transformHead: ({ pageData, title, description }) =>
    pageHead({
      relativePath: pageData.relativePath,
      title,
      description,
      isNotFound: pageData.isNotFound,
    }),

  // Same sitemap regardless of locale prefix.
  cleanUrls: true,
  lastUpdated: true,
  // A dead internal link fails the build.
  ignoreDeadLinks: false,
  // Inputs to the generator and notes for agents working on the docs — not
  // pages. Without this VitePress published every `_extras` fragment as a page.
  srcExclude: ['**/_extras/**', 'AGENTS.md', 'CLAUDE.md'],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Setup', link: '/setup' },
          { text: 'Rules', link: '/rules/' },
          { text: 'FAQ', link: '/faq' },
          { text: 'Migration', link: '/migration/v0-to-v1' },
          {
            text: `v${PKG_VERSION}`,
            items: [
              {
                text: 'Changelog',
                link: 'https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/packages/oxlint-tailwindcss/CHANGELOG.md',
              },
              { text: 'npm', link: 'https://www.npmjs.com/package/oxlint-tailwindcss' },
            ],
          },
        ],
        sidebar: {
          '/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/' },
                { text: 'Setup', link: '/setup' },
                { text: 'FAQ', link: '/faq' },
              ],
            },
            {
              text: 'Guides',
              items: [
                { text: 'Vue, Svelte & Astro', link: '/frameworks' },
                { text: 'Monorepo', link: '/monorepo' },
                { text: 'Running in CI', link: '/ci' },
                { text: 'oxfmt & Prettier', link: '/interop' },
                { text: 'shadcn/ui & @shadcn/lint', link: '/shadcn' },
              ],
            },
            {
              text: 'Reference',
              items: [{ text: 'Settings', link: '/settings' }],
            },
            {
              text: 'Rules',
              link: '/rules/',
              items: RULES_NAV,
            },
            {
              text: 'Migration',
              items: [
                { text: 'v0 → v1', link: '/migration/v0-to-v1' },
                { text: 'From better-tailwindcss', link: '/migration/from-better-tailwindcss' },
              ],
            },
          ],
        },
      },
    },
    es: {
      label: 'Español',
      // Neutral Spanish, written for every Spanish-speaking reader.
      lang: 'es',
      link: '/es/',
      description:
        'Reglas de lint de Tailwind CSS para oxlint — rápidas, deterministas, pensadas para Tailwind v4.',
      themeConfig: {
        nav: [
          { text: 'Setup', link: '/es/setup' },
          { text: 'Reglas', link: '/es/rules/' },
          { text: 'Preguntas frecuentes', link: '/es/faq' },
          { text: 'Migración', link: '/es/migration/v0-to-v1' },
          {
            text: `v${PKG_VERSION}`,
            items: [
              {
                text: 'Changelog',
                link: 'https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/packages/oxlint-tailwindcss/CHANGELOG.md',
              },
              { text: 'npm', link: 'https://www.npmjs.com/package/oxlint-tailwindcss' },
            ],
          },
        ],
        editLink: { pattern: editLinkFor, text: 'Editar esta página en GitHub' },
        lastUpdated: { text: 'Última actualización' },
        docFooter: { prev: 'Página anterior', next: 'Página siguiente' },
        outline: { label: 'En esta página' },
        returnToTopLabel: 'Volver arriba',
        sidebarMenuLabel: 'Menú',
        darkModeSwitchLabel: 'Apariencia',
        lightModeSwitchTitle: 'Cambiar a tema claro',
        darkModeSwitchTitle: 'Cambiar a tema oscuro',
        langMenuLabel: 'Cambiar idioma',
        skipToContentLabel: 'Saltar al contenido',
        notFound: {
          title: 'PÁGINA NO ENCONTRADA',
          quote: 'Esta página no existe o se movió.',
          linkLabel: 'ir al inicio',
          linkText: 'Volver al inicio',
        },
        sidebar: {
          '/es/': [
            {
              text: 'Empezar',
              items: [
                { text: 'Introducción', link: '/es/' },
                { text: 'Setup', link: '/es/setup' },
                { text: 'Preguntas frecuentes', link: '/es/faq' },
              ],
            },
            {
              text: 'Guías',
              items: [
                { text: 'Vue, Svelte y Astro', link: '/es/frameworks' },
                { text: 'Monorepo', link: '/es/monorepo' },
                { text: 'En CI', link: '/es/ci' },
                { text: 'oxfmt y Prettier', link: '/es/interop' },
                { text: 'shadcn/ui y @shadcn/lint', link: '/es/shadcn' },
              ],
            },
            {
              text: 'Referencia',
              items: [{ text: 'Settings', link: '/es/settings' }],
            },
            {
              text: 'Reglas',
              link: '/es/rules/',
              items: RULES_NAV.map((r) => ({ ...r, link: `/es${r.link}` })),
            },
            {
              text: 'Migración',
              items: [
                { text: 'v0 → v1', link: '/es/migration/v0-to-v1' },
                { text: 'Desde better-tailwindcss', link: '/es/migration/from-better-tailwindcss' },
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    logo: undefined,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/sergioazoc/oxlint-tailwindcss' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/oxlint-tailwindcss' },
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          es: {
            translations: {
              button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
              modal: {
                displayDetails: 'Mostrar detalles',
                resetButtonTitle: 'Borrar búsqueda',
                backButtonTitle: 'Cerrar búsqueda',
                noResultsText: 'Sin resultados para',
                footer: {
                  selectText: 'para elegir',
                  selectKeyAriaLabel: 'Enter',
                  navigateText: 'para moverte',
                  navigateUpKeyAriaLabel: 'flecha arriba',
                  navigateDownKeyAriaLabel: 'flecha abajo',
                  closeText: 'para cerrar',
                  closeKeyAriaLabel: 'Escape',
                },
              },
            },
          },
        },
      },
    },
    editLink: { pattern: editLinkFor },
    footer: {
      message: 'Released under the MIT License.',
      copyright:
        'Copyright © 2026–present <a href="https://sergioazocar.com" target="_blank" rel="noopener">Sergio Azócar</a>',
    },
  },
})
