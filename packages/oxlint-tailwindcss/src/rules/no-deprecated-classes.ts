import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { reattachImportant, splitImportant, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { softGetDS } from '../utils/fatal'
import { makeReplacementGuard } from '../utils/replacement'

/**
 * Fallback rename map, for when no design system is available.
 *
 * With an `entryPoint` configured the rule uses the map the precompute derives
 * from `canonicalizeCandidates`, which is strictly better: it covers the renames
 * this list misses (`break-words`, `order-none`, the reordered
 * `bg-left-top`/`object-left-top` position spellings) and it prunes itself when a
 * Tailwind release stops compiling one of them. This table only has to keep the
 * unconfigured case working exactly as it did.
 */
export const DEPRECATED_MAP: Record<string, string> = {
  'flex-grow': 'grow',
  'flex-grow-0': 'grow-0',
  'flex-shrink': 'shrink',
  'flex-shrink-0': 'shrink-0',
  'overflow-ellipsis': 'text-ellipsis',
  'decoration-slice': 'box-decoration-slice',
  'decoration-clone': 'box-decoration-clone',
  'bg-gradient-to-t': 'bg-linear-to-t',
  'bg-gradient-to-tr': 'bg-linear-to-tr',
  'bg-gradient-to-r': 'bg-linear-to-r',
  'bg-gradient-to-br': 'bg-linear-to-br',
  'bg-gradient-to-b': 'bg-linear-to-b',
  'bg-gradient-to-bl': 'bg-linear-to-bl',
  'bg-gradient-to-l': 'bg-linear-to-l',
  'bg-gradient-to-tl': 'bg-linear-to-tl',
}

export const noDeprecatedClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow deprecated Tailwind CSS v4 classes',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{}],
    messages: {
      deprecated: '"{{className}}" is deprecated in Tailwind v4. Use "{{replacement}}" instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    // DS-OPTIONAL (see `softGetDS`): the hardcoded map above stands in when no
    // entry point is configured, so this rule keeps working with no CSS
    // configured and never reports `designSystemUnavailable`.
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = softGetDS(getDS)
      const cache = ds ? ds.cache : null
      const replacementFor = (bare: string): string | null =>
        cache?.hasDeprecatedMap ? cache.deprecatedReplacement(bare) : (DEPRECATED_MAP[bare] ?? null)
      const isUsable = makeReplacementGuard(cache)

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const offending = split.classes.flatMap((cls) => {
          const { utility, variant } = splitUtilityAndVariant(cls)
          const { bare: bareUtility, position } = splitImportant(utility)
          const replacement = replacementFor(bareUtility)
          if (!replacement) return []
          const rebuilt = variant + reattachImportant(replacement, position)
          return isUsable(rebuilt) ? [{ cls, replacement: rebuilt }] : []
        })
        reportClassReplacements(context, loc, split, split.classes, offending, {
          messageId: 'deprecated',
        })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
