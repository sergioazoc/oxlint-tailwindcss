import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import {
  type VariantFacts,
  changesTarget,
  extractUtility,
  extractVariants,
} from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { isFatalError } from '../utils/fatal'

export const noContradictingVariants = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow variant-prefixed classes that are redundant because the base class already applies unconditionally',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}],
    messages: {
      redundantVariant:
        '"{{variantClass}}" is redundant because "{{baseClass}}" already applies unconditionally.',
    },
  },
  createOnce(context) {
    // DS-OPTIONAL, like consistent-variant-order. With an entry point the rule
    // asks the design system what each variant's selector does, which is the only
    // way to know that a project's `@custom-variant thumb (&::-webkit-slider-thumb)`
    // targets another box. Without one it falls back to the static predicates, so
    // configuring nothing keeps working exactly as before — this rule never
    // emitted `designSystemUnavailable` and must not start.
    const getDS = createLazyLoader(context)

    function variantFactsLookup(): (variant: string) => VariantFacts | undefined {
      try {
        const ds = getDS()
        return (variant) => ds.cache.getVariantFacts(variant)
      } catch (err) {
        if (!isFatalError(err)) throw err
        return () => undefined
      }
    }

    function check(locations: ClassLocation[]) {
      const factsFor = variantFactsLookup()

      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        // Collect base classes (no variants) — store their full utility string
        const baseUtilities = new Set<string>()
        for (const cls of classes) {
          const variants = extractVariants(cls)
          if (variants.length === 0) {
            baseUtilities.add(cls)
          }
        }

        // Check variant classes against base classes
        for (const cls of classes) {
          const variants = extractVariants(cls)
          if (variants.length === 0) continue

          // Skip if any variant changes the selector target
          if (variants.some((v) => changesTarget(v, factsFor(v)))) continue

          const utility = extractUtility(cls)
          // Only report if the exact same utility exists as a base class
          if (baseUtilities.has(utility)) {
            context.report({
              node: loc.node,
              messageId: 'redundantVariant',
              data: { variantClass: cls, baseClass: utility },
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
