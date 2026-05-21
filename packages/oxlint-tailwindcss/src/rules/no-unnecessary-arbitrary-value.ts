import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { hasArbitraryValue, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { safeGetDS } from '../utils/fatal'

export const noUnnecessaryArbitraryValue = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow arbitrary values when a named Tailwind class produces the same CSS',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{}],
    messages: {
      unnecessaryArbitrary:
        '"{{className}}" can be written as "{{replacement}}". Use the named class instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      designSystemUnavailable: '{{message}}',
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      const ds = safeGetDS(getDS, context, locations[0]?.node)
      if (!ds) return
      const { cache } = ds
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          if (!hasArbitraryValue(cls)) continue

          const { utility, variant } = splitUtilityAndVariant(cls)

          // Strip ! (important) for lookup — prefix or suffix
          const hasImportantPrefix = utility.startsWith('!')
          const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
          const bareUtility = hasImportantPrefix
            ? utility.slice(1)
            : hasImportantSuffix
              ? utility.slice(0, -1)
              : utility

          const named = cache.getNamedEquivalent(bareUtility)
          if (!named) continue

          offending.push({
            cls,
            replacement:
              variant + (hasImportantPrefix ? '!' : '') + named + (hasImportantSuffix ? '!' : ''),
          })
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
              messageId: 'unnecessaryArbitrary',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'unnecessaryArbitrary',
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
