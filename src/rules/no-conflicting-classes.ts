import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  type ClassLocation,
} from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { extractUtility, getVariantPrefix } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'

export const noConflictingClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Tailwind CSS classes that generate conflicting CSS properties',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      conflict:
        '"{{classA}}" and "{{classB}}" affect {{properties}}. "{{winner}}" takes precedence (appears later).',
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      const ds = getDS()
      if (!ds) return
      const { cache } = ds
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        if (classes.length < 2) continue

        // Group classes by variant prefix (bracket-aware)
        const byVariant = new Map<string, string[]>()
        for (const cls of classes) {
          const variant = getVariantPrefix(cls)
          const existing = byVariant.get(variant) ?? []
          existing.push(cls)
          byVariant.set(variant, existing)
        }

        for (const [, variantClasses] of byVariant) {
          if (variantClasses.length < 2) continue

          // For each pair of classes in the same variant, compare CSS properties
          const propsMap = new Map<string, string[]>()
          for (const cls of variantClasses) {
            let utility = extractUtility(cls)
            // Strip ! (important) for lookup — prefix or suffix
            if (utility.startsWith('!')) utility = utility.slice(1)
            else if (utility.endsWith('!')) utility = utility.slice(0, -1)
            const props = cache.getCssProperties(utility)
            propsMap.set(cls, props)
          }

          // Gradient utilities (from-*, via-*, to-*) are complementary, not conflicting
          const gradientRe = /^(?:from|via|to)-/
          // divide-* targets child elements (> * + *), not the element itself
          const divideRe = /^divide-/
          const borderRe = /^border(?:-[trblxyse])?-/

          function shouldSkipPair(a: string, b: string): boolean {
            let ua = extractUtility(a)
            let ub = extractUtility(b)
            if (ua.startsWith('!')) ua = ua.slice(1)
            if (ub.startsWith('!')) ub = ub.slice(1)
            // Gradient pairs are complementary
            if (gradientRe.test(ua) && gradientRe.test(ub)) return true
            // divide-* vs border-* target different elements
            if ((divideRe.test(ua) && borderRe.test(ub)) || (divideRe.test(ub) && borderRe.test(ua)))
              return true
            return false
          }

          // Detect conflicts
          for (let i = 0; i < variantClasses.length; i++) {
            const classA = variantClasses[i]
            const propsA = propsMap.get(classA) ?? []

            for (let j = i + 1; j < variantClasses.length; j++) {
              const classB = variantClasses[j]
              const propsB = propsMap.get(classB) ?? []

              // Skip pairs that share CSS properties but target different elements/roles
              if (shouldSkipPair(classA, classB)) continue

              const overlap = propsA.filter((p) => propsB.includes(p))
              if (overlap.length > 0) {
                const propList =
                  overlap.length <= 3
                    ? `"${overlap.join('", "')}"`
                    : `${overlap.length} CSS properties`

                context.report({
                  node: loc.node,
                  messageId: 'conflict',
                  data: {
                    classA,
                    classB,
                    properties: propList,
                    winner: classB,
                  },
                })
              }
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
