import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { sortClassesSync } from '../design-system/sort-service'
import { safeOptions } from '../types'

interface Options {
  entryPoint?: string
  mode?: 'default' | 'strict'
}

export const enforceSortOrder = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent sort order of Tailwind CSS classes using the official class order',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          mode: { type: 'string', enum: ['default', 'strict'] },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unsorted: 'Tailwind classes are not in the recommended order.',
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    let _mode: 'default' | 'strict' | null = null
    function getMode(): 'default' | 'strict' {
      if (_mode === null) {
        const opts = safeOptions<Options>(context)
        _mode = opts?.mode ?? 'default'
      }
      return _mode
    }

    function check(locations: ClassLocation[]) {
      const ds = getDS()
      if (!ds) return
      const { cache, entryPoint } = ds
      const mode = getMode()

      /**
       * Safely places custom/unknown classes ahead of standard Tailwind classes
       * within their matching variant contexts, mirroring prettier-plugin-tailwindcss.
       */
      function sortClassesWithCustomPriority(classes: string[], baselineSorted: string[]): string[] {
        const orderedMap = new Map<string, bigint | number | null>(cache.getClassOrder(classes))

        // Helper to check if a class utility segment is completely unknown to Tailwind
        const isUnknownClass = (cls: string): boolean => {
          const { utility } = splitUtilityAndVariant(cls)
          const score = orderedMap.get(utility) ?? orderedMap.get(cls)
          return score === null || score === undefined
        }

        return [...baselineSorted].sort((a, b) => {
          const variantA = splitUtilityAndVariant(a).variant
          const variantB = splitUtilityAndVariant(b).variant

          // Only refine the sort order if both classes share the exact same variant pool
          // (e.g., comparing two base classes, or comparing two "hover:" classes)
          if (variantA === variantB) {
            const unknownA = isUnknownClass(a)
            const unknownB = isUnknownClass(b)

            if (unknownA && !unknownB) return -1 // Prioritize custom 'a' to the front of this group
            if (!unknownA && unknownB) return 1  // Prioritize custom 'b' to the front of this group
          }

          return 0 // Trust the baseline engine sorting for everything else
        })
      }

      function sortDefault(classes: string[]): string[] {
        let targetOrder = sortClassesSync(entryPoint, classes)

        if (!targetOrder) {
          const ordered = cache.getClassOrder(classes)
          const sorted = [...ordered].sort((a, b) => {
            if (a[1] === null && b[1] === null) return 0
            if (a[1] === null) return -1
            if (b[1] === null) return 1
            if (a[1] < b[1]) return -1
            if (a[1] > b[1]) return 1
            return 0
          })
          targetOrder = sorted.map(([name]) => name)
        }

        return sortClassesWithCustomPriority(classes, targetOrder)
      }

      function sortStrict(classes: string[]): string[] {
        const groups = new Map<string, string[]>()
        const groupOrder: string[] = []
        for (const cls of classes) {
          const { variant } = splitUtilityAndVariant(cls)
          if (!groups.has(variant)) {
            groups.set(variant, [])
            groupOrder.push(variant)
          }
          groups.get(variant)!.push(cls)
        }

        for (const [variantKey, groupClasses] of groups) {
          const ordered = cache.getClassOrder(groupClasses)
          ordered.sort((a, b) => {
            if (a[1] === null && b[1] === null) return 0
            if (a[1] === null) return -1
            if (b[1] === null) return 1
            if (a[1] < b[1]) return -1
            if (a[1] > b[1]) return 1
            return 0
          })

          const sortedNames = ordered.map(([name]) => name)
          const finalizedGroupOrder = sortClassesWithCustomPriority(groupClasses, sortedNames)

          groups.set(variantKey, finalizedGroupOrder)
        }

        const sortedGroupKeys = [...groups.keys()].sort((a, b) => {
          if (a === '' && b !== '') return -1
          if (a !== '' && b === '') return 1
          if (a === '' && b === '') return 0

          const variantA = a.slice(0, -1)
          const variantB = b.slice(0, -1)
          const firstA = variantA.includes(':') ? variantA.split(':')[0] : variantA
          const firstB = variantB.includes(':') ? variantB.split(':')[0] : variantB
          const prioA = cache.getVariantPriority(firstA) ?? Number.MAX_SAFE_INTEGER
          const prioB = cache.getVariantPriority(firstB) ?? Number.MAX_SAFE_INTEGER
          return prioA - prioB
        })

        const result: string[] = []
        for (const key of sortedGroupKeys) {
          result.push(...groups.get(key)!)
        }
        return result
      }

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        if (classes.length < 2) continue

        const sortedNames = mode === 'strict' ? sortStrict(classes) : sortDefault(classes)

        const isSorted = classes.every((name, i) => name === sortedNames[i])
        if (isSorted) continue

        context.report({
          node: loc.node,
          messageId: 'unsorted',
          fix(fixer) {
            return fixer.replaceTextRange(
              loc.range,
              preserveSpaces(loc, rebuildClassString(split, sortedNames)),
            )
          },
        })
      }
    }

    return createExtractorVisitors(context, check)
  },
})