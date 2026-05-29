import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitImportant, splitUtilityAndVariant } from '../utils/class-parser'

const VALUE_RE =
  /^(?:m[trbl]|mx|my|p[trbl]|px|py|[wh]|rounded-t[lr]|rounded-b[lr]|min-[wh]|max-[wh])-(.+)$/

// Values where w-X + h-X should NOT merge to size-X (different CSS units per axis)
const INVALID_SIZE_VALUES = new Set(['screen', 'dvw', 'dvh', 'svw', 'svh', 'lvw', 'lvh'])

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
      parts: [`mx-${value}`, `my-${value}`],
      replacement: `m-${value}`,
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
      parts: [`px-${value}`, `py-${value}`],
      replacement: `p-${value}`,
    },
    // w-* + h-* → size-* only when both produce the same CSS value
    // Exclude viewport units where w/h use different axes (vw vs vh)
    ...(!INVALID_SIZE_VALUES.has(value)
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
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        if (classes.length < 2) continue

        const classSet = new Set(classes)

        // Extract unique (variant prefix, value) pairs — variants must match across parts.
        const variantValues = new Set<string>()
        for (const cls of classes) {
          const { utility, variant } = splitUtilityAndVariant(cls)
          const match = VALUE_RE.exec(splitImportant(utility).bare)
          if (match) variantValues.add(`${variant}\0${match[1]}`)
        }

        for (const variantValue of variantValues) {
          const nul = variantValue.indexOf('\0')
          const variant = variantValue.slice(0, nul)
          const value = variantValue.slice(nul + 1)
          const rules = createShorthandRules(value)

          for (const rule of rules) {
            const withVariant = (p: string) => `${variant}${p}`
            // Check with ! modifier: all parts must share the same modifier
            const hasImportantPrefix = rule.parts.every((p) => classSet.has(withVariant(`!${p}`)))
            const hasImportantSuffix =
              !hasImportantPrefix && rule.parts.every((p) => classSet.has(withVariant(`${p}!`)))
            const hasPlain = rule.parts.every((p) => classSet.has(withVariant(p)))

            if (!hasImportantPrefix && !hasImportantSuffix && !hasPlain) continue

            const importantStart = hasImportantPrefix ? '!' : ''
            const importantEnd = hasImportantSuffix ? '!' : ''
            const matchParts = rule.parts.map((p) =>
              withVariant(`${importantStart}${p}${importantEnd}`),
            )
            const remaining = classes.filter((c) => !matchParts.includes(c))
            remaining.push(withVariant(`${importantStart}${rule.replacement}${importantEnd}`))

            context.report({
              node: loc.node,
              messageId: 'shorthand',
              data: {
                parts: matchParts.map((p) => `"${p}"`).join(', '),
                replacement: withVariant(`${importantStart}${rule.replacement}${importantEnd}`),
              },
              fix(fixer) {
                return fixer.replaceTextRange(
                  loc.range,
                  preserveSpaces(loc, rebuildClassString(split, remaining)),
                )
              },
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
