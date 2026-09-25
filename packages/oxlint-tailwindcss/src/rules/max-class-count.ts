import { defineRule, type ESTree } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { createLazyOptions } from '../utils/context'

interface Options {
  max?: number
}

const DEFAULT_MAX = 20

// Stands in for each `${}` so that a class glued to an expression stays one
// token. Can't occur in source text a template quasi holds.
const EXPRESSION = '\u0000'

/**
 * Classes in a whole template literal: the quasis joined around a placeholder,
 * so `bg-${c}-500` is one class, and a bare `${x}` — whose classes can't be
 * known statically — counts as none.
 */
function countTemplateClasses(template: ESTree.TemplateLiteral): number {
  const text = template.quasis.map((q) => q.value.raw).join(EXPRESSION)
  let count = 0
  for (const token of splitClasses(text)) {
    if (token.replaceAll(EXPRESSION, '').length > 0) count++
  }
  return count
}

export const maxClassCount = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce a maximum number of Tailwind CSS classes per class string',
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
      let templates: Set<ESTree.Node> | null = null
      for (const loc of locations) {
        let node: ESTree.Node = loc.node
        let count: number
        if (loc.node.type === 'TemplateElement') {
          // Every quasi of a template arrives as its own location; count the
          // template once, as the single class string it is at runtime.
          const template = loc.node.parent as ESTree.TemplateLiteral
          templates ??= new Set()
          if (templates.has(template)) continue
          templates.add(template)
          node = template
          count = countTemplateClasses(template)
        } else {
          count = splitClasses(loc.value).length
        }
        if (count > max) {
          context.report({
            node,
            messageId: 'tooMany',
            data: { count: String(count), max: String(max) },
          })
        }
      }
    }

    return createExtractorVisitors(context, check, { raw: true })
  },
})
