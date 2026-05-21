import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { safeGetDS } from '../utils/fatal'

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
      designSystemUnavailable: '{{message}}',
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
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const { utility, variant } = splitUtilityAndVariant(cls)

          // Strip ! (important) — prefix or suffix
          const hasImportantPrefix = utility.startsWith('!')
          const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
          const bareUtility = hasImportantPrefix
            ? utility.slice(1)
            : hasImportantSuffix
              ? utility.slice(0, -1)
              : utility

          const match = detectRawVariable(bareUtility)
          if (!match) continue

          const candidate = `${match.prefix}-${match.varName}${match.modifier}`
          if (!cache.isValid(candidate)) continue

          // Reject if the named candidate resolves to a class that produces
          // the same CSS as the original — that case is handled by
          // no-unnecessary-arbitrary-value (CSS-equivalent fix). This rule
          // only reports the heuristic-only cases.
          const namedEquivalent = cache.getNamedEquivalent(bareUtility)
          if (namedEquivalent && namedEquivalent === `${match.prefix}-${match.varName}`) continue

          const replacement =
            variant + (hasImportantPrefix ? '!' : '') + candidate + (hasImportantSuffix ? '!' : '')

          offending.push({ cls, replacement })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = rebuildClassString(
          split,
          classes.map((cls) => replacements.get(cls) ?? cls),
        )

        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId: 'preferNamed',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'preferNamed',
              data: { className: cls, replacement },
              suggest: [
                {
                  messageId: 'suggestReplace',
                  data: { className: cls, replacement },
                  fix(fixer) {
                    return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
                  },
                },
              ],
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
