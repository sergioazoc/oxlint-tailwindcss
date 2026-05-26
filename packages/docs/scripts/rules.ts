/**
 * Shared rule registry for the docs site.
 *
 * Both `generate-rules.ts` (which writes the rule markdown pages) and
 * `.vitepress/config.ts` (which builds the sidebar) read from here. Keeping
 * the registry in one place means a new rule landing in the library appears
 * in both the pages AND the sidebar with zero hand-editing — `Object.keys`
 * on the plugin's registry is the source of truth.
 *
 * Requires the library to be built first (`pnpm -C ../oxlint-tailwindcss
 * build`). Both the `dev` and `build` scripts of this package run that
 * prerequisite ahead of any consumer.
 */

import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface RuleMeta {
  type?: string
  docs?: { description?: string }
  fixable?: 'code' | 'whitespace'
  hasSuggestions?: boolean
  schema?: unknown
  defaultOptions?: unknown[]
  messages?: Record<string, string>
}

export interface RuleExport {
  meta?: RuleMeta
}

interface PluginShape {
  meta?: { name?: string }
  rules: Record<string, RuleExport>
}

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB_DIST = resolve(HERE, '../../oxlint-tailwindcss/dist/index.cjs')

const require_ = createRequire(import.meta.url)
export const oxlintPlugin = require_(LIB_DIST) as PluginShape

/**
 * Every rule shipped by the library, in plugin registration order.
 * `definePlugin` preserves insertion order, so this matches `src/index.ts`.
 */
export const RULE_NAMES: string[] = Object.keys(oxlintPlugin.rules)
