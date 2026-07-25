/**
 * Locks the premise `no-conflicting-classes` rests on.
 *
 * The rule names which of two classes wins by asking `cache.getOrder`, on the
 * grounds that the order Tailwind emits into the stylesheet — not the order of
 * the class attribute — decides the cascade. If a Tailwind release ever moved a
 * utility relative to another, `getOrder` and the emitted CSS would disagree and
 * every diagnostic would name the WRONG class, with nothing failing: the rule
 * would keep reporting the same pairs, just with the winner and loser swapped.
 *
 * So this compiles the stylesheet for real and compares byte offsets against
 * `getOrder` for the pairs the rule's messages depend on — with the
 * counter-intuitive ones spelled out, because those are what a drift would break
 * first and what a reader is most likely to "fix" by hand.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compile } from '@tailwindcss/node'
import { loadDesignSystemSync } from '../../src/design-system/sync-loader'
import { DesignSystemCache } from '../../src/design-system/cache'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

/**
 * `[earlier, later]` — `later` is the class Tailwind emits AFTER `earlier`, so it
 * is the one that wins and the one the diagnostic must name. Deliberately
 * includes pairs where that is the opposite of what the class names suggest.
 */
const PAIRS: [string, string][] = [
  // Reads backwards on purpose: the SMALLER shadow/blur wins.
  ['shadow-lg', 'shadow-sm'],
  ['blur-lg', 'blur-sm'],
  // Alphabetically later loses.
  ['text-blue-500', 'text-red-500'],
  ['flex-col', 'flex-row'],
  // The shorthand loses to the axis utility, in both orders of the attribute.
  ['size-4', 'h-6'],
  ['size-4', 'w-6'],
  // The narrowing utility wins — this is what makes `h-6 size-4` a conflict.
  ['truncate', 'text-clip'],
  // Three-component transforms are emitted last, which is why they compose.
  ['scale-x-110', 'scale-3d'],
  ['translate-x-4', 'translate-3d'],
  ['rotate-x-45', 'transform-gpu'],
  // The colour utility wins and reads back the size variable.
  ['drop-shadow-xl', 'drop-shadow-indigo-500'],
  // Resets win, which is why `scale-none scale-x-110` is a true conflict.
  ['scale-x-110', 'scale-none'],
  ['rotate-x-45', 'transform-none'],
  ['drop-shadow-xl', 'drop-shadow-none'],
  // Plain same-family pairs, as a baseline.
  ['p-4', 'p-6'],
  ['w-4', 'w-8'],
]

let stylesheet: string
let cache: DesignSystemCache

beforeAll(async () => {
  const candidates = [...new Set(PAIRS.flat())]
  const compiler = await compile(readFileSync(ENTRY_POINT, 'utf-8'), {
    base: dirname(ENTRY_POINT),
    onDependency() {},
  })
  stylesheet = compiler.build(candidates)

  const data = loadDesignSystemSync(ENTRY_POINT)
  expect(data).not.toBeNull()
  cache = DesignSystemCache.fromPrecomputed(data!)
})

/** Byte offset of the class's own rule in the compiled stylesheet. */
function offsetOf(className: string): number {
  const at = stylesheet.indexOf(`.${className} {`)
  expect(at, `${className} is missing from the compiled stylesheet`).toBeGreaterThanOrEqual(0)
  return at
}

describe('getOrder agrees with the compiled stylesheet', () => {
  it('emits every probe class exactly once', () => {
    for (const cls of new Set(PAIRS.flat())) {
      const first = stylesheet.indexOf(`.${cls} {`)
      expect(first, cls).toBeGreaterThanOrEqual(0)
      expect(stylesheet.indexOf(`.${cls} {`, first + 1), cls).toBe(-1)
    }
  })

  it.each(PAIRS)('%s is emitted before %s', (earlier, later) => {
    expect(offsetOf(earlier)).toBeLessThan(offsetOf(later))
  })

  it.each(PAIRS)('getOrder ranks %s below %s', (earlier, later) => {
    const a = cache.getOrder(earlier)
    const b = cache.getOrder(later)
    expect(a, earlier).not.toBeNull()
    expect(b, later).not.toBeNull()
    expect(a! < b!, `${earlier} should rank below ${later}`).toBe(true)
  })
})
