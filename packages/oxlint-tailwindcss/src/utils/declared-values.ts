/**
 * Is a rewrite between two utilities the same CSS VALUE, read from the design
 * system? Shared by the rules that turn one utility into another whose prefix
 * reads a different theme namespace: `enforce-shorthand` (`w-* h-*` → `size-*`)
 * and the sizing half of `enforce-logical` / `enforce-physical` (`w-*` →
 * `inline-*`). `w-xs` reads `--width-xs` first, `inline-xs` only
 * `--container-xs`: with `@theme { --width-xs: 10rem }` both classes exist and
 * differ, which no table of names can tell.
 */

import type { DesignSystemCache } from '../design-system/cache'

/** A plain number or fraction: always the shared numeric/`--spacing` scale. */
export const NUMERIC_VALUE_RE = /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/

/** The value is a literal the user wrote, injected verbatim into every part. */
export function isWrittenValue(value: string): boolean {
  return value.startsWith('[') || value.startsWith('(')
}

/**
 * Values the class declares on its own box, unconditionally. `null` when the
 * class produces nothing — which for a named token means it does not exist.
 */
export function declaredValues(cache: DesignSystemCache, cls: string): Set<string> | null {
  const values = new Set<string>()
  for (const decl of cache.getCssDeclarations(cls)) {
    if (decl.conditional) continue
    values.add(decl.value)
  }
  return values.size > 0 ? values : null
}

export function sameValues(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}
