import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import {
  extractVariants,
  extractUtility,
  isUserValued,
  splitImportant,
} from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { resolveDeclarationsSync } from '../design-system/declaration-service'
import { softGetDS } from '../utils/fatal'
import { createLazyOptions } from '../utils/context'

interface Options {
  variants?: string[]
  entryPoint?: string
}

const DEFAULT_VARIANTS = ['dark']

// Multi-part prefixes, sorted longest-first so longer matches take priority
const KNOWN_PREFIXES = [
  'rounded-tl',
  'rounded-tr',
  'rounded-bl',
  'rounded-br',
  'rounded-ss',
  'rounded-se',
  'rounded-es',
  'rounded-ee',
  'ring-offset',
  'border-t',
  'border-b',
  'border-l',
  'border-r',
  'border-s',
  'border-e',
  'border-x',
  'border-y',
  'rounded-t',
  'rounded-b',
  'rounded-l',
  'rounded-r',
  'rounded-s',
  'rounded-e',
  'divide-x',
  'divide-y',
  'scroll-m',
  'scroll-p',
  'from',
  'via',
  'to',
]

// Utilities that set the SAME CSS property under different bare names, for when
// no design system is available. The prefix heuristic can't group these (`block`
// and `hidden` share no prefix), so `block dark:hidden` — the idiomatic "show in
// light, hide in dark" — would wrongly report a missing base (R-M5).
//
// With an entry point configured this is redundant: the properties each class
// declares are read from the design system, which covers these two groups and
// every other same-property pair a list like this would have to enumerate
// (`underline`/`no-underline`, `italic`/`not-italic`, `visible`/`invisible`,
// `uppercase`/`normal-case`, `truncate`/`text-clip`, `sr-only`/`not-sr-only`…).
const PROPERTY_GROUP_BY_UTILITY: Record<string, string> = {}
for (const u of [
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'flow-root',
  'contents',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-row',
  'table-row-group',
  'table-header-group',
  'table-footer-group',
  'table-column',
  'table-column-group',
  'list-item',
  'hidden',
]) {
  PROPERTY_GROUP_BY_UTILITY[u] = 'display'
}
for (const u of ['static', 'fixed', 'absolute', 'relative', 'sticky']) {
  PROPERTY_GROUP_BY_UTILITY[u] = 'position'
}

/**
 * Maps a utility to a key identifying the CSS property it sets, so a base and a
 * variant class for the same property group together. Exact-match equivalence
 * groups (display, position) win; otherwise fall back to the prefix heuristic
 * (e.g. "bg" from "bg-gray-900", "text" from "text-white").
 */
function getUtilityPrefix(utility: string): string {
  let u = splitImportant(utility).bare
  if (u.startsWith('-')) u = u.slice(1)

  const group = PROPERTY_GROUP_BY_UTILITY[u]
  if (group) return group

  for (const prefix of KNOWN_PREFIXES) {
    if (u === prefix || u.startsWith(`${prefix}-`)) return prefix
  }

  const dashIdx = u.indexOf('-')
  return dashIdx >= 0 ? u.slice(0, dashIdx) : u
}

export const noDarkWithoutLight = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a base (light) utility when using dark: (or other scheme) variant',
    },
    schema: [
      {
        type: 'object',
        properties: {
          variants: { type: 'array', items: { type: 'string' } },
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ variants: DEFAULT_VARIANTS }],
    messages: {
      missingBase:
        '"{{className}}" uses the {{variant}} variant, but there is no base "{{prefix}}-*" class on this element.',
    },
  },
  createOnce(context) {
    const getWatchedVariants = createLazyOptions<Options, Set<string>>(
      context,
      (o) => new Set(o?.variants ?? DEFAULT_VARIANTS),
    )

    // DS-OPTIONAL (see `softGetDS`): with an entry point the rule also groups by
    // the CSS properties each class declares, which is the only way to know that
    // `underline` and `no-underline` are the same concern. Without one it falls
    // back to the prefix heuristic alone, exactly as before.
    const getDS = createLazyLoader(context)

    const bareOf = (cls: string) => splitImportant(extractUtility(cls)).bare

    function check(locations: ClassLocation[]) {
      const watchedVariants = getWatchedVariants()
      const ds = softGetDS(getDS)
      const cache = ds ? ds.cache : null

      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        // Classes whose value the user wrote have no precomputed declarations;
        // resolving them keeps the property grouping from silently degrading to
        // prefix-only for `dark:bg-[#111]`. Allocates nothing when every class is
        // precomputed — this runs on every AST node.
        if (cache && ds) {
          let unresolved: string[] | null = null
          for (const cls of classes) {
            const bare = bareOf(cls)
            if (cache.getCssProperties(bare).length > 0 || !isUserValued(bare)) continue
            if (!unresolved) unresolved = []
            unresolved.push(bare)
          }
          if (unresolved) resolveDeclarationsSync(ds.entryPoint, cache, unresolved)
        }

        // A base is a class with no watched variant. Two ways to be the base for
        // a variant class: the same utility prefix (`bg-white` for
        // `dark:bg-black`), or the same declared CSS property (`underline` for
        // `dark:no-underline`, which share no prefix at all). The union is what
        // makes this strictly less trigger-happy than the prefix check alone.
        const basePrefixes = new Set<string>()
        const baseProperties = new Set<string>()
        const variantClasses: Array<{
          cls: string
          variant: string
          prefix: string
          properties: readonly string[]
        }> = []

        for (const cls of classes) {
          const variants = extractVariants(cls)
          const utility = extractUtility(cls)
          const prefix = getUtilityPrefix(utility)
          const properties = cache ? cache.getCssProperties(bareOf(cls)) : []

          const variant = variants.find((v) => watchedVariants.has(v))

          if (variant !== undefined) {
            variantClasses.push({ cls, variant, prefix, properties })
          } else {
            basePrefixes.add(prefix)
            for (const property of properties) baseProperties.add(property)
          }
        }

        for (const { cls, variant, prefix, properties } of variantClasses) {
          if (basePrefixes.has(prefix)) continue
          if (properties.some((property) => baseProperties.has(property))) continue
          context.report({
            node: loc.node,
            messageId: 'missingBase',
            data: { className: cls, variant, prefix },
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
