import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import {
  reattachImportant,
  splitImportant,
  splitUtilityAndVariant,
  utilityHasDynamicValue,
} from '../utils/class-parser'
import { createLazyLoader, rootFontSizeFromSettings } from '../design-system/loader'
import { canonicalizeClassesSync } from '../design-system/canonicalize-service'
import { safeSettings } from '../utils/context'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'

/**
 * Preserve the user's `!` position after canonicalization.
 *
 * `canonicalizeCandidates` normalizes `!` to suffix; this restores the
 * original prefix-or-suffix-or-none position so `enforce-consistent-important-position`
 * remains the single source of truth for ! placement policy.
 *
 * Bracket-aware via `splitUtilityAndVariant` — arbitrary variants like
 * `[&>svg]:!w-4` round-trip correctly.
 */
function preserveImportantPosition(original: string, canonicalized: string): string {
  const { position } = splitImportant(splitUtilityAndVariant(original).utility)
  const { utility, variant } = splitUtilityAndVariant(canonicalized)
  const bare = splitImportant(utility).bare
  return variant + reattachImportant(bare, position)
}

export const enforceCanonical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce canonical Tailwind CSS class names using canonicalizeCandidates()',
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
      nonCanonical: '"{{className}}" can be written as "{{canonical}}". Use the canonical form.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    let _rem: number | null = null
    function getRem(): number {
      if (_rem === null) {
        const settings = safeSettings(context)
        _rem = rootFontSizeFromSettings(settings)
      }
      return _rem
    }

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache, entryPoint } = ds

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes

        // Split the location into two buckets:
        //   - named classes → precomputed `canonicalMap` is ground truth,
        //     resolved via `cache.canonicalize` (sync, sub-microsecond).
        //   - classes with arbitrary/CSS-var values in the utility
        //     (`p-[2px]`, `bg-(--c)`) → need the async DS to canonicalize,
        //     routed through the worker.
        //
        // Keeping named classes out of the worker call avoids the round-trip
        // entirely for the majority of locations, and shrinks the payload for
        // the rest. The local cache preserves `!` position, so no
        // preserveImportantPosition step is needed on that path.
        const canonicals: string[] = Array.from({ length: classes.length })
        const arbitraryIdx: number[] = []
        const arbitrary: string[] = []

        for (let i = 0; i < classes.length; i++) {
          if (utilityHasDynamicValue(classes[i])) {
            arbitraryIdx.push(i)
            arbitrary.push(classes[i])
          } else {
            canonicals[i] = cache.canonicalize(classes[i])
          }
        }

        if (arbitrary.length > 0) {
          const rem = getRem()
          // Worker provides the authoritative canonicalization for arbitrary
          // values. Failures throw SortServiceError, surfaced as a fatal
          // diagnostic via safeGetDS — no heuristic fallback.
          const dynamic = safeGetDS(
            () => canonicalizeClassesSync(entryPoint, arbitrary, rem),
            context,
            loc.node,
          )
          if (!dynamic) return // worker fatal already reported; stop the check
          for (let k = 0; k < arbitrary.length; k++) {
            canonicals[arbitraryIdx[k]] = preserveImportantPosition(arbitrary[k], dynamic[k])
          }
        }

        const offending = classes.flatMap((cls, i) =>
          canonicals[i] === cls ? [] : [{ cls, replacement: canonicals[i] }],
        )
        reportClassReplacements(context, loc, split, classes, offending, {
          messageId: 'nonCanonical',
          replacementKey: 'canonical',
        })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
