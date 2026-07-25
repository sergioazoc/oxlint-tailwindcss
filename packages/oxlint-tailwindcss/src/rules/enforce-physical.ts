import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors } from '../utils/extractors'
import {
  LOGICAL_INSET_ALIASES,
  LOGICAL_PHYSICAL_SCHEMA,
  PHYSICAL_TO_LOGICAL_MAPPINGS,
  createDirectionalMapper,
  invertAxisMappings,
} from './enforce-logical'

export const enforcePhysical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce physical Tailwind CSS properties instead of logical ones for consistency in LTR-only projects',
    },
    fixable: 'code',
    schema: [LOGICAL_PHYSICAL_SCHEMA],
    hasSuggestions: true,
    defaultOptions: [{ allowlist: [], direction: 'both' }],
    messages: {
      usePhysical:
        '"{{className}}" uses a logical property. Use "{{replacement}}" for consistency.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    const { check } = createDirectionalMapper(context, {
      // Both spellings of the logical insets convert back: `start-2` (what
      // enforce-logical suggests) and `inset-s-2` (what enforce-canonical
      // rewrites that into).
      mappings: [...invertAxisMappings(PHYSICAL_TO_LOGICAL_MAPPINGS), ...LOGICAL_INSET_ALIASES],
      messageId: 'usePhysical',
    })
    return createExtractorVisitors(context, check)
  },
})
