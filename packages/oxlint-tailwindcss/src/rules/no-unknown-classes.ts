import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { findBestSuggestion } from '../utils/levenshtein'
import {
  extractVariants,
  splitImportant,
  splitUtilityAndVariant,
  reattachImportant,
} from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { validateClassesSync } from '../design-system/declaration-service'
import type { DesignSystemCache } from '../design-system/cache'
import { createLazyOptions } from '../utils/context'
import { DS_UNAVAILABLE_MESSAGE, reportFatalDsError, safeGetDS } from '../utils/fatal'

interface Options {
  entryPoint?: string
  allowlist?: string[]
  ignorePrefixes?: string[]
}

/**
 * Utility used to probe a variant chain. Any always-valid utility works; `flex`
 * is the shortest one every Tailwind build has.
 */
const PROBE_UTILITY = 'flex'

export const noUnknownClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow classes that are not defined in the Tailwind CSS design system',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          allowlist: { type: 'array', items: { type: 'string' } },
          ignorePrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{ allowlist: [], ignorePrefixes: [] }],
    messages: {
      unknown: '"{{className}}" is not a valid Tailwind class.',
      unknownWithSuggestion:
        '"{{className}}" is not a valid Tailwind class. Did you mean "{{suggestion}}"?',
      missingPrefix:
        '"{{className}}" needs the "{{prefix}}:" prefix to produce CSS. Did you mean "{{suggestion}}"?',
      unknownVariant:
        '"{{className}}" produces no CSS: "{{variant}}" is not a variant this design system knows.',
      unknownVariantWithSuggestion:
        '"{{className}}" produces no CSS: "{{variant}}" is not a variant this design system knows. Did you mean "{{suggestion}}"?',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    const getLazyOptions = createLazyOptions<
      Options,
      { allowlist: Set<string>; ignorePrefixes: string[] }
    >(context, (o) => ({
      allowlist: new Set(o?.allowlist ?? []),
      ignorePrefixes: o?.ignorePrefixes ?? [],
    }))

    function shouldIgnore(className: string): boolean {
      const { allowlist, ignorePrefixes } = getLazyOptions()
      if (allowlist.has(className)) return true
      return ignorePrefixes.some((prefix) => className.startsWith(prefix))
    }

    // Peel the variant prefix AND the `!` modifier so suggestions are looked up
    // against the bare utility (validClasses holds variant-free, `!`-free names)
    // and rebuilt preserving both. Without this, `flexx!` would lose its `!` and
    // `hover:flexx` would never find a neighbor (it'd compare with the variant).
    function strippedUtility(className: string): {
      variant: string
      bare: string
      position: ReturnType<typeof splitImportant>['position']
    } {
      const { utility, variant } = splitUtilityAndVariant(className)
      const { bare, position } = splitImportant(utility)
      return { variant, bare, position }
    }

    /**
     * Does the design system compile this variant chain?
     *
     * `variantOrder` only lists the STATIC variants (71 of them: `hover`, `md`,
     * `dark`, …). It has no `group`, no `data`, no `@md`, because those are
     * functional variants whose values are unbounded — so validating a chain
     * against that list would report `group-hover:` and `data-[x=1]:` as unknown.
     * Compiling a probe utility under the chain is the only exact answer, and it
     * costs one design-system call per DISTINCT chain in the project.
     */
    const chainAnswers = new Map<string, boolean | null>()

    function chainProduces(
      cache: DesignSystemCache,
      entryPoint: string,
      chain: string,
    ): boolean | null {
      // Visitors run on every AST node, so the answer is memoized here as well as
      // in the service: a file with a thousand `hover:` classes should not pay a
      // probe array and a WeakMap lookup a thousand times.
      const key = `${entryPoint}\0${chain}`
      const memo = chainAnswers.get(key)
      if (memo !== undefined) return memo
      const probe = `${chain}${PROBE_UTILITY}`
      const verdict = validateClassesSync(entryPoint, cache, [probe]).get(probe) ?? null
      chainAnswers.set(key, verdict)
      return verdict
    }

    /** Replace one class in the location and report, with a quick-fix suggestion. */
    function reportWithSuggestion(
      loc: ClassLocation,
      classes: string[],
      cls: string,
      replacement: string,
      messageId: string,
      data: Record<string, string>,
      split: ReturnType<typeof splitClassesWithSeparators>,
    ): void {
      const fixedValue = rebuildClassString(
        split,
        classes.map((c) => (c === cls ? replacement : c)),
      )
      context.report({
        node: loc.node,
        messageId,
        data,
        suggest: [
          {
            messageId: 'suggestReplace',
            data: { className: cls, replacement },
            fix(fixer) {
              return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
            },
          },
        ],
      })
    }

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache, entryPoint } = ds

      try {
        checkLocations(locations, cache, entryPoint)
      } catch (error) {
        // The declaration service is what makes this rule's answers exact. If it
        // is unavailable, going back to the tolerant heuristic in silence would
        // reinstate exactly the false negatives it exists to remove, on a run
        // that stays green — so it surfaces like any other design-system failure
        // and the rule stops. One diagnostic per visitor call, not per class.
        if (reportFatalDsError(context, error, locations[0].node)) return
        throw error
      }
    }

    function checkLocations(
      locations: ClassLocation[],
      cache: DesignSystemCache,
      entryPoint: string,
    ) {
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes

        // Everything the precompute doesn't know verbatim, asked in one batch per
        // location instead of one call per class. Allocates nothing for the common
        // location where every class is precomputed — this runs on every node.
        let toVerify: string[] | null = null
        for (const cls of classes) {
          if (shouldIgnore(cls)) continue
          const bare = strippedUtility(cls).bare
          if (cache.isKnownClass(bare)) continue
          if (!toVerify) toVerify = []
          toVerify.push(bare)
        }
        const verified = toVerify ? validateClassesSync(entryPoint, cache, toVerify) : null

        for (const cls of classes) {
          if (shouldIgnore(cls)) continue

          const validity = cache.classValidity(cls)
          const { variant, bare, position } = strippedUtility(cls)

          // A precomputed class with no variant chain is settled, and that is the
          // overwhelming majority of what a file contains. The old code exited on
          // `validity === 'valid'` alone; the extra two conditions are what the
          // design-system lookups below are FOR, so they have to be cheap and
          // first.
          if (validity === 'valid' && !variant && cache.isKnownClass(bare)) continue

          // Don't report deprecated classes — no-deprecated-classes handles those.
          // Read from the design system rather than a hardcoded list, so the two
          // rules can't disagree about what counts as deprecated.
          if (cache.deprecatedReplacement(bare)) continue

          // A real Tailwind utility written without the required project prefix:
          // suggest the prefixed form rather than a Levenshtein neighbor.
          if (validity === 'missing-prefix') {
            const fixed = `${cache.prefix}:${cls}`
            reportWithSuggestion(
              loc,
              classes,
              cls,
              fixed,
              'missingPrefix',
              { className: cls, prefix: cache.prefix, suggestion: fixed },
              split,
            )
            continue
          }

          // `classValidity` is tolerant by design (it accepts anything shaped like
          // a dynamic value), so a class it calls valid may still compile to
          // nothing: `w-45` does, `bg-red-5000` and `bg-red-500/foo` don't, and
          // they are the same shape. Only the design system can tell them apart.
          const compiles = cache.isKnownClass(bare) ? true : verified?.get(bare)
          const utilityIsUnknown = validity === 'unknown' || compiles === false

          if (utilityIsUnknown) {
            const suggestionBare = findBestSuggestion(bare, cache.validClasses)
            const suggestion = suggestionBare
              ? variant + reattachImportant(suggestionBare, position)
              : null

            if (suggestion) {
              reportWithSuggestion(
                loc,
                classes,
                cls,
                suggestion,
                'unknownWithSuggestion',
                { className: cls, suggestion },
                split,
              )
            } else {
              context.report({
                node: loc.node,
                messageId: 'unknown',
                data: { className: cls },
              })
            }
            continue
          }

          // The utility is fine, so anything left is in the variant chain — which
          // `classValidity` never looked at: it strips the variants before
          // validating, so `hoverr:flex` and `peer-cheked:flex` passed silently
          // while producing no CSS at all.
          if (!variant) continue
          if (chainProduces(cache, entryPoint, variant) !== false) continue

          const {
            variant: offending,
            suggestion,
            fixedChain,
          } = diagnoseChain(cache, entryPoint, variant)
          const fixedClass = fixedChain ? fixedChain + reattachImportant(bare, position) : null

          if (fixedClass && suggestion) {
            reportWithSuggestion(
              loc,
              classes,
              cls,
              fixedClass,
              'unknownVariantWithSuggestion',
              { className: cls, variant: offending, suggestion },
              split,
            )
          } else {
            context.report({
              node: loc.node,
              messageId: 'unknownVariant',
              data: { className: cls, variant: offending },
            })
          }
        }
      }
    }

    /**
     * Which segment of an invalid chain is to blame, and what to use instead.
     *
     * Every candidate correction is checked against the design system before it
     * is offered, so a suggestion is never a guess: `group-hoverr` is corrected by
     * fixing its last dash-segment and confirming that `group-hover:` compiles.
     * That also means no list of compound roots (`group`, `peer`, `data`, …) has
     * to be maintained here.
     */
    function diagnoseChain(
      cache: DesignSystemCache,
      entryPoint: string,
      chain: string,
    ): { variant: string; suggestion: string | null; fixedChain: string | null } {
      const segments = extractVariants(`${chain}${PROBE_UTILITY}`)
      const names = cache.variantNames()

      for (const segment of segments) {
        // Arbitrary variants (`[&>svg]`) carry a selector, not a name: nothing to
        // spell-check, and the design system accepts almost anything in there.
        if (segment.startsWith('[')) continue
        if (chainProduces(cache, entryPoint, `${segment}:`) !== false) continue

        for (const candidate of correctionsFor(segment, names)) {
          if (chainProduces(cache, entryPoint, `${candidate}:`) !== true) continue
          // Rebuilt from the parsed segments rather than by string replacement, so
          // a variant that happens to contain another one (`data-[x=md]:mdd:`)
          // can't have the wrong occurrence rewritten.
          const fixedChain = segments.map((s) => (s === segment ? candidate : s)).join(':') + ':'
          return { variant: segment, suggestion: candidate, fixedChain }
        }
        return { variant: segment, suggestion: null, fixedChain: null }
      }

      // Every segment compiles on its own but the chain does not — report the
      // chain itself rather than blaming a variant that is perfectly valid.
      return { variant: chain.slice(0, -1), suggestion: null, fixedChain: null }
    }

    /** Spelling candidates for a variant segment, nearest neighbour first. */
    function correctionsFor(segment: string, names: string[]): string[] {
      const out: string[] = []
      const whole = findBestSuggestion(segment, names)
      if (whole) out.push(whole)

      // Compound variants (`group-hoverr`, `peer-cheked`) are a known root plus a
      // variant name: correcting the last part keeps the root intact.
      const dash = segment.lastIndexOf('-')
      if (dash > 0) {
        const tail = findBestSuggestion(segment.slice(dash + 1), names)
        if (tail) out.push(`${segment.slice(0, dash)}-${tail}`)
      }
      return out
    }

    return createExtractorVisitors(context, check)
  },
})
