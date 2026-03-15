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
    // w-* + h-* → size-* only when both produce the same CSS value
    // Exclude 'screen' (w-screen=100vw, h-screen=100vh — different units)
    ...(value !== 'screen'
      ? [{ parts: [`w-${value}`, `h-${value}`], replacement: `size-${value}` }]
      : []),
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
        // Strip ! (prefix or suffix) for regex matching
        const values = new Set<string>()
        for (const cls of classes) {
          const bare = cls.startsWith('!')
            ? cls.slice(1)
            : cls.endsWith('!')
              ? cls.slice(0, -1)
              : cls
          const match = VALUE_RE.exec(bare)
          if (match) values.add(match[1])
        }

        for (const value of values) {
          const rules = createShorthandRules(value)

          for (const rule of rules) {
            // Check with ! modifier: all parts must share the same modifier
            const hasImportantPrefix = rule.parts.every((p) => classSet.has(`!${p}`))
            const hasImportantSuffix =
              !hasImportantPrefix && rule.parts.every((p) => classSet.has(`${p}!`))
            const hasPlain = rule.parts.every((p) => classSet.has(p))

            if (!hasImportantPrefix && !hasImportantSuffix && !hasPlain) continue

            const importantStart = hasImportantPrefix ? '!' : ''
            const importantEnd = hasImportantSuffix ? '!' : ''
            const matchParts = rule.parts.map((p) => `${importantStart}${p}${importantEnd}`)
            const remaining = classes.filter((c) => !matchParts.includes(c))
            remaining.push(`${importantStart}${rule.replacement}${importantEnd}`)

            context.report({
              node: loc.node,
              messageId: 'shorthand',
              data: {
                parts: matchParts.map((p) => `"${p}"`).join(', '),
                replacement: `${importantStart}${rule.replacement}${importantEnd}`,
              },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, remaining.join(' ')))
              },
            })
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
