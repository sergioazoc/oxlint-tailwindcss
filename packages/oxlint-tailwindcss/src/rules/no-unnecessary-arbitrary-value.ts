import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import {
  hasArbitraryValue,
  reattachImportant,
  splitImportant,
  splitUtilityAndVariant,
} from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'

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
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache } = ds
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const offending = split.classes.flatMap((cls) => {
          if (!hasArbitraryValue(cls)) return []
          const { utility, variant } = splitUtilityAndVariant(cls)
          const { bare: bareUtility, position } = splitImportant(utility)
          const named = cache.getNamedEquivalent(bareUtility)
          return named ? [{ cls, replacement: variant + reattachImportant(named, position) }] : []
        })
        reportClassReplacements(context, loc, split, split.classes, offending, {
          messageId: 'unnecessaryArbitrary',
        })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
