/**
 * `meta.docs` for every rule, typed — the single source the docs site, the
 * READMEs and the recommended configs are generated from, and that
 * `tests/docs/docs-sync.test.ts` checks against what each rule actually does.
 */

export type RuleCategory = 'correctness' | 'design-system' | 'modernization' | 'consistency'

/**
 * How a rule uses the design system:
 * - `required`: it can't run without one and reports `designSystemUnavailable`;
 * - `optional`: it reads one when configured and has a static fallback;
 * - `none`: it never loads one.
 */
export type DesignSystemUse = 'required' | 'optional' | 'none'

// A type alias, not an interface: aliases stay assignable to oxlint's
// index-signature `RuleDocs` without declaring one (which would break `Omit`).
export type TailwindRuleDocs = {
  description: string
  category: RuleCategory
  /** Severity in the recommended config, or `false` when it's off there. */
  recommended: 'error' | 'warn' | false
  designSystem: DesignSystemUse
  /**
   * Also done by oxfmt's `sortTailwindcss` for class attributes and configured
   * functions (sorting, duplicates, whitespace) — kept, but not grown further.
   */
  formatterOverlap?: 'oxfmt'
  /**
   * Its heuristics may still change in a minor release. Always off in the
   * recommended config; the docs say so on its page and in the rule lists.
   */
  experimental?: true
  url: string
}

export const DOCS_URL = 'https://oxlint-tailwindcss.pages.dev'

export function ruleDocs(name: string, docs: Omit<TailwindRuleDocs, 'url'>): TailwindRuleDocs {
  return { ...docs, url: `${DOCS_URL}/rules/${name}` }
}
