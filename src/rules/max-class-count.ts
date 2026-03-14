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
import { safeOptions } from '../types'

interface Options {
  max?: number
}

const DEFAULT_MAX = 20

export const maxClassCount = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce a maximum number of Tailwind CSS classes per element',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'number' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooMany:
        'Too many Tailwind classes ({{count}}). Maximum allowed is {{max}}. Consider extracting into a component or utility.',
    },
  },
  createOnce(context) {
    let _max: number | null = null
    function getMax(): number {
      if (_max === null) {
        const options = safeOptions<Options>(context)
        _max = options?.max ?? DEFAULT_MAX
      }
      return _max
    }

    function check(locations: ClassLocation[]) {
      const max = getMax()
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        if (classes.length > max) {
          context.report({
            node: loc.node,
            messageId: 'tooMany',
            data: { count: String(classes.length), max: String(max) },
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
