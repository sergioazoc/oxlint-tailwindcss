import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { hasArbitraryValue, extractUtility, splitImportant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'

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
    defaultOptions: [{ allow: [] }],
    messages: {
      noArbitrary:
        '"{{className}}" uses an arbitrary value. Use a design token or extend your theme instead.',
    },
  },
  createOnce(context) {
    const getAllowPrefixes = createLazyOptions<Options, string[]>(
      context,
      (o) => o?.allow ?? [],
    )

    function isAllowed(utility: string): boolean {
      return getAllowPrefixes().some((prefix) => utility.startsWith(prefix))
    }

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        for (const cls of classes) {
          if (!hasArbitraryValue(cls)) continue

          const utility = splitImportant(extractUtility(cls)).bare
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
