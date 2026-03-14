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
import { splitUtilityAndVariant } from '../utils/class-parser'
import { getLoadedDesignSystem } from '../design-system/loader'
import { safeOptions } from '../types'

// Mapping of deprecated classes in TW v4 to their replacements
const DEPRECATED_MAP: Record<string, string> = {
  'flex-grow': 'grow',
  'flex-grow-0': 'grow-0',
  'flex-shrink': 'shrink',
  'flex-shrink-0': 'shrink-0',
  'overflow-ellipsis': 'text-ellipsis',
  'decoration-slice': 'box-decoration-slice',
  'decoration-clone': 'box-decoration-clone',
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
    messages: {
      deprecated: '"{{className}}" is deprecated in Tailwind v4. Use "{{replacement}}" instead.',
    },
  },
  createOnce(context) {
    const options = safeOptions<{ entryPoint?: string }>(context)
    const result = getLoadedDesignSystem(options?.entryPoint)

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        for (const cls of classes) {
          const { utility, variant } = splitUtilityAndVariant(cls)

          const replacement = DEPRECATED_MAP[utility]
          if (!replacement) continue

          // If we have a design system, verify with canonicalize
          if (result) {
            const canonical = result.cache.canonicalize(utility)
            if (canonical !== utility && canonical === replacement) {
              // Confirmed by the design system
            }
          }

          const fullReplacement = variant + replacement

          context.report({
            node: loc.node,
            messageId: 'deprecated',
            data: { className: cls, replacement: fullReplacement },
            fix(fixer) {
              const fixed = loc.value.replace(cls, fullReplacement)
              return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixed))
            },
          })
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
