import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { reportClassReplacements } from '../utils/report'
import { reattachImportant, splitImportant, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { compileRegexList, matchesAny } from '../utils/allowlist'

export type Direction = 'inline' | 'block' | 'both'

/**
 * Shared `{ allowlist, direction }` shape consumed by both enforce-logical and
 * enforce-physical. Co-located here so a future option addition lands in one
 * place.
 */
export interface LogicalPhysicalOptions {
  allowlist?: string[]
  direction?: Direction
}

export const LOGICAL_PHYSICAL_SCHEMA = {
  type: 'object',
  properties: {
    allowlist: { type: 'array', items: { type: 'string' } },
    direction: { type: 'string', enum: ['inline', 'block', 'both'] },
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
]

/** Invert a directional table. enforce-physical consumes this. */
export function invertAxisMappings(mappings: AxisMapping[]): AxisMapping[] {
  return mappings.map((m) => ({ from: m.to, to: m.from, axis: m.axis }))
}

/**
 * Flat `physical → logical` lookup. Kept exported so the test matrices in
 * `tests/rules/enforce-{logical,physical}.test.ts` can iterate the table
 * without depending on the richer `AxisMapping` shape.
 */
export const PHYSICAL_TO_LOGICAL: Record<string, string> = Object.fromEntries(
  PHYSICAL_TO_LOGICAL_MAPPINGS.map((m) => [m.from, m.to]),
)

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

  function convertClass(cls: string): string | null {
    const { allowlist, direction } = getState()
    if (matchesAny(cls, allowlist)) return null

    const { utility, variant } = splitUtilityAndVariant(cls)
    const { bare: bareUtility, position } = splitImportant(utility)

    for (const { from, to, axis } of opts.mappings) {
      if (direction !== 'both' && direction !== axis) continue
      if (bareUtility === from || bareUtility.startsWith(`${from}-`)) {
        const suffix = bareUtility.slice(from.length)
        return `${variant}${reattachImportant(to + suffix, position)}`
      }
    }
    return null
  }

  function check(locations: ClassLocation[]) {
    for (const loc of locations) {
      const split = splitClassesWithSeparators(loc.value)
      const offending = split.classes.flatMap((cls) => {
        const converted = convertClass(cls)
        return converted ? [{ cls, replacement: converted }] : []
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
