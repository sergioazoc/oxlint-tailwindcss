import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { reattachImportant, splitImportant, splitUtilityAndVariant } from '../utils/class-parser'

// Mapping of deprecated classes in TW v4 to their replacements
export const DEPRECATED_MAP: Record<string, string> = {
  'flex-grow': 'grow',
  'flex-grow-0': 'grow-0',
  'flex-shrink': 'shrink',
  'flex-shrink-0': 'shrink-0',
  'overflow-ellipsis': 'text-ellipsis',
  'decoration-slice': 'box-decoration-slice',
  'decoration-clone': 'box-decoration-clone',
  'bg-gradient-to-t': 'bg-linear-to-t',
  'bg-gradient-to-tr': 'bg-linear-to-tr',
  'bg-gradient-to-r': 'bg-linear-to-r',
  'bg-gradient-to-br': 'bg-linear-to-br',
  'bg-gradient-to-b': 'bg-linear-to-b',
  'bg-gradient-to-bl': 'bg-linear-to-bl',
  'bg-gradient-to-l': 'bg-linear-to-l',
  'bg-gradient-to-tl': 'bg-linear-to-tl',
}

export const noDeprecatedClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow deprecated Tailwind CSS v4 classes',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          // Accepted for backwards compat with configs from before the DS-guard
          // was removed. This rule uses a hardcoded rename map and never reads
          // the design system, so the option is ignored.
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{}],
    messages: {
      deprecated: '"{{className}}" is deprecated in Tailwind v4. Use "{{replacement}}" instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const offending = split.classes.flatMap((cls) => {
          const { utility, variant } = splitUtilityAndVariant(cls)
          const { bare: bareUtility, position } = splitImportant(utility)
          const replacement = DEPRECATED_MAP[bareUtility]
          return replacement
            ? [{ cls, replacement: variant + reattachImportant(replacement, position) }]
            : []
        })
        reportClassReplacements(context, loc, split, split.classes, offending, {
          messageId: 'deprecated',
        })
      }
    }

    return createExtractorVisitors(context, check)
  },
})
