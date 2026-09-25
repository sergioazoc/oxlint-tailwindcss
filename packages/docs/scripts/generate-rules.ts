/**
 * Generate one Markdown page per rule, per locale, from the library's rule
 * registry and the hand-written `<locale>/rules/_extras/<rule>.md` files.
 *
 * The rendering lives in `rule-page.ts` (pure, tested); this is the thin CLI
 * that reads the files and writes `rules/<rule>.md` and `es/rules/<rule>.md`.
 * A missing `_extras` file, or one without a `description`, fails the run.
 *
 * Run via `pnpm -C packages/docs generate` (or implicitly via build).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderRulePage, type Locale } from './rule-page.ts'
import { RULE_NAMES, oxlintPlugin } from './rules.ts'

const DOCS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function main(): void {
  for (const locale of ['en', 'es'] as const satisfies readonly Locale[]) {
    const rulesDir = resolve(DOCS_ROOT, locale === 'en' ? '' : 'es', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    for (const name of RULE_NAMES) {
      const extras = readFileSync(resolve(rulesDir, '_extras', `${name}.md`), 'utf-8')
      const page = renderRulePage({
        name,
        meta: oxlintPlugin.rules[name].meta ?? {},
        extras,
        locale,
      })
      writeFileSync(resolve(rulesDir, `${name}.md`), page, 'utf-8')
    }
  }
  console.log(`[generate-rules] wrote ${RULE_NAMES.length * 2} pages`)
}

main()
