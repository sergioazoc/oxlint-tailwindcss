import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
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
        'Enforce consistent position of the important (!) modifier. Default: suffix (Tailwind v4 canonical form). Note: using "prefix" may conflict with enforce-canonical which normalizes to suffix.',
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
    hasSuggestions: true,
    defaultOptions: [{ position: 'suffix' }],
    messages: {
      usePrefix: '"{{className}}" uses suffix important. Use "{{replacement}}" (prefix) instead.',
      useSuffix: '"{{className}}" uses prefix important. Use "{{replacement}}" (suffix) instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    let _position: 'prefix' | 'suffix' | null = null
    function getPosition(): 'prefix' | 'suffix' {
      if (_position === null) {
        const options = safeOptions<Options>(context)
        _position = options?.position ?? 'suffix'
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
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const { utility, variant } = splitUtilityAndVariant(cls)
          const fixed = fixUtility(utility, variant)
          if (fixed) offending.push({ cls, replacement: fixed })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = rebuildClassString(
          split,
          classes.map((cls) => replacements.get(cls) ?? cls),
        )

        // Report each offending class; attach the fix to the first one
        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId: position === 'prefix' ? 'usePrefix' : 'useSuffix',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: position === 'prefix' ? 'usePrefix' : 'useSuffix',
              data: { className: cls, replacement },
              suggest: [
                {
                  messageId: 'suggestReplace',
                  data: { className: cls, replacement },
                  fix(fixer) {
                    return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
                  },
                },
              ],
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
