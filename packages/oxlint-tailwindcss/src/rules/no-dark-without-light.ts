import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { extractVariants, extractUtility, splitImportant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'

interface Options {
  variants?: string[]
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

// Utilities that set the SAME CSS property under different bare names. The
// prefix heuristic can't group these (`block` and `hidden` share no prefix), so
// `block dark:hidden` — the idiomatic "show in light, hide in dark" — would
// wrongly report a missing base. Map each to a shared property group (R-M5).
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

    function check(locations: ClassLocation[]) {
      const watchedVariants = getWatchedVariants()
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        // Collect utility prefixes that have a base (no watched variant)
        const basePrefixes = new Set<string>()
        // Collect classes that have a watched variant
        const variantClasses: Array<{ cls: string; variant: string; prefix: string }> = []

        for (const cls of classes) {
          const variants = extractVariants(cls)
          const utility = extractUtility(cls)
          const prefix = getUtilityPrefix(utility)

          const hasWatchedVariant = variants.some((v) => watchedVariants.has(v))

          if (hasWatchedVariant) {
            const variant = variants.find((v) => watchedVariants.has(v))!
            variantClasses.push({ cls, variant, prefix })
          } else {
            basePrefixes.add(prefix)
          }
        }

        // Report variant classes that don't have a matching base
        for (const { cls, variant, prefix } of variantClasses) {
          if (!basePrefixes.has(prefix)) {
            context.report({
              node: loc.node,
              messageId: 'missingBase',
              data: { className: cls, variant, prefix },
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
