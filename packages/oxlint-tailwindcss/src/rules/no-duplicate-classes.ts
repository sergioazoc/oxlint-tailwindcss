import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'

export const noDuplicateClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow duplicate Tailwind CSS classes',
    },
    fixable: 'code',
    schema: [],
    messages: {
      duplicate: 'Duplicate class: "{{className}}". Removing the second occurrence.',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const seen = new Set<string>()
        const duplicates: string[] = []

        for (const cls of classes) {
          if (seen.has(cls)) {
            duplicates.push(cls)
          } else {
            seen.add(cls)
          }
        }

        if (duplicates.length > 0) {
          // Keep the first occurrence of each class, and remember its original
          // index so `rebuildClassString` can preserve the multiline layout
          // (a `\n` that the removed dup carried transfers to the next survivor).
          const firstIdx = new Map<string, number>()
          classes.forEach((c, i) => {
            if (!firstIdx.has(c)) firstIdx.set(c, i)
          })
          const unique = [...firstIdx.keys()]
          const sourceIndices = unique.map((c) => firstIdx.get(c)!)
          const fixed = rebuildClassString(split, unique, sourceIndices)

          for (const dup of duplicates) {
            context.report({
              node: loc.node,
              messageId: 'duplicate',
              data: { className: dup },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixed))
              },
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
