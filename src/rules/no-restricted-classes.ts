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

interface PatternConfig {
  pattern: string
  message?: string
}

interface Options {
  classes?: string[]
  patterns?: PatternConfig[]
}

export const noRestrictedClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow specific Tailwind CSS classes',
    },
    schema: [
      {
        type: 'object',
        properties: {
          classes: { type: 'array', items: { type: 'string' } },
          patterns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pattern: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['pattern'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      restricted: '"{{className}}" is restricted.',
      restrictedWithMessage: '"{{className}}" is restricted: {{message}}',
    },
  },
  createOnce(context) {
    interface CompiledConfig {
      restrictedClasses: Set<string>
      patterns: Array<{ regex: RegExp; message?: string }>
    }

    let _config: CompiledConfig | null = null
    function getConfig(): CompiledConfig {
      if (_config === null) {
        const options = safeOptions<Options>(context)
        _config = {
          restrictedClasses: new Set(options?.classes ?? []),
          patterns: (options?.patterns ?? []).map((p) => ({
            regex: new RegExp(p.pattern),
            message: p.message,
          })),
        }
      }
      return _config
    }

    function check(locations: ClassLocation[]) {
      const { restrictedClasses, patterns } = getConfig()
      // No restrictions configured — nothing to do
      if (restrictedClasses.size === 0 && patterns.length === 0) return
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        for (const cls of classes) {
          // Check exact matches
          if (restrictedClasses.has(cls)) {
            context.report({
              node: loc.node,
              messageId: 'restricted',
              data: { className: cls },
            })
            continue
          }

          // Check patterns
          for (const { regex, message } of patterns) {
            if (regex.test(cls)) {
              if (message) {
                context.report({
                  node: loc.node,
                  messageId: 'restrictedWithMessage',
                  data: { className: cls, message },
                })
              } else {
                context.report({
                  node: loc.node,
                  messageId: 'restricted',
                  data: { className: cls },
                })
              }
              break
            }
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
