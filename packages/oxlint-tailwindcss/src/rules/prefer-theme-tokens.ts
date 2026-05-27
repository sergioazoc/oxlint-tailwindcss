import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { reattachImportant, splitImportant, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'

/**
 * Match `prefix-(--name)` or `prefix-(--name)/modifier`.
 * Captures: 1=prefix, 2=variable name, 3=optional `/modifier` (kept verbatim).
 */
const PAREN_VAR_RE = /^(.+?)-\(--([\w-]+)\)(\/[^/\s]+)?$/

/**
 * Match `prefix-[var(--name)]` or `prefix-[var(--name)]/modifier`.
 * Captures: 1=prefix, 2=variable name, 3=optional `/modifier`.
 */
const BRACKET_VAR_RE = /^(.+?)-\[var\(--([\w-]+)\)\](\/[^/\s]+)?$/

function detectRawVariable(
  utility: string,
): { prefix: string; varName: string; modifier: string } | null {
  const paren = PAREN_VAR_RE.exec(utility)
  if (paren) return { prefix: paren[1], varName: paren[2], modifier: paren[3] ?? '' }
  const bracket = BRACKET_VAR_RE.exec(utility)
  if (bracket) return { prefix: bracket[1], varName: bracket[2], modifier: bracket[3] ?? '' }
  return null
}

export const preferThemeTokens = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer named theme-token utilities over raw CSS variable references when a matching utility exists',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{}],
    messages: {
      preferNamed:
        '"{{className}}" can be written as "{{replacement}}". Use the named theme token.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache } = ds

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const offending = split.classes.flatMap((cls) => {
          const { utility, variant } = splitUtilityAndVariant(cls)
          const { bare: bareUtility, position } = splitImportant(utility)
          const match = detectRawVariable(bareUtility)
          if (!match) return []

          const candidate = `${match.prefix}-${match.varName}${match.modifier}`
          if (!cache.isValid(candidate)) return []

          // Reject if the named candidate resolves to a class that produces
          // the same CSS as the original — that case is handled by
          // no-unnecessary-arbitrary-value. This rule only catches the
          // heuristic-only cases.
          const namedEquivalent = cache.getNamedEquivalent(bareUtility)
          if (namedEquivalent && namedEquivalent === `${match.prefix}-${match.varName}`) return []

          return [{ cls, replacement: variant + reattachImportant(candidate, position) }]
        })
        reportClassReplacements(context, loc, split, split.classes, offending, {
          messageId: 'preferNamed',
        })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
