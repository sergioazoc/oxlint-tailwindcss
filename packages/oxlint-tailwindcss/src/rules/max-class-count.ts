import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { createLazyOptions } from '../utils/context'

interface Options {
  max?: number
}

const DEFAULT_MAX = 20

export const maxClassCount = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce a maximum number of Tailwind CSS classes per element',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'number' },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ max: DEFAULT_MAX }],
    messages: {
      tooMany:
        'Too many Tailwind classes ({{count}}). Maximum allowed is {{max}}. Consider extracting into a component or utility.',
    },
  },
  createOnce(context) {
    const getMax = createLazyOptions<Options, number>(context, (o) => o?.max ?? DEFAULT_MAX)

    function check(locations: ClassLocation[]) {
      const max = getMax()
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        if (classes.length > max) {
          context.report({
            node: loc.node,
            messageId: 'tooMany',
            data: { count: String(classes.length), max: String(max) },
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
