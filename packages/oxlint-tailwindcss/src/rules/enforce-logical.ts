import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import {
  reportClassReplacements,
  reportClassSuggestion,
  type ReplacementEntry,
} from '../utils/report'
import { reattachImportant, splitImportant, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { compileRegexList, matchesAny } from '../utils/allowlist'
import { createLazyLoader } from '../design-system/loader'
import type { DesignSystemCache } from '../design-system/cache'
import { softGetDS } from '../utils/fatal'
import { makeReplacementGuard } from '../utils/replacement'
import {
  NUMERIC_VALUE_RE,
  declaredValues,
  isWrittenValue,
  sameValues,
} from '../utils/declared-values'
import { SETTINGS_MESSAGE } from '../utils/settings-check'

export type Direction = 'inline' | 'block' | 'both'

/**
 * Shared `{ allowlist, direction, sizing }` shape consumed by both
 * enforce-logical and enforce-physical. Co-located here so a future option
 * addition lands in one place.
 */
export interface LogicalPhysicalOptions {
  allowlist?: string[]
  direction?: Direction
  sizing?: boolean
  entryPoint?: string
}

export const LOGICAL_PHYSICAL_SCHEMA = {
  type: 'object',
  properties: {
    allowlist: { type: 'array', items: { type: 'string' } },
    direction: { type: 'string', enum: ['inline', 'block', 'both'] },
    sizing: { type: 'boolean' },
    entryPoint: { type: 'string' },
  },
  additionalProperties: false,
} as const

/**
 * A directional mapping entry: replace `from` with `to` along `axis`. Used by
 * both enforce-logical (physical → logical) and enforce-physical (logical →
 * physical, the inverted table). The `axis` tag lets the rule's `direction`
 * option filter; `'both'` (`size-*`, which sets the two) applies only when no
 * axis is excluded.
 */
export interface AxisMapping {
  from: string
  /** The replacement prefix, or one per axis for a utility that sets both. */
  to: string | readonly [string, string]
  axis: 'inline' | 'block' | 'both'
  /**
   * The direction is the VALUE, not part of the property, so the utility is
   * already complete: `float-left`, never `float-left-4`. Without this the prefix
   * scan would happily rewrite `float-left-0` — a class that does not exist — into
   * another one that doesn't either.
   */
  exact?: true
  /**
   * `to` first shipped in Tailwind 4.2 (block-axis utilities, logical sizing,
   * `inset-s`/`inset-e`). With a design system the entry applies only when the
   * project's Tailwind has `to` — probed as the `<to>-0` class, which every one
   * of these utilities lists and 4.1 does not; `cache.isValid` cannot tell, since
   * it accepts an arbitrary value on any prefix. Without a design system there is
   * nothing to probe: `fallback` is used when there is one, and otherwise the
   * class is only suggested, never autofixed.
   */
  since?: true
  /** What to write instead of `to` when the project's Tailwind doesn't have it. */
  fallback?: string
  /** Only with the `sizing` option: widths and heights. */
  sizing?: true
  /**
   * Values with no counterpart under `to`, matched against the value alone:
   * `w-dvh` (a width in viewport HEIGHTS) has no `inline-*`, `max-w-prose` no
   * `max-inline-prose`. Skipped with or without a design system, so a project
   * without one is never pointed at a class that doesn't exist.
   */
  skipValues?: RegExp
}

/** Viewport units of the other axis: a width in heights, a height in widths. */
const HEIGHT_UNITS = /^[dls]vh$/
const WIDTH_UNITS = /^[dls]vw$/
const MAX_WIDTH_ONLY = /^(?:[dls]vh|prose|screen-.+)$/

export const PHYSICAL_TO_LOGICAL_MAPPINGS: AxisMapping[] = [
  { from: 'ml', to: 'ms', axis: 'inline' },
  { from: 'mr', to: 'me', axis: 'inline' },
  { from: 'pl', to: 'ps', axis: 'inline' },
  { from: 'pr', to: 'pe', axis: 'inline' },
  // `inset-s-*` is Tailwind's canonical spelling since 4.2, so writing it saves
  // `enforce-canonical` a second pass (`start-2` → `inset-s-2`). `start-*`
  // exists in every v4.
  { from: 'left', to: 'inset-s', axis: 'inline', since: true, fallback: 'start' },
  { from: 'right', to: 'inset-e', axis: 'inline', since: true, fallback: 'end' },
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
  // The block axis, Tailwind 4.2 (tailwindcss#19601, #19613). The same theme
  // namespaces as their physical twins, so the values carry over. `rounded-t-*`
  // has no block-axis pair: there is no `rounded-bs`.
  { from: 'mt', to: 'mbs', axis: 'block', since: true },
  { from: 'mb', to: 'mbe', axis: 'block', since: true },
  { from: 'pt', to: 'pbs', axis: 'block', since: true },
  { from: 'pb', to: 'pbe', axis: 'block', since: true },
  { from: 'top', to: 'inset-bs', axis: 'block', since: true },
  { from: 'bottom', to: 'inset-be', axis: 'block', since: true },
  { from: 'border-t', to: 'border-bs', axis: 'block', since: true },
  { from: 'border-b', to: 'border-be', axis: 'block', since: true },
  { from: 'scroll-mt', to: 'scroll-mbs', axis: 'block', since: true },
  { from: 'scroll-mb', to: 'scroll-mbe', axis: 'block', since: true },
  { from: 'scroll-pt', to: 'scroll-pbs', axis: 'block', since: true },
  { from: 'scroll-pb', to: 'scroll-pbe', axis: 'block', since: true },
  // Sizing, Tailwind 4.2 (tailwindcss#19612), with `sizing: true` only. These
  // read different namespaces (`w` reads `--width-*` first, `inline` only
  // `--container-*`), so a named value is compared through the design system.
  { from: 'w', to: 'inline', axis: 'inline', since: true, sizing: true, skipValues: HEIGHT_UNITS },
  {
    from: 'min-w',
    to: 'min-inline',
    axis: 'inline',
    since: true,
    sizing: true,
    skipValues: HEIGHT_UNITS,
  },
  {
    from: 'max-w',
    to: 'max-inline',
    axis: 'inline',
    since: true,
    sizing: true,
    skipValues: MAX_WIDTH_ONLY,
  },
  { from: 'h', to: 'block', axis: 'block', since: true, sizing: true, skipValues: WIDTH_UNITS },
  {
    from: 'min-h',
    to: 'min-block',
    axis: 'block',
    since: true,
    sizing: true,
    skipValues: WIDTH_UNITS,
  },
  {
    from: 'max-h',
    to: 'max-block',
    axis: 'block',
    since: true,
    sizing: true,
    skipValues: WIDTH_UNITS,
  },
  {
    from: 'size',
    to: ['inline', 'block'],
    axis: 'both',
    since: true,
    sizing: true,
    skipValues: /^[dls]v[hw]$/,
  },
]

/**
 * `inline` and `block` are display utilities too: `inline-flex` must never read
 * as an inline size, nor `block` as a block size.
 */
const DISPLAY_CLASSES = new Set([
  'inline',
  'block',
  'inline-block',
  'inline-flex',
  'inline-grid',
  'inline-table',
])

/**
 * Invert a directional table. enforce-physical consumes this. A two-axis entry
 * has no single inverse (`inline-4 block-4` convert one by one), and an entry
 * with a `fallback` inverts both spellings: `inset-s-2` and `start-2` are both
 * `left-2`.
 */
export function invertAxisMappings(mappings: AxisMapping[]): AxisMapping[] {
  return mappings.flatMap((m) => {
    if (typeof m.to !== 'string') return []
    const back: AxisMapping = { from: m.to, to: m.from, axis: m.axis }
    if (m.exact) back.exact = m.exact
    if (m.sizing) back.sizing = m.sizing
    return m.fallback ? [back, { ...back, from: m.fallback }] : [back]
  })
}

export interface DirectionalOptions {
  allowlist: RegExp[]
  direction: Direction
  sizing: boolean
}

export interface DirectionalConversion {
  replacement: string
  /** No design system could vouch for it: report with a suggestion, never fix. */
  suggestOnly: boolean
  mapping: AxisMapping
}

/** Does the project's Tailwind have this utility? See `AxisMapping.since`. */
function hasUtility(cache: DesignSystemCache, root: string): boolean {
  return cache.isKnownClass(`${root}-0`)
}

/**
 * The same value under the new prefixes? Numbers, fractions and written values
 * read the same scale or nothing at all; a named token is settled by the CSS.
 */
function sameSizing(
  cache: DesignSystemCache,
  value: string,
  source: string,
  targets: string[],
): boolean {
  if (NUMERIC_VALUE_RE.test(value) || isWrittenValue(value)) return true
  const expected = declaredValues(cache, source)
  if (!expected) return false
  const actual = new Set<string>()
  for (const target of targets) {
    const values = declaredValues(cache, target)
    if (!values) return false
    for (const v of values) actual.add(v)
  }
  return sameValues(expected, actual)
}

/**
 * One class through a directional table: what it should be written as, or null
 * when the table has nothing for it or the replacement can't be trusted. Pure,
 * so the Tailwind 4.1 case (no 4.2 utilities) is testable with a hand-built
 * design system.
 */
export function convertDirectional(
  cls: string,
  mappings: AxisMapping[],
  options: DirectionalOptions,
  cache: DesignSystemCache | null,
): DirectionalConversion | null {
  if (matchesAny(cls, options.allowlist)) return null

  const { utility, variant } = splitUtilityAndVariant(cls)
  const { bare: bareUtility, position } = splitImportant(utility)
  // Negative utilities (`-ml-2`, `-left-4`) keep a leading `-` that the
  // mapping keys (`ml`, `left`) don't carry — strip it before matching and
  // re-prepend it on the replacement, else negatives never convert (R-M4).
  const negative = bareUtility.startsWith('-')
  const core = negative ? bareUtility.slice(1) : bareUtility
  const isUsable = makeReplacementGuard(cache)

  for (const mapping of mappings) {
    const { from, to, axis, exact, sizing } = mapping
    if (options.direction !== 'both' && options.direction !== axis) continue
    if (sizing && !options.sizing) continue
    const matches = core === from || (!exact && core.startsWith(`${from}-`))
    if (!matches) continue
    // A size always has a value, and `inline-flex` is a display.
    if (sizing && (core === from || DISPLAY_CLASSES.has(core))) continue
    const suffix = core.slice(from.length)
    const value = suffix.slice(1)
    if (mapping.skipValues?.test(value)) return null

    const prefixes = typeof to === 'string' ? [to] : [...to]
    const build = (prefix: string) =>
      `${variant}${reattachImportant(`${negative ? '-' : ''}${prefix}${suffix}`, position)}`
    const halves = prefixes.map(build)
    const replacement = halves.join(' ')

    if (!mapping.since) {
      return isUsable(replacement) ? { replacement, suggestOnly: false, mapping } : null
    }
    if (!cache) {
      // Nothing can say whether this project's Tailwind has `to`.
      return mapping.fallback
        ? { replacement: build(mapping.fallback), suggestOnly: false, mapping }
        : { replacement, suggestOnly: true, mapping }
    }
    const usable =
      prefixes.every((prefix) => hasUtility(cache, prefix)) &&
      halves.every(isUsable) &&
      (!sizing ||
        sameSizing(
          cache,
          value,
          `${from}${suffix}`,
          prefixes.map((p) => `${p}${suffix}`),
        ))
    if (usable) return { replacement, suggestOnly: false, mapping }
    if (mapping.fallback && isUsable(build(mapping.fallback))) {
      return { replacement: build(mapping.fallback), suggestOnly: false, mapping }
    }
    return null
  }
  return null
}

/**
 * Build the `check` callback for a directional-rewrite rule. Both
 * enforce-logical and enforce-physical instantiate this with their own
 * mapping table and messageIds; the rule's `createOnce` wires it through
 * `createExtractorVisitors`.
 *
 * Owns: option compilation (allowlist + direction + sizing), the per-class
 * conversion (`convertDirectional`), and the report: autofixes through
 * `reportClassReplacements`, suggestion-only conversions through
 * `reportClassSuggestion`, so a suggestion never rides along in the autofix.
 */
export function createDirectionalMapper(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  opts: {
    mappings: AxisMapping[]
    messageId: string
    /**
     * For the entries where physical and logical differ only in a vertical
     * writing mode (the block axis, sizes), not in LTR/RTL.
     */
    writingModeMessageId?: string
  },
): { check: (locations: ClassLocation[]) => void } {
  const getOptions = createLazyOptions<LogicalPhysicalOptions, DirectionalOptions>(
    context,
    (o) => ({
      allowlist: compileRegexList(o?.allowlist),
      direction: o?.direction ?? 'both',
      sizing: o?.sizing === true,
    }),
  )

  // DS-OPTIONAL (see `softGetDS`): the design system is consulted only to check
  // that the class being suggested exists. A project with its own
  // `@utility ml-huge` used to get an autofix to `ms-huge`, which emits nothing.
  const getDS = createLazyLoader(context)

  const messageIdFor = ({ axis, sizing }: AxisMapping) =>
    opts.writingModeMessageId && (axis !== 'inline' || sizing)
      ? opts.writingModeMessageId
      : opts.messageId

  function check(locations: ClassLocation[]) {
    const ds = softGetDS(getDS)
    const cache = ds ? ds.cache : null
    const options = getOptions()

    for (const loc of locations) {
      const split = splitClassesWithSeparators(loc.value)
      const fixes: ReplacementEntry[] = []
      const suggestions: (ReplacementEntry & { messageId: string })[] = []
      for (const cls of split.classes) {
        const conversion = convertDirectional(cls, opts.mappings, options, cache)
        if (!conversion) continue
        const messageId = messageIdFor(conversion.mapping)
        const entry = { cls, replacement: conversion.replacement, messageId }
        if (conversion.suggestOnly) suggestions.push(entry)
        else fixes.push(entry)
      }
      reportClassReplacements(context, loc, split, split.classes, fixes, {
        messageId: opts.messageId,
      })
      for (const { cls, replacement, messageId } of suggestions) {
        reportClassSuggestion(
          context,
          loc,
          split,
          split.classes,
          { cls, replacement },
          { messageId, data: { className: cls, replacement } },
        )
      }
    }
  }

  return { check }
}

export const enforceLogical = defineRule({
  meta: {
    type: 'suggestion',
    docs: ruleDocs('enforce-logical', {
      description:
        'Enforce logical (RTL-friendly) Tailwind CSS properties instead of physical ones',
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
      useLogical:
        '"{{className}}" uses a physical property. Use "{{replacement}}" for LTR/RTL support.',
      useLogicalWritingMode:
        '"{{className}}" uses a physical property. Use "{{replacement}}" so it follows the writing mode.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    const { check } = createDirectionalMapper(context, {
      mappings: PHYSICAL_TO_LOGICAL_MAPPINGS,
      messageId: 'useLogical',
      writingModeMessageId: 'useLogicalWritingMode',
    })
    return createExtractorVisitors(context, check)
  },
})
