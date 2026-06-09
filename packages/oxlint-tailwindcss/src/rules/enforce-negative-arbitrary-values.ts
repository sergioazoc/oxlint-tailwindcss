import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { splitUtilityAndVariant } from '../utils/class-parser'

// Only a plain numeric dimension can be negated by prefixing `-` inside the
// brackets. Tailwind v4 negates wrapped values (calc(), var(), expressions) by
// emitting `calc(<value> * -1)`, so `-x-[calc(...)]` is valid; rewriting it to
// `x-[-calc(...)]` would produce invalid CSS (`-calc(...)`/`-var(...)`) and
// silently drop the style. Bail out unless the value is a bare number + unit.
const SIMPLE_DIMENSION = /^\d*\.?\d+[a-z%]*$/

function fixClass(cls: string): string | null {
  const { utility, variant } = splitUtilityAndVariant(cls)

  // Strip ! (important) for analysis — prefix or suffix
  const hasImportantPrefix = utility.startsWith('!')
  const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
  const bare = hasImportantPrefix
    ? utility.slice(1)
    : hasImportantSuffix
      ? utility.slice(0, -1)
      : utility

  if (!bare.startsWith('-')) return null

  const bracketOpen = bare.indexOf('[')
  if (bracketOpen === -1) return null

  const bracketClose = bare.lastIndexOf(']')
  if (bracketClose === -1 || bracketClose < bracketOpen) return null

  const innerValue = bare.slice(bracketOpen + 1, bracketClose)
  if (innerValue.startsWith('-')) return null
  if (!SIMPLE_DIMENSION.test(innerValue)) return null

  const baseUtility = bare.slice(1, bracketOpen)
  return `${variant}${hasImportantPrefix ? '!' : ''}${baseUtility}[-${innerValue}]${hasImportantSuffix ? '!' : ''}`
}

/**
 * Detects `-utility-[value]` and suggests `utility-[-value]`.
 * e.g. `-top-[5px]` → `top-[-5px]`
 */
export const enforceNegativeArbitraryValues = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce moving the negative sign inside arbitrary value brackets: -top-[5px] → top-[-5px]',
    },
    fixable: 'code',
    schema: [],
    hasSuggestions: true,
    messages: {
      moveNegative:
        '"{{className}}" has the negative outside brackets. Use "{{replacement}}" instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const offending = split.classes.flatMap((cls) => {
          const fixed = fixClass(cls)
          return fixed ? [{ cls, replacement: fixed }] : []
        })
        reportClassReplacements(context, loc, split, split.classes, offending, {
          messageId: 'moveNegative',
        })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
