import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors } from '../utils/extractors'
import {
  LOGICAL_PHYSICAL_SCHEMA,
  PHYSICAL_TO_LOGICAL_MAPPINGS,
  createDirectionalMapper,
  invertAxisMappings,
} from './enforce-logical'
import { SETTINGS_MESSAGE } from '../utils/settings-check'

const PHYSICAL_MAPPINGS = invertAxisMappings(PHYSICAL_TO_LOGICAL_MAPPINGS)

export const enforcePhysical = defineRule({
  meta: {
    type: 'suggestion',
    docs: ruleDocs('enforce-physical', {
      description:
        'Enforce physical Tailwind CSS properties instead of logical ones for consistency in LTR-only projects',
      category: 'consistency',
      recommended: false,
      designSystem: 'optional',
    }),
    fixable: 'code',
    schema: [LOGICAL_PHYSICAL_SCHEMA],
    hasSuggestions: true,
    defaultOptions: [{ allowlist: [], direction: 'both', sizing: false }],
    messages: {
      ...SETTINGS_MESSAGE,
      usePhysical:
        '"{{className}}" uses a logical property. Use "{{replacement}}" for consistency.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    const { check } = createDirectionalMapper(context, {
      // Both spellings of the logical insets convert back: `inset-s-2` (what
      // enforce-logical and enforce-canonical write on Tailwind 4.2+) and
      // `start-2` (their fallback, and the older spelling).
      mappings: PHYSICAL_MAPPINGS,
      messageId: 'usePhysical',
    })
    return createExtractorVisitors(context, check)
  },
})
