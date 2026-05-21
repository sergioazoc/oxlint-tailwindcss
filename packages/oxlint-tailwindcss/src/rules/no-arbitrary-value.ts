import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { hasArbitraryValue, extractUtility } from '../utils/class-parser'
import { safeOptions } from '../types'

interface Options {
  allow?: string[]
}

export const noArbitraryValue = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow arbitrary values in Tailwind CSS classes',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noArbitrary:
        '"{{className}}" uses an arbitrary value. Use a design token or extend your theme instead.',
    },
  },
  createOnce(context) {
    let _allowPrefixes: string[] | null = null
    function getAllowPrefixes(): string[] {
      if (_allowPrefixes === null) {
        const options = safeOptions<Options>(context)
        _allowPrefixes = options?.allow ?? []
      }
      return _allowPrefixes
    }

    function isAllowed(utility: string): boolean {
      return getAllowPrefixes().some((prefix) => utility.startsWith(prefix))
    }

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        for (const cls of classes) {
          if (!hasArbitraryValue(cls)) continue

          let utility = extractUtility(cls)
          if (utility.startsWith('!')) utility = utility.slice(1)
          else if (utility.endsWith('!')) utility = utility.slice(0, -1)
          if (isAllowed(utility)) continue

          context.report({
            node: loc.node,
            messageId: 'noArbitrary',
            data: { className: cls },
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
