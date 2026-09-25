/**
 * Lengths, measured against the design system's scale — shared by
 * `prefer-scale-token` (is this value EQUAL to a step or token?) and
 * `no-arbitrary-value` (which steps and tokens are CLOSEST?).
 */

import type { DesignSystemCache } from '../design-system/cache'
import { getArbitraryValue } from './class-parser'

/** A length or plain number. Anything else can't be compared arithmetically. */
const LENGTH_RE = /^(-?\d*\.?\d+)(rem|px|em)?$/

/**
 * A comparable value: a magnitude, plus whether it carried a unit at all.
 *
 * The flag is not bookkeeping. `p-[10]` compiles to `padding: 10` — no unit,
 * which is not a length — while `p-2.5` is `padding: 10px`. Treating the bare
 * number as px would suggest a class that means something else.
 */
export interface Measure {
  px: number
  unitless: boolean
}

/**
 * Parse a CSS length. `em` is treated as `rem`, which is what it is at the root
 * and the only interpretation available without a layout.
 */
export function measure(value: string, rootFontSize: number): Measure | null {
  const match = LENGTH_RE.exec(value.trim())
  if (!match) return null
  const n = Number.parseFloat(match[1])
  if (!Number.isFinite(n)) return null
  switch (match[2]) {
    case 'rem':
    case 'em':
      return { px: n * rootFontSize, unitless: false }
    case 'px':
      return { px: n, unitless: false }
    case undefined:
      return { px: n, unitless: true }
    default:
      return null
  }
}

/**
 * Same value, allowing for float noise (`0.875rem` × 16 = 13.999999999999998).
 * A unitless number and a length are never the same value, whatever the digits.
 */
export function sameMeasure(a: Measure, b: Measure): boolean {
  return a.unitless === b.unitless && Math.abs(a.px - b.px) < 0.0001
}

/**
 * Is `n` a whole number of `step`s? `10 / 0.5` is exact in binary, `0.3 / 0.1`
 * is not, so the remainder is compared with a tolerance rather than to zero.
 */
export function isOnStep(n: number, step: number): boolean {
  if (step <= 0) return false
  const steps = n / step
  return Math.abs(steps - Math.round(steps)) < 0.0001
}

/** Trailing zeros make `p-2.50`, which is not what Tailwind calls the class. */
export function formatStep(n: number): string {
  return String(Number.parseFloat(n.toFixed(4)))
}

/** `w-[200px]` → `w`; null when the value isn't bracketed after a dash. */
export function arbitraryPrefix(bare: string): string | null {
  const open = bare.indexOf('[')
  // The utility and its value are joined by a dash: `p-[10px]`. Anything else
  // is not this shape — an arbitrary property (`[color:red]`) starts at 0.
  if (open <= 0 || bare[open - 1] !== '-') return null
  return bare.slice(0, open - 1) || null
}

export interface ScaleOption {
  /** The class to write instead: `w-50`, `max-w-2xl`. */
  className: string
  /** Its value, in the unit the arbitrary value used: `200px`, `42rem`. */
  value: string
}

/**
 * The classes in the design system closest to an arbitrary LENGTH. Candidates
 * are the prefix's theme tokens (`max-w-2xl` = 42rem) and the two steps of the
 * spacing scale around the value, at the granularity Tailwind's own steps use.
 * An exact match wins alone (a token before a step of the same value);
 * otherwise the nearest candidate below and above (`w-[203px]` → `w-50.5`
 * 202px, `w-51` 204px). Empty for anything that isn't a length on a known
 * prefix — a colour, a unitless number, a `calc()`.
 */
export function closestOnScale(
  cache: DesignSystemCache,
  bare: string,
  rootFontSize: number,
  limit = 3,
): ScaleOption[] {
  const raw = getArbitraryValue(bare)
  const prefix = arbitraryPrefix(bare)
  if (raw === null || prefix === null) return []
  const written = measure(raw, rootFontSize)
  if (written === null || written.unitless) return []

  const inPx = raw.trim().endsWith('px')
  const show = (px: number) =>
    inPx ? `${formatStep(px)}px` : `${formatStep(px / rootFontSize)}rem`
  const found = new Map<string, { px: number; distance: number }>()
  const add = (className: string, px: number) => {
    if (!found.has(className)) found.set(className, { px, distance: Math.abs(px - written.px) })
  }

  for (const [literal, className] of cache.tokenValuesFor(prefix)) {
    const token = measure(literal, rootFontSize)
    if (token !== null && !token.unitless) add(className, token.px)
  }

  const scale = cache.scale
  if (scale && cache.readsScale(prefix)) {
    const unit = measure(scale.unit, rootFontSize)
    if (unit !== null && !unit.unitless && unit.px > 0) {
      const steps = written.px / unit.px / scale.step
      for (const n of new Set([Math.floor(steps + 1e-9), Math.ceil(steps - 1e-9)])) {
        const count = n * scale.step
        if (count < 0) continue
        const className = `${prefix}-${formatStep(count)}`
        if (cache.isValid(className)) add(className, count * unit.px)
      }
    }
  }

  // Exact matches, if any, and nothing else; otherwise the nearest candidate
  // on either side. A far-away token (`w-3xs` for `w-[203px]`) is never the fix.
  const all = [...found].map(([className, { px, distance }]) => ({ className, px, distance }))
  const exact = all.filter((o) => o.distance < 0.0001)
  const below = all.filter((o) => o.px < written.px).sort((a, b) => b.px - a.px)[0]
  const above = all.filter((o) => o.px > written.px).sort((a, b) => a.px - b.px)[0]
  const picked = exact.length > 0 ? exact : [below, above].filter((o) => o !== undefined)
  return picked.slice(0, limit).map((o) => ({ className: o.className, value: show(o.px) }))
}

/** `a (1px)`, `a (1px) or b (2px)`, `a (1px), b (2px) or c (3px)`. */
export function formatOptions(options: readonly ScaleOption[]): string {
  const parts = options.map((o) => `${o.className} (${o.value})`)
  return parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} or ${parts.at(-1)}`
}
