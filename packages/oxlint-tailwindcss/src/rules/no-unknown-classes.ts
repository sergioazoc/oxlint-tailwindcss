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
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'

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
    function chainProduces(
      cache: DesignSystemCache,
      entryPoint: string,
      chain: string,
    ): boolean | null {
      const probe = `${chain}${PROBE_UTILITY}`
      const answers = validateClassesSync(entryPoint, cache, [probe])
      return answers ? (answers.get(probe) ?? null) : null
    }

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache, entryPoint } = ds

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

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes

        // Everything the precompute doesn't know verbatim, asked in one batch per
        // location instead of one call per class.
        const toVerify = classes
          .filter((cls) => !shouldIgnore(cls))
          .map((cls) => strippedUtility(cls).bare)
          .filter((bare) => !cache.isKnownClass(bare))
        const verified =
          toVerify.length > 0 ? validateClassesSync(entryPoint, cache, toVerify) : null

        for (const cls of classes) {
          if (shouldIgnore(cls)) continue

          const validity = cache.classValidity(cls)
          const { variant, bare, position } = strippedUtility(cls)

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

          const { variant: offending, suggestion } = diagnoseChain(cache, entryPoint, variant)
          const fixedClass = suggestion
            ? variant.replace(`${offending}:`, `${suggestion}:`) + reattachImportant(bare, position)
            : null

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
    ): { variant: string; suggestion: string | null } {
      const segments = extractVariants(`${chain}${PROBE_UTILITY}`)
      const names = cache.variantNames()

      for (const segment of segments) {
        // Arbitrary variants (`[&>svg]`) carry a selector, not a name: nothing to
        // spell-check, and the design system accepts almost anything in there.
        if (segment.startsWith('[')) continue
        if (chainProduces(cache, entryPoint, `${segment}:`) !== false) continue

        for (const candidate of correctionsFor(segment, names)) {
          if (chainProduces(cache, entryPoint, `${candidate}:`) === true) {
            return { variant: segment, suggestion: candidate }
          }
        }
        return { variant: segment, suggestion: null }
      }

      // Every segment compiles on its own but the chain does not — report the
      // chain itself rather than blaming a variant that is perfectly valid.
      return { variant: chain.slice(0, -1), suggestion: null }
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
