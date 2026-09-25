import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import {
  extractVariants,
  extractUtility,
  isPseudoElementVariant,
  isSelectorBarrier,
  stripProjectPrefix,
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

/**
 * The order chains are written in, outermost first: where the page is
 * (viewport, features, color scheme, container, media type, direction), then
 * which ancestor or sibling the element sits in, then the element itself — what
 * it is (`aria-*`, `data-*`, `has-*`) before how it's being used, its form state
 * and its position among its siblings. It's the order Tailwind's docs and
 * shadcn/ui write them in (`dark:hover:`, `md:peer-data-*:`,
 * `data-[state=open]:hover:`), and it's the same with or without a design
 * system, which only says which variants are pseudo-elements, which change the
 * target, and which are the project's own breakpoints.
 *
 * One rank per entry; `name-*` matches a prefix. Variants that share a rank keep
 * the order they were written in. `not-X` ranks as X. Pseudo-elements are pinned
 * innermost separately, and a variant with no rank (a project's own
 * `@custom-variant`) is never moved and nothing moves across it.
 */
const CANONICAL_ORDER: readonly (readonly string[])[] = [
  // Where the page is
  ['sm', 'md', 'lg', 'xl', '2xl', 'min-*', 'max-*'],
  ['supports-*'],
  ['motion-safe', 'motion-reduce'],
  ['contrast-more', 'contrast-less'],
  ['forced-colors', 'inverted-colors'],
  ['pointer-*', 'any-pointer-*'],
  ['portrait', 'landscape'],
  ['dark', 'light'],
  ['@*'],
  ['print', 'noscript'],
  ['starting'],
  ['ltr', 'rtl'],
  // Which ancestor or sibling the element sits in
  ['group-*', 'peer-*', 'in-*'],
  // What the element is…
  ['aria-*', 'data-*', 'has-*', 'not-*'],
  // …how it's being used…
  ['visited'],
  ['target'],
  ['hover'],
  ['focus'],
  ['focus-within'],
  ['focus-visible'],
  ['active'],
  // …its form state…
  ['enabled'],
  ['disabled'],
  ['checked'],
  ['indeterminate'],
  ['default'],
  ['required'],
  ['optional'],
  ['valid'],
  ['invalid'],
  ['user-valid'],
  ['user-invalid'],
  ['in-range'],
  ['out-of-range'],
  ['placeholder-shown'],
  ['autofill'],
  ['read-only'],
  ['open'],
  ['inert'],
  // …and where it sits among its siblings
  ['first'],
  ['last'],
  ['only'],
  ['odd'],
  ['even'],
  ['first-of-type'],
  ['last-of-type'],
  ['only-of-type'],
  ['nth-*'],
  ['empty'],
]

const EXACT_RANK = new Map<string, number>()
const PREFIX_RANK: [string, number][] = []
for (let rank = 0; rank < CANONICAL_ORDER.length; rank++) {
  for (const entry of CANONICAL_ORDER[rank]) {
    if (entry.endsWith('*')) PREFIX_RANK.push([entry.slice(0, -1), rank])
    else EXACT_RANK.set(entry, rank)
  }
}
const BREAKPOINT_RANK = EXACT_RANK.get('sm')!
const NOT = 'not-'
const NOT_RANK = PREFIX_RANK.find(([prefix]) => prefix === NOT)![1]

/**
 * A variant's rank in `CANONICAL_ORDER`, or `undefined` when the rule has none.
 * With a design system, a project's own breakpoint ranks with the others:
 * Tailwind makes a variant of every `--breakpoint-*` in the theme.
 */
function canonicalRank(variant: string, ds?: DesignSystemCache | null): number | undefined {
  const exact = EXACT_RANK.get(variant)
  if (exact !== undefined) return exact
  if (variant.startsWith(NOT) && variant.length > NOT.length) {
    return canonicalRank(variant.slice(NOT.length), ds) ?? NOT_RANK
  }
  for (const [prefix, rank] of PREFIX_RANK) {
    if (variant.startsWith(prefix) && variant.length > prefix.length) return rank
  }
  if (ds && ds.getVariantPriority(variant) !== null && ds.definesVar(`--breakpoint-${variant}`)) {
    return BREAKPOINT_RANK
  }
  return undefined
}

export const consistentVariantOrder = defineRule({
  meta: {
    type: 'suggestion',
    docs: ruleDocs('consistent-variant-order', {
      description: 'Enforce a consistent order for Tailwind CSS variant prefixes',
      category: 'consistency',
      recommended: 'warn',
      designSystem: 'optional',
    }),
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
    // No defaultOptions for `order`: leaving it undefined is what selects the
    // built-in order (CANONICAL_ORDER).
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

    // The user's `order`, when given: unlisted variants sort after, in the
    // order they were written.
    function userPriority(order: string[]): (variant: string) => number | undefined {
      const map = new Map<string, number>()
      for (let i = 0; i < order.length; i++) map.set(order[i], i)
      return (v) => map.get(v) ?? order.length
    }
    const userPriorityByOrder = new WeakMap<string[], (variant: string) => number | undefined>()

    // Memoize the prefix PER RESOLVED ENTRY POINT, not once per context.
    // createLazyLoader re-resolves the entry per file, so in a monorepo with a
    // mapping array where one package uses prefix(tw) and another doesn't, a
    // single context-wide memo would pin every file after the first to the
    // first DS's prefix (R-M6).
    const prefixByEntry = new Map<string, string>()

    // DS-OPTIONAL (see `softGetDS`): the order is the same without one; the DS
    // only adds what the project's own variants are.
    function resolveForFile(): {
      priorityOf: (variant: string) => number | undefined
      prefix: string
      factsFor: (variant: string) => VariantFacts | undefined
    } {
      const ds = softGetDS(getDS)
      const dsCache: DesignSystemCache | null = ds ? ds.cache : null
      const entryKey = ds ? ds.entryPoint : ''

      const order = getOptions().order
      let priorityOf: (variant: string) => number | undefined
      if (order) {
        priorityOf = userPriorityByOrder.get(order) ?? userPriority(order)
        userPriorityByOrder.set(order, priorityOf)
      } else {
        priorityOf = (v) => canonicalRank(v, dsCache)
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
      const { prefix: pfx, body } = stripProjectPrefix(cls, prefix)

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
      //    barrier and only reorder within a segment. A variant with no rank
      //    splits segments the same way: the rule can't know where it goes.
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
        segment.sort((a, b) => priorityOf(a)! - priorityOf(b)!)
        reorderedRest.push(...segment)
        segment = []
      }
      for (const v of rest) {
        if (isSelectorBarrier(v, factsFor(v)) || priorityOf(v) === undefined) {
          flushSegment()
          reorderedRest.push(v)
        } else {
          segment.push(v)
        }
      }
      flushSegment()

      pseudo.sort((a, b) => (priorityOf(a) ?? 0) - (priorityOf(b) ?? 0))
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
