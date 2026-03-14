import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  type ClassLocation,
} from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { hasArbitraryValue, getArbitraryValue, extractUtility } from '../utils/class-parser'
import { safeOptions } from '../types'

interface Options {
  entryPoint?: string
  allow?: string[]
}

// Color-related utility prefixes
const COLOR_UTILITY_PREFIXES = [
  'bg',
  'text',
  'border',
  'border-t',
  'border-b',
  'border-l',
  'border-r',
  'border-s',
  'border-e',
  'border-x',
  'border-y',
  'outline',
  'ring',
  'ring-offset',
  'shadow',
  'accent',
  'caret',
  'fill',
  'stroke',
  'decoration',
  'divide',
  'placeholder',
  'from',
  'via',
  'to',
]

// Patterns that match hardcoded color values
const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const RGB_RE = /^rgba?\s*\(/
const HSL_RE = /^hsla?\s*\(/
const OKLCH_RE = /^oklch\s*\(/
const OKLAB_RE = /^oklab\s*\(/
const LCH_RE = /^lch\s*\(/
const LAB_RE = /^lab\s*\(/
const HWB_RE = /^hwb\s*\(/
const COLOR_RE = /^color\s*\(/

function isHardcodedColor(value: string): boolean {
  const trimmed = value.trim()
  return (
    HEX_RE.test(trimmed) ||
    RGB_RE.test(trimmed) ||
    HSL_RE.test(trimmed) ||
    OKLCH_RE.test(trimmed) ||
    OKLAB_RE.test(trimmed) ||
    LCH_RE.test(trimmed) ||
    LAB_RE.test(trimmed) ||
    HWB_RE.test(trimmed) ||
    COLOR_RE.test(trimmed)
  )
}

function isColorUtility(utility: string): boolean {
  for (const prefix of COLOR_UTILITY_PREFIXES) {
    if (utility === prefix || utility.startsWith(`${prefix}-`)) return true
  }
  return false
}

export const noHardcodedColors = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hardcoded color values in Tailwind CSS classes',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          allow: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noHardcoded:
        '"{{className}}" uses a hardcoded color value. Use a design token from your theme instead.',
    },
  },
  createOnce(context) {
    let _allowlist: Set<string> | null = null
    function getAllowlist(): Set<string> {
      if (_allowlist === null) {
        const options = safeOptions<Options>(context)
        _allowlist = new Set(options?.allow ?? [])
      }
      return _allowlist
    }

    function check(locations: ClassLocation[]) {
      const allowlist = getAllowlist()
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        for (const cls of classes) {
          if (allowlist.has(cls)) continue
          if (!hasArbitraryValue(cls)) continue

          const utility = extractUtility(cls)
          if (!isColorUtility(utility)) continue

          const value = getArbitraryValue(cls)
          if (!value) continue

          if (isHardcodedColor(value)) {
            context.report({
              node: loc.node,
              messageId: 'noHardcoded',
              data: { className: cls },
            })
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        check(extractFromJSXAttribute(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      CallExpression(node) {
        check(extractFromCallExpression(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      TaggedTemplateExpression(node) {
        check(extractFromTaggedTemplate(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      VariableDeclarator(node) {
        check(extractFromVariableDeclarator(node, DEFAULT_EXTRACTOR_CONFIG))
      },
    }
  },
})
