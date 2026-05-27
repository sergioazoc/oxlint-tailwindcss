import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { findBestSuggestion } from '../utils/levenshtein'
import { splitImportant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { createLazyOptions } from '../utils/context'
import { DEPRECATED_MAP } from './no-deprecated-classes'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'

interface Options {
  entryPoint?: string
  allowlist?: string[]
  ignorePrefixes?: string[]
}

export const noUnknownClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow classes that are not defined in the Tailwind CSS design system',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          allowlist: { type: 'array', items: { type: 'string' } },
          ignorePrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{ allowlist: [], ignorePrefixes: [] }],
    messages: {
      unknown: '"{{className}}" is not a valid Tailwind class.',
      unknownWithSuggestion:
        '"{{className}}" is not a valid Tailwind class. Did you mean "{{suggestion}}"?',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    const getLazyOptions = createLazyOptions<
      Options,
      { allowlist: Set<string>; ignorePrefixes: string[] }
    >(context, (o) => ({
      allowlist: new Set(o?.allowlist ?? []),
      ignorePrefixes: o?.ignorePrefixes ?? [],
    }))

    function shouldIgnore(className: string): boolean {
      const { allowlist, ignorePrefixes } = getLazyOptions()
      if (allowlist.has(className)) return true
      return ignorePrefixes.some((prefix) => className.startsWith(prefix))
    }

    function stripModifiers(className: string): string {
      return splitImportant(className).bare
    }

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache } = ds

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes

        for (const cls of classes) {
          if (shouldIgnore(cls)) continue

          const stripped = stripModifiers(cls)
          if (cache.isValid(stripped)) continue

          // Don't report deprecated classes — no-deprecated-classes handles those
          if (DEPRECATED_MAP[stripped]) continue

          const suggestion = findBestSuggestion(stripped, cache.validClasses)

          if (suggestion) {
            const fixedValue = rebuildClassString(
              split,
              classes.map((c) => (c === cls ? suggestion : c)),
            )
            context.report({
              node: loc.node,
              messageId: 'unknownWithSuggestion',
              data: { className: cls, suggestion },
              suggest: [
                {
                  messageId: 'suggestReplace',
                  data: { className: cls, replacement: suggestion },
                  fix(fixer) {
                    return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
                  },
                },
              ],
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'unknown',
              data: { className: cls },
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
