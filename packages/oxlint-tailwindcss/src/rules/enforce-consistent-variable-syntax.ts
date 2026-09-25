import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { convertVarSyntax } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { SETTINGS_MESSAGE } from '../utils/settings-check'

interface Options {
  syntax?: 'shorthand' | 'explicit'
}

export const enforceConsistentVariableSyntax = defineRule({
  meta: {
    type: 'suggestion',
    docs: ruleDocs('enforce-consistent-variable-syntax', {
      description: 'Enforce consistent CSS variable syntax: bg-[var(--color)] ↔ bg-(--color)',
      category: 'consistency',
      recommended: 'warn',
      designSystem: 'none',
    }),
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
      ...SETTINGS_MESSAGE,
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
          const converted = convertVarSyntax(cls, syntax)
          return converted ? [{ cls, replacement: converted }] : []
        })
        reportClassReplacements(context, loc, split, split.classes, offending, { messageId })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
