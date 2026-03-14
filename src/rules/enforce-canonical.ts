import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  preserveSpaces,
  type ClassLocation,
} from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { getLoadedDesignSystem } from '../design-system/loader'
import { safeOptions } from '../types'

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
    messages: {
      nonCanonical: '"{{className}}" can be written as "{{canonical}}". Use the canonical form.',
    },
  },
  createOnce(context) {
    const options = safeOptions<{ entryPoint?: string }>(context)
    const result = getLoadedDesignSystem(options?.entryPoint)
    if (!result) return {}

    const { cache } = result

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        // Pre-compute canonical forms for all classes once
        const canonicals = classes.map((cls) => cache.canonicalize(cls))
        let firstNonCanonical = true

        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i]
          const canonical = canonicals[i]
          if (canonical === cls) continue

          if (firstNonCanonical) {
            firstNonCanonical = false
            const fixedValue = canonicals.join(' ')
            context.report({
              node: loc.node,
              messageId: 'nonCanonical',
              data: { className: cls, canonical },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'nonCanonical',
              data: { className: cls, canonical },
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
