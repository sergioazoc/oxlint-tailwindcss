import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { safeGetDS } from '../utils/fatal'

// Mapping of deprecated classes in TW v4 to their replacements
export const DEPRECATED_MAP: Record<string, string> = {
  'flex-grow': 'grow',
  'flex-grow-0': 'grow-0',
  'flex-shrink': 'shrink',
  'flex-shrink-0': 'shrink-0',
  'overflow-ellipsis': 'text-ellipsis',
  'decoration-slice': 'box-decoration-slice',
  'decoration-clone': 'box-decoration-clone',
  'bg-gradient-to-t': 'bg-linear-to-t',
  'bg-gradient-to-tr': 'bg-linear-to-tr',
  'bg-gradient-to-r': 'bg-linear-to-r',
  'bg-gradient-to-br': 'bg-linear-to-br',
  'bg-gradient-to-b': 'bg-linear-to-b',
  'bg-gradient-to-bl': 'bg-linear-to-bl',
  'bg-gradient-to-l': 'bg-linear-to-l',
  'bg-gradient-to-tl': 'bg-linear-to-tl',
}

export const noDeprecatedClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow deprecated Tailwind CSS v4 classes',
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
      deprecated: '"{{className}}" is deprecated in Tailwind v4. Use "{{replacement}}" instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      designSystemUnavailable: '{{message}}',
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      const dsResult = safeGetDS(getDS, context, locations[0]?.node)
      if (!dsResult) return
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const { utility, variant } = splitUtilityAndVariant(cls)

          // Strip ! (important) for lookup — prefix or suffix
          const hasImportantPrefix = utility.startsWith('!')
          const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
          const bareUtility = hasImportantPrefix
            ? utility.slice(1)
            : hasImportantSuffix
              ? utility.slice(0, -1)
              : utility

          const replacement = DEPRECATED_MAP[bareUtility]
          if (!replacement) continue

          // If we have a design system, verify with canonicalize
          if (dsResult) {
            const canonical = dsResult.cache.canonicalize(bareUtility)
            if (canonical !== bareUtility && canonical === replacement) {
              // Confirmed by the design system
            }
          }

          const fullReplacement =
            variant +
            (hasImportantPrefix ? '!' : '') +
            replacement +
            (hasImportantSuffix ? '!' : '')
          offending.push({ cls, replacement: fullReplacement })
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
              messageId: 'deprecated',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'deprecated',
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
