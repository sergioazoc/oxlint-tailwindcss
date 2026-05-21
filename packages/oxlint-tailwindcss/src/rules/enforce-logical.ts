import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'

// Mapping of physical properties to logical ones
export const PHYSICAL_TO_LOGICAL: Record<string, string> = {
  ml: 'ms',
  mr: 'me',
  pl: 'ps',
  pr: 'pe',
  left: 'start',
  right: 'end',
  'border-l': 'border-s',
  'border-r': 'border-e',
  'rounded-l': 'rounded-s',
  'rounded-r': 'rounded-e',
  'rounded-tl': 'rounded-ss',
  'rounded-tr': 'rounded-se',
  'rounded-bl': 'rounded-es',
  'rounded-br': 'rounded-ee',
  'scroll-ml': 'scroll-ms',
  'scroll-mr': 'scroll-me',
  'scroll-pl': 'scroll-ps',
  'scroll-pr': 'scroll-pe',
}

export const enforceLogical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce logical (RTL-friendly) Tailwind CSS properties instead of physical ones',
    },
    fixable: 'code',
    schema: [],
    hasSuggestions: true,
    messages: {
      useLogical:
        '"{{className}}" uses a physical property. Use "{{replacement}}" for LTR/RTL support.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    function convertClass(cls: string): string | null {
      const { utility, variant } = splitUtilityAndVariant(cls)

      // Strip ! (important) for lookup — prefix or suffix
      const hasImportantPrefix = utility.startsWith('!')
      const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
      const bareUtility = hasImportantPrefix
        ? utility.slice(1)
        : hasImportantSuffix
          ? utility.slice(0, -1)
          : utility

      for (const [physical, logical] of Object.entries(PHYSICAL_TO_LOGICAL)) {
        if (bareUtility === physical || bareUtility.startsWith(`${physical}-`)) {
          const suffix = bareUtility.slice(physical.length)
          return `${variant}${hasImportantPrefix ? '!' : ''}${logical}${suffix}${hasImportantSuffix ? '!' : ''}`
        }
      }
      return null
    }

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const converted = convertClass(cls)
          if (converted) offending.push({ cls, replacement: converted })
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
              messageId: 'useLogical',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'useLogical',
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
