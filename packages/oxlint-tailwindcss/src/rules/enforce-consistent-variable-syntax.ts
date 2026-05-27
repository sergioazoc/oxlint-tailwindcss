import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { reattachImportant, splitImportant, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'

interface Options {
  syntax?: 'shorthand' | 'explicit'
}

// Match bg-[var(--something)] — simple var() wrapping a single CSS variable
const EXPLICIT_VAR_RE = /^([a-z][a-z0-9-]*(?:-[a-z0-9]+)*)-\[var\((--[a-zA-Z0-9-]+)\)\]$/
// Match bg-(--something) — shorthand v4 syntax
const SHORTHAND_VAR_RE = /^([a-z][a-z0-9-]*(?:-[a-z0-9]+)*)-\((--[a-zA-Z0-9-]+)\)$/

function convertClass(cls: string, syntax: 'shorthand' | 'explicit'): string | null {
  const { utility, variant } = splitUtilityAndVariant(cls)
  const { bare: bareUtility, position } = splitImportant(utility)

  if (syntax === 'shorthand') {
    const match = EXPLICIT_VAR_RE.exec(bareUtility)
    if (match) {
      const [, prefix, varName] = match
      return `${variant}${reattachImportant(`${prefix}-(${varName})`, position)}`
    }
  } else {
    const match = SHORTHAND_VAR_RE.exec(bareUtility)
    if (match) {
      const [, prefix, varName] = match
      return `${variant}${reattachImportant(`${prefix}-[var(${varName})]`, position)}`
    }
  }
  return null
}

export const enforceConsistentVariableSyntax = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce consistent CSS variable syntax: bg-[var(--color)] ↔ bg-(--color)',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          syntax: { type: 'string', enum: ['shorthand', 'explicit'] },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{ syntax: 'shorthand' }],
    messages: {
      useShorthand:
        '"{{className}}" uses explicit var() syntax. Use "{{replacement}}" (shorthand) instead.',
      useExplicit:
        '"{{className}}" uses shorthand syntax. Use "{{replacement}}" (explicit) instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    const getSyntax = createLazyOptions<Options, 'shorthand' | 'explicit'>(
      context,
      (o) => o?.syntax ?? 'shorthand',
    )

    function check(locations: ClassLocation[]) {
      const syntax = getSyntax()
      const messageId = syntax === 'shorthand' ? 'useShorthand' : 'useExplicit'
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const offending = split.classes.flatMap((cls) => {
          const converted = convertClass(cls, syntax)
          return converted ? [{ cls, replacement: converted }] : []
        })
        reportClassReplacements(context, loc, split, split.classes, offending, { messageId })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
