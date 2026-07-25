import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import {
  extractVariants,
  extractUtility,
  isPseudoElementVariant,
  isSelectorBarrier,
} from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { type VariantFacts } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import type { DesignSystemCache } from '../design-system/cache'
import { softGetDS } from '../utils/fatal'

interface Options {
  entryPoint?: string
  order?: string[]
}

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
    const getOptions = createLazyOptions<Options, { order?: string[] }>(context, (o) => ({
      order: o?.order,
    }))

    function buildPriority(
      order: string[] | undefined,
      dsCache: DesignSystemCache | null,
    ): (variant: string) => number {
      if (order) {
        const map = new Map<string, number>()
        for (let i = 0; i < order.length; i++) map.set(order[i], i)
        const fallback = order.length
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
    }

    // Memoize priority + prefix PER RESOLVED ENTRY POINT, not once per context.
    // createLazyLoader re-resolves the entry per file, so in a monorepo with a
    // mapping array where one package uses prefix(tw) and another doesn't (or
    // they declare different variant orders), a single context-wide memo would
    // pin every file after the first to the first DS's prefix/order (R-M6).
    const priorityByEntry = new Map<string, (variant: string) => number>()
    const prefixByEntry = new Map<string, string>()

    // DS-OPTIONAL (see `softGetDS`): this rule's static fallback is also fully
    // deterministic, so with no entryPoint configured we silently fall back to it.
    function resolveForFile(): {
      priorityOf: (variant: string) => number
      prefix: string
      factsFor: (variant: string) => VariantFacts | undefined
    } {
      const ds = softGetDS(getDS)
      const dsCache: DesignSystemCache | null = ds ? ds.cache : null
      const entryKey = ds ? ds.entryPoint : ''

      let priorityOf = priorityByEntry.get(entryKey)
      if (!priorityOf) {
        priorityOf = buildPriority(getOptions().order, dsCache)
        priorityByEntry.set(entryKey, priorityOf)
      }
      let prefix = prefixByEntry.get(entryKey)
      if (prefix === undefined) {
        // The project prefix (`tw:`) is structurally a variant but MUST stay
        // first (`hover:tw:flex` produces no CSS). '' when no DS / no prefix.
        prefix = dsCache?.prefix ?? ''
        prefixByEntry.set(entryKey, prefix)
      }
      // Derived from the selectors the design system reports per variant, so a
      // project's own `@custom-variant` and the ancestor/sibling variants
      // (`group-*`, `peer-*`) are classified correctly instead of by name.
      const factsFor = dsCache
        ? (variant: string) => dsCache.getVariantFacts(variant)
        : () => undefined
      return { priorityOf, prefix, factsFor }
    }

    function reorderClass(cls: string): string | null {
      const { priorityOf, prefix, factsFor } = resolveForFile()
      let pfx = ''
      let body = cls
      if (prefix && cls.startsWith(prefix + ':')) {
        pfx = prefix + ':'
        body = cls.slice(prefix.length + 1)
      }

      const variants = extractVariants(body)
      if (variants.length < 2) return null

      // Two ordering rules with different scopes:
      //
      // 1. Pseudo-elements (`before`, `after`, …) always go innermost (last),
      //    even across a selector barrier: `before:[&>svg]` (`&::before > svg`,
      //    a ::before has no svg child) is wrong; `[&>svg]:before`
      //    (`& > svg::before`) is right. So pseudo-elements are pulled out and
      //    appended at the end (issue #12).
      //
      // 2. State variants (`hover`, `focus`, `sm`, …) must NOT cross a selector
      //    barrier (`*`, `**`, `[&>svg]`, `*:…`): `hover:[&>svg]` (`&:hover >
      //    svg`) and `[&>svg]:hover` (`& > svg:hover`) target different
      //    elements (R-A2). So we segment the non-pseudo variants at each
      //    barrier and only reorder within a segment.
      const pseudo: string[] = []
      const rest: string[] = []
      for (const v of variants) {
        if (isPseudoElementVariant(v, factsFor(v))) pseudo.push(v)
        else rest.push(v)
      }

      const reorderedRest: string[] = []
      let segment: string[] = []
      const flushSegment = () => {
        if (segment.length === 0) return
        segment.sort((a, b) => priorityOf(a) - priorityOf(b))
        reorderedRest.push(...segment)
        segment = []
      }
      for (const v of rest) {
        if (isSelectorBarrier(v, factsFor(v))) {
          flushSegment()
          reorderedRest.push(v)
        } else {
          segment.push(v)
        }
      }
      flushSegment()

      pseudo.sort((a, b) => priorityOf(a) - priorityOf(b))
      const final = [...reorderedRest, ...pseudo]

      if (variants.every((v, i) => v === final[i])) return null

      const utility = extractUtility(body)
      return pfx + final.join(':') + ':' + utility
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
