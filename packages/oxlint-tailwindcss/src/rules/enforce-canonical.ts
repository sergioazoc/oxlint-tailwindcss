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
          // A v3 spelling Tailwind renamed is `no-deprecated-classes`' class:
          // it canonicalizes to exactly the same replacement, so reporting it
          // here too meant one class producing two diagnostics with two
          // identical fixes. Deprecation is the more actionable message of the
          // two, so this rule stays quiet and the other one owns them.
          const { utility } = splitUtilityAndVariant(classes[i])
          if (cache.deprecatedReplacement(splitImportant(utility).bare)) {
            canonicals[i] = classes[i]
            continue
          }
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
            const { canonical, safe } = dynamic[k]
            // #78: only rewrite when the canonical form is CSS-value-equivalent.
            // `canonicalizeCandidates` matches an arbitrary literal (e.g.
            // `rounded-[4px]` = `4px`) against the compile-time theme, so it
            // happily maps it to a var-backed token (`rounded-lg` =
            // `var(--radius-lg)`) that a `:root` override makes NON-equivalent —
            // autofixing that silently corrupts the design. When the emitted CSS
            // isn't byte-identical the conversion is left as the user wrote it.
            canonicals[arbitraryIdx[k]] = safe
              ? preserveImportantPosition(arbitrary[k], canonical)
              : arbitrary[k]
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
