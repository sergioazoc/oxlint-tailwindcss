import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  type ClassLocation,
} from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { extractVariants, extractUtility } from '../utils/class-parser'

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

    return {
      JSXAttribute(node) {
        check(extractFromJSXAttribute(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      CallExpression(node) {
        check(extractFromCallExpression(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      TaggedTemplateExpression(node) {
        check(extractFromTaggedTemplate(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      VariableDeclarator(node) {
        check(extractFromVariableDeclarator(node, DEFAULT_EXTRACTOR_CONFIG))
      },
    }
  },
})
