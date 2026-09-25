import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import {
  extractVariants,
  convertVarSyntax,
  reattachImportant,
  splitImportant,
  splitUtilityAndVariant,
  utilityHasDynamicValue,
  variantHasArbitraryValue,
} from '../utils/class-parser'
import { createLazyLoader, rootFontSizeFromSettings } from '../design-system/loader'
import { canonicalizeClassesSync } from '../design-system/canonicalize-service'
import { createLazyOptions, createLazySettings } from '../utils/context'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'
import { SETTINGS_MESSAGE } from '../utils/settings-check'

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

/**
 * The first variant that differs between a class and its canonical form —
 * `data-[disabled]:opacity-50` / `data-disabled:opacity-50` → `data-[disabled]`
 * / `data-disabled` — or the whole chains when they don't line up.
 */
function differingVariant(cls: string, canonical: string): { written: string; variant: string } {
  const a = extractVariants(cls)
  const b = extractVariants(canonical)
  if (a.length === b.length) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return { written: a[i], variant: b[i] }
    }
  }
  return { written: a.join(':'), variant: b.join(':') }
}

export const enforceCanonical = defineRule({
  meta: {
    type: 'suggestion',
    docs: ruleDocs('enforce-canonical', {
      description: 'Enforce canonical Tailwind CSS class names using canonicalizeCandidates()',
      category: 'modernization',
      recommended: 'warn',
      designSystem: 'required',
    }),
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          reportNonEquivalent: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{ reportNonEquivalent: false }],
    messages: {
      ...SETTINGS_MESSAGE,
      nonCanonical: '"{{className}}" can be written as "{{canonical}}". Use the canonical form.',
      nonEquivalentVariant:
        '"{{className}}" is not the same CSS as its canonical form "{{canonical}}" in this project: "{{variant}}:" is defined differently from "{{written}}:" (a custom variant in your CSS), so the two match different elements. It is left as written; switch to "{{variant}}:" only if that is what you mean.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    // Per file: a nested .oxlintrc.json can set its own `rootFontSize`.
    const getRem = createLazySettings(context, rootFontSizeFromSettings)
    const getReportNonEquivalent = createLazyOptions<{ reportNonEquivalent?: boolean }, boolean>(
      context,
      (o) => o?.reportNonEquivalent === true,
    )

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
        //     (`p-[2px]`, `bg-(--c)`) or in a variant (`data-[open]:flex`,
        //     `min-[40rem]:flex`) → need the async DS to canonicalize, routed
        //     through the worker. The precompute knows utilities only, so the
        //     cache would pass an arbitrary variant through untouched.
        //
        // Keeping named classes out of the worker call avoids the round-trip
        // entirely for the majority of locations, and shrinks the payload for
        // the rest. The local cache preserves `!` position, so no
        // preserveImportantPosition step is needed on that path.
        const canonicals: string[] = Array.from({ length: classes.length })
        const nonEquivalent: { cls: string; canonical: string }[] = []
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
          if (utilityHasDynamicValue(classes[i]) || variantHasArbitraryValue(classes[i])) {
            arbitraryIdx.push(i)
            arbitrary.push(classes[i])
          } else {
            canonicals[i] = cache.canonicalize(classes[i])
          }
        }

        if (arbitrary.length > 0) {
          const rem = getRem()
          // Worker provides the authoritative canonicalization for arbitrary
          // values and variants. Failures throw SortServiceError, surfaced as a fatal
          // diagnostic via safeGetDS — no heuristic fallback.
          const dynamic = safeGetDS(
            () => canonicalizeClassesSync(entryPoint, arbitrary, rem),
            context,
            loc.node,
          )
          if (!dynamic) return // worker fatal already reported; stop the check
          const reportNonEquivalent = getReportNonEquivalent()
          for (let k = 0; k < arbitrary.length; k++) {
            const { canonical, safe, reason } = dynamic[k]
            const idx = arbitraryIdx[k]
            // R5: a rewrite that only changes the SELECTOR — the project defines
            // the canonical variant differently (shadcn's `data-disabled:` is
            // `:where(…)`) — is reported on request, never fixed.
            if (!safe && reason === 'variant' && reportNonEquivalent) {
              nonEquivalent.push({ cls: arbitrary[k], canonical })
            }
            // #78: only rewrite when the canonical form is CSS-value-equivalent.
            // `canonicalizeCandidates` matches an arbitrary literal (e.g.
            // `rounded-[4px]` = `4px`) against the compile-time theme, so it
            // happily maps it to a var-backed token (`rounded-lg` =
            // `var(--radius-lg)`) that a `:root` override makes NON-equivalent —
            // autofixing that silently corrupts the design. When the emitted CSS
            // isn't byte-identical the conversion is left as the user wrote it.
            if (!safe) {
              canonicals[idx] = arbitrary[k]
              continue
            }
            const preserved = preserveImportantPosition(arbitrary[k], canonical)
            // #152: when the ONLY change is the CSS-variable shorthand swap
            // (`x-[var(--v)]` → `x-(--v)`), cede it to
            // `enforce-consistent-variable-syntax` — the single owner of
            // variable-syntax policy — exactly as the deprecated renames above
            // are ceded to `no-deprecated-classes`. Otherwise both rules report
            // the same fix, and under that rule's `explicit` mode they fight over
            // it (autofix oscillation). Value-changing var canonicalizations
            // (`rounded-[var(--radius-sm)]` → `rounded-sm`) and opacity-modifier
            // forms (`text-[var(--c)]/90`) are NOT a shorthand swap — the helper
            // returns null for them — so they stay this rule's business.
            canonicals[idx] =
              convertVarSyntax(arbitrary[k], 'shorthand') === preserved ? arbitrary[k] : preserved
          }
        }

        const offending = classes.flatMap((cls, i) =>
          canonicals[i] === cls ? [] : [{ cls, replacement: canonicals[i] }],
        )
        reportClassReplacements(context, loc, split, classes, offending, {
          messageId: 'nonCanonical',
          replacementKey: 'canonical',
        })
        for (const { cls, canonical } of nonEquivalent) {
          const { written, variant } = differingVariant(cls, canonical)
          context.report({
            node: loc.node,
            messageId: 'nonEquivalentVariant',
            data: { className: cls, canonical, written, variant },
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
