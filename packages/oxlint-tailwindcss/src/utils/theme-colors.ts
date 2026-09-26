import type { DesignSystemCache } from '../design-system/cache'

/** How many of the project's colors a message names before `(+N more)`. */
const LISTED = 12

const listed = new WeakMap<DesignSystemCache, string>()

/**
 * The project's own theme colors, for a message: `brand, brand-light`, or the
 * first 12 and `(+19 more)`. Empty when the project declares none — the
 * default palette is then its design system. Shared by no-default-palette and
 * no-hardcoded-colors, so they name the same colors the same way.
 */
export function themeColorList(cache: DesignSystemCache): string {
  let list = listed.get(cache)
  if (list === undefined) {
    const own = cache.projectColors()
    list =
      own.length > LISTED
        ? `${own.slice(0, LISTED).join(', ')} (+${own.length - LISTED} more)`
        : own.join(', ')
    listed.set(cache, list)
  }
  return list
}
