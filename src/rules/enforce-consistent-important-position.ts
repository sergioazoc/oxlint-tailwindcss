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
import { splitUtilityAndVariant } from '../utils/class-parser'
import { safeOptions } from '../types'

interface Options {
  position?: 'prefix' | 'suffix'
}

export const enforceConsistentImportantPosition = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent position of the important (!) modifier in Tailwind CSS classes',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          position: { type: 'string', enum: ['prefix', 'suffix'] },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      usePrefix: '"{{className}}" uses suffix important. Use "{{replacement}}" (prefix) instead.',
      useSuffix: '"{{className}}" uses prefix important. Use "{{replacement}}" (suffix) instead.',
    },
  },
  createOnce(context) {
    let _position: 'prefix' | 'suffix' | null = null
    function getPosition(): 'prefix' | 'suffix' {
      if (_position === null) {
        const options = safeOptions<Options>(context)
        _position = options?.position ?? 'prefix'
      }
      return _position
    }

    function fixUtility(utility: string, variantPfx: string): string | null {
      const position = getPosition()
      if (position === 'prefix' && utility.endsWith('!') && !utility.startsWith('!')) {
        return `${variantPfx}!${utility.slice(0, -1)}`
      }
      if (position === 'suffix' && utility.startsWith('!') && !utility.endsWith('!')) {
        return `${variantPfx}${utility.slice(1)}!`
      }
      return null
    }

    function check(locations: ClassLocation[]) {
      const position = getPosition()
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const { utility, variant } = splitUtilityAndVariant(cls)
          const fixed = fixUtility(utility, variant)
          if (fixed) offending.push({ cls, replacement: fixed })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = classes.map((cls) => replacements.get(cls) ?? cls).join(' ')

        // Report each offending class; attach the fix to the first one
        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId: position === 'prefix' ? 'usePrefix' : 'useSuffix',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, fixedValue)
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: position === 'prefix' ? 'usePrefix' : 'useSuffix',
              data: { className: cls, replacement },
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
