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
import { safeOptions } from '../types'

interface Options {
  variants?: string[]
}

const DEFAULT_VARIANTS = ['dark']

// Multi-part prefixes, sorted longest-first so longer matches take priority
const KNOWN_PREFIXES = [
  'rounded-tl',
  'rounded-tr',
  'rounded-bl',
  'rounded-br',
  'rounded-ss',
  'rounded-se',
  'rounded-es',
  'rounded-ee',
  'ring-offset',
  'border-t',
  'border-b',
  'border-l',
  'border-r',
  'border-s',
  'border-e',
  'border-x',
  'border-y',
  'rounded-t',
  'rounded-b',
  'rounded-l',
  'rounded-r',
  'rounded-s',
  'rounded-e',
  'divide-x',
  'divide-y',
  'scroll-m',
  'scroll-p',
  'from',
  'via',
  'to',
]

/**
 * Extracts the utility prefix (e.g. "bg" from "bg-gray-900", "text" from "text-white").
 * Used to group utilities by their property type.
 */
function getUtilityPrefix(utility: string): string {
  let u = utility
  if (u.startsWith('!')) u = u.slice(1)
  if (u.startsWith('-')) u = u.slice(1)

  for (const prefix of KNOWN_PREFIXES) {
    if (u === prefix || u.startsWith(`${prefix}-`)) return prefix
  }

  const dashIdx = u.indexOf('-')
  return dashIdx >= 0 ? u.slice(0, dashIdx) : u
}

export const noDarkWithoutLight = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a base (light) utility when using dark: (or other scheme) variant',
    },
    schema: [
      {
        type: 'object',
        properties: {
          variants: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingBase:
        '"{{className}}" uses the {{variant}} variant, but there is no base "{{prefix}}-*" class on this element.',
    },
  },
  createOnce(context) {
    let _watchedVariants: Set<string> | null = null
    function getWatchedVariants(): Set<string> {
      if (_watchedVariants === null) {
        const options = safeOptions<Options>(context)
        _watchedVariants = new Set(options?.variants ?? DEFAULT_VARIANTS)
      }
      return _watchedVariants
    }

    function check(locations: ClassLocation[]) {
      const watchedVariants = getWatchedVariants()
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        // Collect utility prefixes that have a base (no watched variant)
        const basePrefixes = new Set<string>()
        // Collect classes that have a watched variant
        const variantClasses: Array<{ cls: string; variant: string; prefix: string }> = []

        for (const cls of classes) {
          const variants = extractVariants(cls)
          const utility = extractUtility(cls)
          const prefix = getUtilityPrefix(utility)

          const hasWatchedVariant = variants.some((v) => watchedVariants.has(v))

          if (hasWatchedVariant) {
            const variant = variants.find((v) => watchedVariants.has(v))!
            variantClasses.push({ cls, variant, prefix })
          } else {
            basePrefixes.add(prefix)
          }
        }

        // Report variant classes that don't have a matching base
        for (const { cls, variant, prefix } of variantClasses) {
          if (!basePrefixes.has(prefix)) {
            context.report({
              node: loc.node,
              messageId: 'missingBase',
              data: { className: cls, variant, prefix },
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
