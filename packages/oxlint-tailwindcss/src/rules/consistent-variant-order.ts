import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { extractVariants, extractUtility } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { createLazyLoader } from '../design-system/loader'
import type { DesignSystemCache } from '../design-system/cache'
import { isFatalError } from '../utils/fatal'

interface Options {
  entryPoint?: string
  order?: string[]
}

// Pseudo-element variants — must always be innermost (closest to the utility).
// In Tailwind v4 variants apply left-to-right, so pseudo-elements placed before
// element-selecting variants (arbitrary selectors, has-[], aria-*, etc.) produce
// broken CSS (e.g. `&::before { &>svg { ... } }` — pseudo-elements have no children).
const PSEUDO_ELEMENTS = new Set([
  'before',
  'after',
  'file',
  'placeholder',
  'selection',
  'marker',
  'backdrop',
  'first-line',
  'first-letter',
  'details-content',
])

// Default variant ordering: responsive → features → color scheme → container →
// group/peer → interactive states → form states → content → pseudo elements
const DEFAULT_VARIANT_ORDER = [
  // Child/descendant selectors (Tailwind v4)
  '*',
  '**',
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
    hasSuggestions: true,
    // No defaultOptions for `order`: leaving it undefined is what triggers
    // the "use the design system's order when available, fall back to the
    // built-in static list otherwise" detection in createOnce.
    defaultOptions: [{}],
    messages: {
      wrongOrder: '"{{className}}" has variants in wrong order. Use "{{replacement}}" instead.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    // consistent-variant-order is the one DS-optional rule in v1: its static
    // fallback is also fully deterministic, so when no entryPoint is
    // configured we silently fall back to it instead of erroring. Only
    // plugin-fatal errors are swallowed — anything else is rethrown so real
    // bugs stay visible.
    const getPriority = createLazyOptions<Options, (variant: string) => number>(context, (o) => {
      let dsCache: DesignSystemCache | null = null
      try {
        dsCache = getDS().cache
      } catch (err) {
        if (!isFatalError(err)) throw err
      }

      if (o?.order) {
        const map = new Map<string, number>()
        for (let i = 0; i < o.order.length; i++) map.set(o.order[i], i)
        const fallback = o.order.length
        return (v) => map.get(v) ?? fallback
      }

      if (dsCache && dsCache.hasVariantOrder()) {
        const ds = dsCache
        return (v) => ds.getVariantPriority(v) ?? Number.MAX_SAFE_INTEGER
      }

      const map = new Map<string, number>()
      for (let i = 0; i < DEFAULT_VARIANT_ORDER.length; i++) {
        map.set(DEFAULT_VARIANT_ORDER[i], i)
      }
      const fallback = DEFAULT_VARIANT_ORDER.length
      return (v) => map.get(v) ?? fallback
    })

    function reorderClass(cls: string): string | null {
      const variants = extractVariants(cls)
      if (variants.length < 2) return null

      const priorityOf = getPriority()
      const sorted = [...variants].sort((a, b) => priorityOf(a) - priorityOf(b))

      // Pseudo-elements must always be innermost (last in the variant chain).
      // Partition sorted variants: non-pseudo-elements first, pseudo-elements last.
      const nonPseudo: string[] = []
      const pseudo: string[] = []
      for (const v of sorted) {
        if (PSEUDO_ELEMENTS.has(v)) {
          pseudo.push(v)
        } else {
          nonPseudo.push(v)
        }
      }
      const final = nonPseudo.length > 0 && pseudo.length > 0 ? [...nonPseudo, ...pseudo] : sorted

      if (variants.every((v, i) => v === final[i])) return null

      const utility = extractUtility(cls)
      return final.join(':') + ':' + utility
    }

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const fixed = reorderClass(cls)
          if (fixed) offending.push({ cls, replacement: fixed })
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
              messageId: 'wrongOrder',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'wrongOrder',
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
