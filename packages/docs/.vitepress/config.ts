import { defineConfig } from 'vitepress'
import { RULE_NAMES } from '../scripts/rules'

// Sidebar entries derive from the library's plugin registry — adding a rule
// to `src/index.ts` makes it visible in both locales' sidebars with no
// hand-editing here.
const RULES_NAV = RULE_NAMES.map((name) => ({ text: name, link: `/rules/${name}` }))

// Multi-locale VitePress v2 config. English is the default at `/`,
// Spanish lives at `/es`. The sidebar and nav structures mirror each
// other so users can switch locale at any depth without losing context.
export default defineConfig({
  title: 'oxlint-tailwindcss',
  description:
    'Tailwind CSS linting rules for oxlint — fast, deterministic, designed for Tailwind v4.',

  // Same sitemap regardless of locale prefix.
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Setup', link: '/setup' },
          { text: 'Rules', link: '/rules/' },
          { text: 'Migration', link: '/migration/v0-to-v1' },
          {
            text: 'v1.0.0',
            items: [
              { text: 'Changelog', link: 'https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/packages/oxlint-tailwindcss/CHANGELOG.md' },
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
              ],
            },
            {
              text: 'Reference',
              items: [
                { text: 'Settings', link: '/settings' },
                { text: 'Monorepo', link: '/monorepo' },
                { text: 'Interop (oxfmt, prettier-plugin)', link: '/interop' },
              ],
            },
            {
              text: 'Rules',
              link: '/rules/',
              items: RULES_NAV,
            },
            {
              text: 'Migration',
              items: [{ text: 'v0 → v1', link: '/migration/v0-to-v1' }],
            },
          ],
        },
      },
    },
    es: {
      label: 'Español',
      lang: 'es-ES',
      link: '/es/',
      themeConfig: {
        nav: [
          { text: 'Setup', link: '/es/setup' },
          { text: 'Reglas', link: '/es/rules/' },
          { text: 'Migración', link: '/es/migration/v0-to-v1' },
        ],
        sidebar: {
          '/es/': [
            {
              text: 'Empezar',
              items: [
                { text: 'Introducción', link: '/es/' },
                { text: 'Setup', link: '/es/setup' },
              ],
            },
            {
              text: 'Referencia',
              items: [
                { text: 'Settings', link: '/es/settings' },
                { text: 'Monorepo', link: '/es/monorepo' },
                { text: 'Interop (oxfmt, prettier-plugin)', link: '/es/interop' },
              ],
            },
            {
              text: 'Reglas',
              link: '/es/rules/',
              items: RULES_NAV.map((r) => ({ ...r, link: `/es${r.link}` })),
            },
            {
              text: 'Migración',
              items: [{ text: 'v0 → v1', link: '/es/migration/v0-to-v1' }],
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
    search: { provider: 'local' },
    editLink: {
      pattern:
        'https://github.com/sergioazoc/oxlint-tailwindcss/edit/main/packages/docs/:path',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright:
        'Copyright © 2026–present <a href="https://sergioazocar.com" target="_blank" rel="noopener">Sergio Azócar</a>',
    },
  },
})
