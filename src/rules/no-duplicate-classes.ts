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

export const noDuplicateClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow duplicate Tailwind CSS classes',
    },
    fixable: 'code',
    schema: [],
    messages: {
      duplicate: 'Duplicate class: "{{className}}". Removing the second occurrence.',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        const seen = new Set<string>()
        const duplicates: string[] = []

        for (const cls of classes) {
          if (seen.has(cls)) {
            duplicates.push(cls)
          } else {
            seen.add(cls)
          }
        }

        if (duplicates.length > 0) {
          const unique = [...new Set(classes)]
          const fixed = unique.join(' ')

          for (const dup of duplicates) {
            context.report({
              node: loc.node,
              messageId: 'duplicate',
              data: { className: dup },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, fixed)
              },
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
