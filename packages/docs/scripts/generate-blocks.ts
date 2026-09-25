/**
 * Write the blocks `blocks.ts` renders from the rules' `meta.docs` into the
 * docs and the READMEs. Run by `pnpm -C packages/docs generate`, which formats
 * the files afterwards; docs.yml fails when the result isn't committed.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  recommendedConfig,
  replaceBlock,
  ruleList,
  shadcnConfig,
  shadcnTable,
  type RuleForBlocks,
  type ShadcnData,
} from './blocks.ts'
import { RULE_NAMES, oxlintPlugin } from './rules.ts'

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(DOCS, '../..')

const rules: RuleForBlocks[] = RULE_NAMES.map((name) => {
  const docs = oxlintPlugin.rules[name].meta?.docs as Omit<RuleForBlocks, 'name'>
  return { name, category: docs.category, recommended: docs.recommended }
})

function update(path: string, blocks: Record<string, string>): void {
  let text = readFileSync(path, 'utf-8')
  for (const [id, content] of Object.entries(blocks)) text = replaceBlock(text, id, content)
  writeFileSync(path, text)
}

update(resolve(REPO, 'README.md'), { 'rule-list': ruleList(rules, 'en') })
update(resolve(REPO, 'packages/oxlint-tailwindcss/README.md'), {
  'full-config': recommendedConfig(rules, { locale: 'en', all: true }),
})
update(resolve(DOCS, 'setup.md'), {
  'recommended-config': recommendedConfig(rules, { locale: 'en', all: false, schema: true }),
})
update(resolve(DOCS, 'es/setup.md'), {
  'recommended-config': recommendedConfig(rules, { locale: 'es', all: false, schema: true }),
})
const shadcn = JSON.parse(
  readFileSync(resolve(DOCS, 'data/shadcn-lint.json'), 'utf-8'),
) as ShadcnData
for (const locale of ['en', 'es'] as const) {
  update(resolve(DOCS, locale === 'en' ? 'shadcn.md' : 'es/shadcn.md'), {
    'shadcn-table': shadcnTable(shadcn, locale),
    'shadcn-config': shadcnConfig(shadcn, rules, locale),
  })
}
console.log('[generate-blocks] wrote 6 files')
