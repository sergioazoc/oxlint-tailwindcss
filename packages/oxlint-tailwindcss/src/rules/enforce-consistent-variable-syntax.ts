import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'
import { safeOptions } from '../types'

interface Options {
  syntax?: 'shorthand' | 'explicit'
}

// Match bg-[var(--something)] — simple var() wrapping a single CSS variable
const EXPLICIT_VAR_RE = /^([a-z][a-z0-9-]*(?:-[a-z0-9]+)*)-\[var\((--[a-zA-Z0-9-]+)\)\]$/
// Match bg-(--something) — shorthand v4 syntax
const SHORTHAND_VAR_RE = /^([a-z][a-z0-9-]*(?:-[a-z0-9]+)*)-\((--[a-zA-Z0-9-]+)\)$/

function convertClass(cls: string, syntax: 'shorthand' | 'explicit'): string | null {
  const { utility, variant } = splitUtilityAndVariant(cls)

  // Strip ! (important) for regex matching — prefix or suffix
  const hasImportantPrefix = utility.startsWith('!')
  const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
  const bareUtility = hasImportantPrefix
    ? utility.slice(1)
    : hasImportantSuffix
      ? utility.slice(0, -1)
      : utility
  const importantStart = hasImportantPrefix ? '!' : ''
  const importantEnd = hasImportantSuffix ? '!' : ''

  if (syntax === 'shorthand') {
    const match = EXPLICIT_VAR_RE.exec(bareUtility)
    if (match) {
      const [, prefix, varName] = match
      return `${variant}${importantStart}${prefix}-(${varName})${importantEnd}`
    }
  } else {
    const match = SHORTHAND_VAR_RE.exec(bareUtility)
    if (match) {
      const [, prefix, varName] = match
      return `${variant}${importantStart}${prefix}-[var(${varName})]${importantEnd}`
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
    let _syntax: 'shorthand' | 'explicit' | null = null
    function getSyntax(): 'shorthand' | 'explicit' {
      if (_syntax === null) {
        const options = safeOptions<Options>(context)
        _syntax = options?.syntax ?? 'shorthand'
      }
      return _syntax
    }

    function check(locations: ClassLocation[]) {
      const syntax = getSyntax()
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const converted = convertClass(cls, syntax)
          if (converted) offending.push({ cls, replacement: converted })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = rebuildClassString(
          split,
          classes.map((cls) => replacements.get(cls) ?? cls),
        )
        const messageId = syntax === 'shorthand' ? 'useShorthand' : 'useExplicit'

        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId,
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId,
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
