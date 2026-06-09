import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { extractVariants, extractUtility, changesTarget } from '../utils/class-parser'

export const noContradictingVariants = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow variant-prefixed classes that are redundant because the base class already applies unconditionally',
    },
    schema: [],
    messages: {
      redundantVariant:
        '"{{variantClass}}" is redundant because "{{baseClass}}" already applies unconditionally.',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
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
          if (variants.some(changesTarget)) continue

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
