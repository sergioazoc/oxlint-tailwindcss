import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  type ClassLocation,
} from '../utils/extractors'

export const noUnnecessaryWhitespace = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow unnecessary whitespace in Tailwind CSS class strings',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryWhitespace: 'Unnecessary whitespace in Tailwind classes. Can be normalized.',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        // Collapse all whitespace runs to a single space
        let normalized = loc.value.replace(/\s+/g, ' ')

        // Trim edges, but preserve a single space at template expression boundaries
        if (normalized.startsWith(' ') && !loc.preserveLeadingSpace) {
          normalized = normalized.slice(1)
        }
        if (normalized.endsWith(' ') && !loc.preserveTrailingSpace) {
          normalized = normalized.slice(0, -1)
        }

        if (normalized !== loc.value) {
          context.report({
            node: loc.node,
            messageId: 'unnecessaryWhitespace',
            fix(fixer) {
              return fixer.replaceTextRange(loc.range, normalized)
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
