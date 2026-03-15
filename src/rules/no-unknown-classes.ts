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
import { findBestSuggestion } from '../utils/levenshtein'
import { getLoadedDesignSystem } from '../design-system/loader'
import { safeOptions, safeSettings } from '../types'

interface Options {
  entryPoint?: string
  allowlist?: string[]
  ignorePrefixes?: string[]
}

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
    messages: {
      unknown: '"{{className}}" is not a valid Tailwind class.',
      unknownWithSuggestion:
        '"{{className}}" is not a valid Tailwind class. Did you mean "{{suggestion}}"?',
    },
  },
  createOnce(context) {
    const options = safeOptions<Options>(context)
    const result = getLoadedDesignSystem(options?.entryPoint, safeSettings(context))
    if (!result) return {}

    const { cache } = result
    const allowlist = new Set(options?.allowlist ?? [])
    const ignorePrefixes = options?.ignorePrefixes ?? []

    function shouldIgnore(className: string): boolean {
      if (allowlist.has(className)) return true
      return ignorePrefixes.some((prefix) => className.startsWith(prefix))
    }

    function stripModifiers(className: string): string {
      // Strip ! (important) for validation
      let stripped = className
      if (stripped.startsWith('!')) stripped = stripped.slice(1)
      return stripped
    }

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        for (const cls of classes) {
          if (shouldIgnore(cls)) continue

          const stripped = stripModifiers(cls)
          if (cache.isValid(stripped)) continue

          const suggestion = findBestSuggestion(stripped, cache.validClasses)

          if (suggestion) {
            context.report({
              node: loc.node,
              messageId: 'unknownWithSuggestion',
              data: { className: cls, suggestion },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'unknown',
              data: { className: cls },
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
