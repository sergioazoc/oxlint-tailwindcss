import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { reattachImportant, splitImportant, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { compileRegexList, matchesAny } from '../utils/allowlist'
import { createLazyLoader } from '../design-system/loader'
import { softGetDS } from '../utils/fatal'
import { makeReplacementGuard } from '../utils/replacement'

export type Direction = 'inline' | 'block' | 'both'

/**
 * Shared `{ allowlist, direction }` shape consumed by both enforce-logical and
 * enforce-physical. Co-located here so a future option addition lands in one
 * place.
 */
export interface LogicalPhysicalOptions {
  allowlist?: string[]
  direction?: Direction
  entryPoint?: string
}

export const LOGICAL_PHYSICAL_SCHEMA = {
  type: 'object',
  properties: {
    allowlist: { type: 'array', items: { type: 'string' } },
    direction: { type: 'string', enum: ['inline', 'block', 'both'] },
    entryPoint: { type: 'string' },
  },
  additionalProperties: false,
} as const

/**
 * A directional mapping entry: replace `from` with `to` along `axis`. Used by
 * both enforce-logical (physical → logical) and enforce-physical (logical →
 * physical, just the inverted table).
 *
 * The `axis` tag lets the rule's `direction` option filter — today every entry
 * is `'inline'` because Tailwind has no block-axis logical-vs-physical pair,
 * but the shape is in place for when it does.
 */
export interface AxisMapping {
  from: string
  to: string
  axis: 'inline' | 'block'
  /**
   * The direction is the VALUE, not part of the property, so the utility is
   * already complete: `float-left`, never `float-left-4`. Without this the prefix
   * scan would happily rewrite `float-left-0` — a class that does not exist — into
   * another one that doesn't either.
   */
  exact?: true
}

export const PHYSICAL_TO_LOGICAL_MAPPINGS: AxisMapping[] = [
  { from: 'ml', to: 'ms', axis: 'inline' },
  { from: 'mr', to: 'me', axis: 'inline' },
  { from: 'pl', to: 'ps', axis: 'inline' },
  { from: 'pr', to: 'pe', axis: 'inline' },
  { from: 'left', to: 'start', axis: 'inline' },
  { from: 'right', to: 'end', axis: 'inline' },
  { from: 'border-l', to: 'border-s', axis: 'inline' },
  { from: 'border-r', to: 'border-e', axis: 'inline' },
  { from: 'rounded-l', to: 'rounded-s', axis: 'inline' },
  { from: 'rounded-r', to: 'rounded-e', axis: 'inline' },
  { from: 'rounded-tl', to: 'rounded-ss', axis: 'inline' },
  { from: 'rounded-tr', to: 'rounded-se', axis: 'inline' },
  { from: 'rounded-bl', to: 'rounded-es', axis: 'inline' },
  { from: 'rounded-br', to: 'rounded-ee', axis: 'inline' },
  { from: 'scroll-ml', to: 'scroll-ms', axis: 'inline' },
  { from: 'scroll-mr', to: 'scroll-me', axis: 'inline' },
  { from: 'scroll-pl', to: 'scroll-ps', axis: 'inline' },
  { from: 'scroll-pr', to: 'scroll-pe', axis: 'inline' },
  // Utilities whose VALUE is the direction rather than the property. Tailwind v4
  // ships the logical form of all three (`float: inline-start`, `clear:
  // inline-start`, `text-align: start`) and they were simply missing from the
  // table, so a codebase could be fully converted and still float things left.
  { from: 'float-left', to: 'float-start', axis: 'inline', exact: true },
  { from: 'float-right', to: 'float-end', axis: 'inline', exact: true },
  { from: 'clear-left', to: 'clear-start', axis: 'inline', exact: true },
  { from: 'clear-right', to: 'clear-end', axis: 'inline', exact: true },
  { from: 'text-left', to: 'text-start', axis: 'inline', exact: true },
  { from: 'text-right', to: 'text-end', axis: 'inline', exact: true },
]

/**
 * Extra sources for enforce-physical ONLY.
 *
 * `enforce-logical` rewrites `left-2` to `start-2`, the spelling Tailwind's own
 * docs use. `enforce-canonical`, asking the design system, then rewrites that to
 * `inset-s-2` — same CSS, canonical name. So a codebase that ran both ends up with
 * `inset-s-*`, and enforce-physical had no way back: its table only knew `start`.
 *
 * Kept out of the main table so inverting it doesn't change what enforce-logical
 * suggests (both spellings map to the same physical class, but only one of them
 * can be the recommendation).
 */
export const LOGICAL_INSET_ALIASES: AxisMapping[] = [
  { from: 'inset-s', to: 'left', axis: 'inline' },
  { from: 'inset-e', to: 'right', axis: 'inline' },
]

/** Invert a directional table. enforce-physical consumes this. */
export function invertAxisMappings(mappings: AxisMapping[]): AxisMapping[] {
  return mappings.map((m) => ({ ...m, from: m.to, to: m.from }))
}

/**
 * Build the `check` callback for a directional-rewrite rule. Both
 * enforce-logical and enforce-physical instantiate this with their own
 * mapping table and messageId; the rule's `createOnce` wires it through
 * `createExtractorVisitors`.
 *
 * Owns: option compilation (allowlist + direction), per-class conversion
 * (linear scan of the mapping table respecting `!`-prefix/suffix), and
 * the `reportClassReplacements` dispatch.
 */
export function createDirectionalMapper(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  opts: { mappings: AxisMapping[]; messageId: string },
): { check: (locations: ClassLocation[]) => void } {
  const getState = createLazyOptions<
    LogicalPhysicalOptions,
    { allowlist: RegExp[]; direction: Direction }
  >(context, (o) => ({
    allowlist: compileRegexList(o?.allowlist),
    direction: o?.direction ?? 'both',
  }))

  // DS-OPTIONAL (see `softGetDS`): the design system is consulted only to check
  // that the class being suggested exists. A project with its own
  // `@utility ml-huge` used to get an autofix to `ms-huge`, which emits nothing.
  const getDS = createLazyLoader(context)

  function convertClass(cls: string): string | null {
    const { allowlist, direction } = getState()
    if (matchesAny(cls, allowlist)) return null

    const { utility, variant } = splitUtilityAndVariant(cls)
    const { bare: bareUtility, position } = splitImportant(utility)
    // Negative utilities (`-ml-2`, `-left-4`) keep a leading `-` that the
    // mapping keys (`ml`, `left`) don't carry — strip it before matching and
    // re-prepend it on the replacement, else negatives never convert (R-M4).
    const negative = bareUtility.startsWith('-')
    const core = negative ? bareUtility.slice(1) : bareUtility

    for (const { from, to, axis, exact } of opts.mappings) {
      if (direction !== 'both' && direction !== axis) continue
      const matches = core === from || (!exact && core.startsWith(`${from}-`))
      if (!matches) continue
      const suffix = core.slice(from.length)
      const replacement = `${negative ? '-' : ''}${to}${suffix}`
      return `${variant}${reattachImportant(replacement, position)}`
    }
    return null
  }

  function check(locations: ClassLocation[]) {
    const ds = softGetDS(getDS)
    const isUsable = makeReplacementGuard(ds ? ds.cache : null)

    for (const loc of locations) {
      const split = splitClassesWithSeparators(loc.value)
      const offending = split.classes.flatMap((cls) => {
        const converted = convertClass(cls)
        if (!converted || !isUsable(converted)) return []
        return [{ cls, replacement: converted }]
      })
      reportClassReplacements(context, loc, split, split.classes, offending, {
        messageId: opts.messageId,
      })
    }
  }

  return { check }
}

export const enforceLogical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce logical (RTL-friendly) Tailwind CSS properties instead of physical ones',
    },
    fixable: 'code',
    schema: [LOGICAL_PHYSICAL_SCHEMA],
    hasSuggestions: true,
    defaultOptions: [{ allowlist: [], direction: 'both' }],
    messages: {
      useLogical:
        '"{{className}}" uses a physical property. Use "{{replacement}}" for LTR/RTL support.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    const { check } = createDirectionalMapper(context, {
      mappings: PHYSICAL_TO_LOGICAL_MAPPINGS,
      messageId: 'useLogical',
    })
    return createExtractorVisitors(context, check)
  },
})
