import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'
import { PHYSICAL_TO_LOGICAL } from './enforce-logical'

// Invert the mapping: logical → physical
const LOGICAL_TO_PHYSICAL: Record<string, string> = {}
for (const [physical, logical] of Object.entries(PHYSICAL_TO_LOGICAL)) {
  LOGICAL_TO_PHYSICAL[logical] = physical
}

export const enforcePhysical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce physical Tailwind CSS properties instead of logical ones for consistency in LTR-only projects',
    },
    fixable: 'code',
    schema: [],
    hasSuggestions: true,
    messages: {
      usePhysical:
        '"{{className}}" uses a logical property. Use "{{replacement}}" for consistency.',
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

      for (const [logical, physical] of Object.entries(LOGICAL_TO_PHYSICAL)) {
        if (bareUtility === logical || bareUtility.startsWith(`${logical}-`)) {
          const suffix = bareUtility.slice(logical.length)
          return `${variant}${hasImportantPrefix ? '!' : ''}${physical}${suffix}${hasImportantSuffix ? '!' : ''}`
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
              messageId: 'usePhysical',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'usePhysical',
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
