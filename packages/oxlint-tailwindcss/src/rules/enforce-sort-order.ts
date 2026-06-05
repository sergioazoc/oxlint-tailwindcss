import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { sortClassesSync } from '../design-system/sort-service'
import { createLazyOptions } from '../utils/context'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'

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
    defaultOptions: [{ mode: 'default' }],
    messages: {
      unsorted: 'Tailwind classes are not in the recommended order.',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    const getMode = createLazyOptions<Options, 'default' | 'strict'>(
      context,
      (o) => o?.mode ?? 'default',
    )

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache, entryPoint } = ds
      const mode = getMode()

      function sortDefault(classes: string[]): string[] {
        // Worker provides the exact official Tailwind sort order. Failures
        // throw SortServiceError, which the caller surfaces as a fatal
        // diagnostic via safeGetDS.
        return sortClassesSync(entryPoint, classes)
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

        for (const [, groupClasses] of groups) {
          const ordered = cache.getClassOrder(groupClasses)
          ordered.sort((a, b) => {
            if (a[1] === null && b[1] === null) return 0
            if (a[1] === null) return -1
            if (b[1] === null) return 1
            if (a[1] < b[1]) return -1
            if (a[1] > b[1]) return 1
            return 0
          })
          groupClasses.length = 0
          for (const [name] of ordered) groupClasses.push(name)
        }

        // Normalize the project prefix out of the group key so the base group
        // (`tw:` → '') sorts first and the first REAL variant drives ordering.
        // Without this every prefixed group collapses to first variant `tw`
        // (priority MAX) and the order between groups is unstable.
        const stripKey = (k: string): string =>
          cache.prefix && k.startsWith(cache.prefix + ':') ? k.slice(cache.prefix.length + 1) : k

        const sortedGroupKeys = [...groups.keys()].sort((ka, kb) => {
          const a = stripKey(ka)
          const b = stripKey(kb)
          if (a === '' && b !== '') return -1
          if (a !== '' && b === '') return 1
          if (a === '' && b === '') return 0

          // For compound variant keys like "dark:hover:", use the first variant for ordering
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

        const sortedNames =
          mode === 'strict'
            ? sortStrict(classes)
            : safeGetDS(() => sortDefault(classes), context, loc.node)
        if (!sortedNames) return // worker fatal already reported; stop the check

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
