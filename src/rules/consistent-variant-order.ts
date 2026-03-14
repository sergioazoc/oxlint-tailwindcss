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
import { extractVariants, extractUtility } from '../utils/class-parser'
import { safeOptions } from '../types'
import { getLoadedDesignSystem } from '../design-system/loader'

interface Options {
  entryPoint?: string
  order?: string[]
}

// Default variant ordering: responsive → features → color scheme → container →
// group/peer → interactive states → form states → content → pseudo elements
const DEFAULT_VARIANT_ORDER = [
  // Responsive
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  // Feature queries
  'supports',
  'motion-safe',
  'motion-reduce',
  'contrast-more',
  'contrast-less',
  'forced-colors',
  // Prefers color scheme
  'dark',
  'light',
  // Container queries
  '@sm',
  '@md',
  '@lg',
  '@xl',
  '@2xl',
  // Print
  'print',
  // Group & peer
  'group-hover',
  'group-focus',
  'group-active',
  'group-first',
  'group-last',
  'peer-hover',
  'peer-focus',
  'peer-checked',
  'peer-invalid',
  'peer-disabled',
  // Interactive states (LVHFA order)
  'hover',
  'focus',
  'focus-within',
  'focus-visible',
  'active',
  // Form states
  'enabled',
  'disabled',
  'checked',
  'indeterminate',
  'default',
  'required',
  'valid',
  'invalid',
  'in-range',
  'out-of-range',
  'placeholder-shown',
  'autofill',
  'read-only',
  // Structural
  'first',
  'last',
  'only',
  'odd',
  'even',
  'first-of-type',
  'last-of-type',
  'only-of-type',
  'empty',
  'has',
  // Content / pseudo elements
  'before',
  'after',
  'file',
  'placeholder',
  'selection',
  'marker',
  'backdrop',
  'first-line',
  'first-letter',
  // Direction
  'ltr',
  'rtl',
  // Open/closed
  'open',
]

export const consistentVariantOrder = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce a consistent order for Tailwind CSS variant prefixes',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          order: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      wrongOrder: '"{{className}}" has variants in wrong order. Use "{{replacement}}" instead.',
    },
  },
  createOnce(context) {
    // Try to load the design system for dynamic variant ordering
    const dsResult = getLoadedDesignSystem()
    const dsCache = dsResult?.cache ?? null

    interface CompiledConfig {
      priorityMap: Map<string, number>
      fallbackPriority: number
    }

    let _config: CompiledConfig | null = null
    function getConfig(): CompiledConfig {
      if (_config === null) {
        const options = safeOptions<Options>(context)
        const priorityMap = new Map<string, number>()

        if (options?.order) {
          // 1. User-specified order takes highest priority
          for (let i = 0; i < options.order.length; i++) {
            priorityMap.set(options.order[i], i)
          }
          _config = { priorityMap, fallbackPriority: options.order.length }
        } else if (dsCache && dsCache.hasVariantOrder()) {
          // 2. Design system variant order
          for (const variant of DEFAULT_VARIANT_ORDER) {
            const p = dsCache.getVariantPriority(variant)
            if (p !== null) priorityMap.set(variant, p)
          }
          // Also include DS variants not in DEFAULT_VARIANT_ORDER
          // by iterating all valid classes isn't needed — the DS provides all variants
          // We use the DS cache directly in getVariantPriority below
          _config = { priorityMap, fallbackPriority: Number.MAX_SAFE_INTEGER }
        } else {
          // 3. Static fallback
          for (let i = 0; i < DEFAULT_VARIANT_ORDER.length; i++) {
            priorityMap.set(DEFAULT_VARIANT_ORDER[i], i)
          }
          _config = { priorityMap, fallbackPriority: DEFAULT_VARIANT_ORDER.length }
        }
      }
      return _config
    }

    function getVariantPriority(variant: string): number {
      const { priorityMap, fallbackPriority } = getConfig()
      const priority = priorityMap.get(variant)
      if (priority !== undefined) return priority

      // When using DS, check the cache directly for variants not in the pre-built map
      if (dsCache && dsCache.hasVariantOrder()) {
        const dsPriority = dsCache.getVariantPriority(variant)
        if (dsPriority !== null) return dsPriority
      }

      // Arbitrary variants sort before all named variants
      if (variant.startsWith('[')) return -1
      // Unknown variants go to the end
      return fallbackPriority
    }

    function reorderClass(cls: string): string | null {
      const variants = extractVariants(cls)
      if (variants.length < 2) return null

      const sorted = [...variants].sort((a, b) => getVariantPriority(a) - getVariantPriority(b))
      if (variants.every((v, i) => v === sorted[i])) return null

      const utility = extractUtility(cls)
      return sorted.join(':') + ':' + utility
    }

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const fixed = reorderClass(cls)
          if (fixed) offending.push({ cls, replacement: fixed })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = classes.map((cls) => replacements.get(cls) ?? cls).join(' ')

        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId: 'wrongOrder',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, fixedValue)
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'wrongOrder',
              data: { className: cls, replacement },
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
