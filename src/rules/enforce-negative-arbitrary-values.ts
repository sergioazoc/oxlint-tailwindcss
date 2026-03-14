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

function fixClass(cls: string): string | null {
  const { utility, variant } = splitUtilityAndVariant(cls)
  if (!utility.startsWith('-')) return null

  const bracketOpen = utility.indexOf('[')
  if (bracketOpen === -1) return null

  const bracketClose = utility.lastIndexOf(']')
  if (bracketClose === -1 || bracketClose < bracketOpen) return null

  const innerValue = utility.slice(bracketOpen + 1, bracketClose)
  if (innerValue.startsWith('-')) return null

  const baseUtility = utility.slice(1, bracketOpen)
  return `${variant}${baseUtility}[-${innerValue}]`
}

/**
 * Detects `-utility-[value]` and suggests `utility-[-value]`.
 * e.g. `-top-[5px]` → `top-[-5px]`
 */
export const enforceNegativeArbitraryValues = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce moving the negative sign inside arbitrary value brackets: -top-[5px] → top-[-5px]',
    },
    fixable: 'code',
    schema: [],
    messages: {
      moveNegative:
        '"{{className}}" has the negative outside brackets. Use "{{replacement}}" instead.',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const fixed = fixClass(cls)
          if (fixed) offending.push({ cls, replacement: fixed })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = classes.map((cls) => replacements.get(cls) ?? cls).join(' ')

        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId: 'moveNegative',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, fixedValue)
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'moveNegative',
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
