import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'

function fixClass(cls: string): string | null {
  const { utility, variant } = splitUtilityAndVariant(cls)

  // Strip ! (important) for analysis — prefix or suffix
  const hasImportantPrefix = utility.startsWith('!')
  const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
  const bare = hasImportantPrefix
    ? utility.slice(1)
    : hasImportantSuffix
      ? utility.slice(0, -1)
      : utility

  if (!bare.startsWith('-')) return null

  const bracketOpen = bare.indexOf('[')
  if (bracketOpen === -1) return null

  const bracketClose = bare.lastIndexOf(']')
  if (bracketClose === -1 || bracketClose < bracketOpen) return null

  const innerValue = bare.slice(bracketOpen + 1, bracketClose)
  if (innerValue.startsWith('-')) return null

  const baseUtility = bare.slice(1, bracketOpen)
  return `${variant}${hasImportantPrefix ? '!' : ''}${baseUtility}[-${innerValue}]${hasImportantSuffix ? '!' : ''}`
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
    hasSuggestions: true,
    messages: {
      moveNegative:
        '"{{className}}" has the negative outside brackets. Use "{{replacement}}" instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const fixed = fixClass(cls)
          if (fixed) offending.push({ cls, replacement: fixed })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = rebuildClassString(
          split,
          classes.map((cls) => replacements.get(cls) ?? cls),
        )

        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId: 'moveNegative',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'moveNegative',
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
