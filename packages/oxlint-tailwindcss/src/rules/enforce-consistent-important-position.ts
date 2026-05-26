import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'

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
    const getPosition = createLazyOptions<Options, 'prefix' | 'suffix'>(
      context,
      (o) => o?.position ?? 'suffix',
    )

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
      const messageId = position === 'prefix' ? 'usePrefix' : 'useSuffix'
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const offending = split.classes.flatMap((cls) => {
          const { utility, variant } = splitUtilityAndVariant(cls)
          const fixed = fixUtility(utility, variant)
          return fixed ? [{ cls, replacement: fixed }] : []
        })
        reportClassReplacements(context, loc, split, split.classes, offending, { messageId })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
