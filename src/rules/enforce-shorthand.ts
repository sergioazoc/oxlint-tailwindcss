import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  preserveSpaces,
  type ClassLocation,
} from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'

const VALUE_RE = /^(?:m[trbl]|p[trbl]|[wh]|rounded-t[lr]|rounded-b[lr]|min-[wh]|max-[wh])-(.+)$/

interface ShorthandRule {
  parts: string[]
  replacement: string
}

/**
 * Generates shorthand rules parameterized by value.
 * E.g.: mt-2 + mr-2 + mb-2 + ml-2 -> m-2
 */
function createShorthandRules(value: string): ShorthandRule[] {
  return [
    {
      parts: [`mt-${value}`, `mr-${value}`, `mb-${value}`, `ml-${value}`],
      replacement: `m-${value}`,
    },
    {
      parts: [`mt-${value}`, `mb-${value}`],
      replacement: `my-${value}`,
    },
    {
      parts: [`ml-${value}`, `mr-${value}`],
      replacement: `mx-${value}`,
    },
    {
      parts: [`pt-${value}`, `pr-${value}`, `pb-${value}`, `pl-${value}`],
      replacement: `p-${value}`,
    },
    {
      parts: [`pt-${value}`, `pb-${value}`],
      replacement: `py-${value}`,
    },
    {
      parts: [`pl-${value}`, `pr-${value}`],
      replacement: `px-${value}`,
    },
    {
      parts: [`w-${value}`, `h-${value}`],
      replacement: `size-${value}`,
    },
    {
      parts: [
        `rounded-tl-${value}`,
        `rounded-tr-${value}`,
        `rounded-br-${value}`,
        `rounded-bl-${value}`,
      ],
      replacement: `rounded-${value}`,
    },
  ]
}

export const enforceShorthand = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce shorthand Tailwind CSS classes when all axes have the same value',
    },
    fixable: 'code',
    schema: [],
    messages: {
      shorthand: '{{parts}} can be simplified to "{{replacement}}".',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        if (classes.length < 2) continue

        const classSet = new Set(classes)

        // Extract all unique values used in the classes
        const values = new Set<string>()
        for (const cls of classes) {
          const match = VALUE_RE.exec(cls)
          if (match) values.add(match[1])
        }

        for (const value of values) {
          const rules = createShorthandRules(value)

          for (const rule of rules) {
            if (rule.parts.every((p) => classSet.has(p))) {
              const remaining = classes.filter((c) => !rule.parts.includes(c))
              remaining.push(rule.replacement)

              context.report({
                node: loc.node,
                messageId: 'shorthand',
                data: {
                  parts: rule.parts.map((p) => `"${p}"`).join(', '),
                  replacement: rule.replacement,
                },
                fix(fixer) {
                  return fixer.replaceTextRange(loc.range, preserveSpaces(loc, remaining.join(' ')))
                },
              })
            }
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        check(extractFromJSXAttribute(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      CallExpression(node) {
        check(extractFromCallExpression(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      TaggedTemplateExpression(node) {
        check(extractFromTaggedTemplate(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      VariableDeclarator(node) {
        check(extractFromVariableDeclarator(node, DEFAULT_EXTRACTOR_CONFIG))
      },
    }
  },
})
