/**
 * Proves every entry of `SHORTHAND_FAMILIES` against the real design system.
 *
 * `enforce-shorthand` decides at lint time whether the parts and the replacement
 * resolve to the same VALUE — that is the part that depends on the project's
 * theme. What it cannot check at lint time is whether the replacement covers the
 * same PROPERTIES as the parts, because that comparison needs to know how CSS
 * shorthands expand (`margin` is four longhands, `rounded-s` is two specific
 * corners). That knowledge is a static fact about CSS, and the family table is a
 * static list, so the right place to check one against the other is here.
 *
 * Getting a family wrong is invisible without this test: a value comparison
 * passes happily while the fix silently drops or adds a declaration. That is
 * exactly what `scale-x`+`scale-y` does — see `NOT_MERGEABLE`.
 *
 * Everything is normalised to writing-mode-agnostic "slots": `margin-inline`
 * becomes the left+right pair, `border-start-start-radius` becomes the top-left
 * corner. That is sound here because the rule only ever merges parts that carry
 * the SAME value, and a logical property with the same value on both sides is
 * indistinguishable from its physical pair.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { compile } from '@tailwindcss/node'
import { SHORTHAND_FAMILIES, type ShorthandFamily } from '../../src/rules/enforce-shorthand'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

/** Probe values per replacement prefix; the family's parts accept the same ones. */
const PROBE_VALUES: Record<string, string[]> = {
  m: ['4'],
  my: ['4'],
  mx: ['4'],
  p: ['4'],
  py: ['4'],
  px: ['4'],
  'scroll-m': ['4'],
  'scroll-my': ['4'],
  'scroll-mx': ['4'],
  'scroll-p': ['4'],
  'scroll-py': ['4'],
  'scroll-px': ['4'],
  size: ['4', 'full'],
  rounded: ['lg'],
  'rounded-t': ['lg'],
  'rounded-b': ['lg'],
  'rounded-l': ['lg'],
  'rounded-r': ['lg'],
  'rounded-s': ['lg'],
  'rounded-e': ['lg'],
  // Widths and colours travel through the same entries.
  border: ['2', 'red-500'],
  'border-x': ['2', 'red-500'],
  'border-y': ['2', 'red-500'],
  inset: ['4'],
  'inset-x': ['4'],
  'inset-y': ['4'],
  gap: ['4'],
  overflow: ['hidden'],
  overscroll: ['none'],
  'border-spacing': ['4'],
  translate: ['4'],
}

/**
 * Merges that look collapsible and are NOT. Asserted to still fail the property
 * comparison, so a Tailwind release that changes the emitted CSS tells us instead
 * of the exclusion quietly becoming stale.
 *
 * `inTable: false` means the whole family is excluded; without it only that VALUE
 * is unsafe and the family itself is legitimately in the table (that is the case
 * `enforce-shorthand` settles per value, from the emitted declarations).
 */
const NOT_MERGEABLE: {
  family: ShorthandFamily
  value: string
  why: string
  inTable?: false
}[] = [
  {
    family: { parts: ['scale-x', 'scale-y'], to: 'scale' },
    value: '110',
    why: 'scale-110 also writes --tw-scale-z, which scale-3d reads',
    inTable: false,
  },
  {
    family: { parts: ['w', 'h'], to: 'size' },
    value: 'screen',
    why: 'w-screen is 100vw and h-screen is 100vh; size-screen does not exist',
  },
]

/** property → the writing-mode-agnostic slots it writes. */
const SLOTS: Record<string, string[]> = {}

function def(prop: string, slots: string[]): void {
  SLOTS[prop] = slots
}

// Box-model families: `<name>`, `<name>-<side>`, `<name>-inline`, `<name>-block`.
for (const name of ['margin', 'padding', 'scroll-margin', 'scroll-padding']) {
  const t = `${name}:top`
  const r = `${name}:right`
  const b = `${name}:bottom`
  const l = `${name}:left`
  def(name, [t, r, b, l])
  def(`${name}-top`, [t])
  def(`${name}-right`, [r])
  def(`${name}-bottom`, [b])
  def(`${name}-left`, [l])
  def(`${name}-inline`, [l, r])
  def(`${name}-inline-start`, [l])
  def(`${name}-inline-end`, [r])
  def(`${name}-block`, [t, b])
  def(`${name}-block-start`, [t])
  def(`${name}-block-end`, [b])
}

// `inset` uses the bare side names.
def('inset', ['inset:top', 'inset:right', 'inset:bottom', 'inset:left'])
def('top', ['inset:top'])
def('right', ['inset:right'])
def('bottom', ['inset:bottom'])
def('left', ['inset:left'])
def('inset-inline', ['inset:left', 'inset:right'])
def('inset-inline-start', ['inset:left'])
def('inset-inline-end', ['inset:right'])
def('inset-block', ['inset:top', 'inset:bottom'])
def('inset-block-start', ['inset:top'])
def('inset-block-end', ['inset:bottom'])

// Borders: width, style and colour each have the full side/axis family.
for (const kind of ['width', 'style', 'color']) {
  const slot = (side: string) => `border-${kind}:${side}`
  def(`border-${kind}`, [slot('top'), slot('right'), slot('bottom'), slot('left')])
  def(`border-top-${kind}`, [slot('top')])
  def(`border-right-${kind}`, [slot('right')])
  def(`border-bottom-${kind}`, [slot('bottom')])
  def(`border-left-${kind}`, [slot('left')])
  def(`border-inline-${kind}`, [slot('left'), slot('right')])
  def(`border-inline-start-${kind}`, [slot('left')])
  def(`border-inline-end-${kind}`, [slot('right')])
  def(`border-block-${kind}`, [slot('top'), slot('bottom')])
  def(`border-block-start-${kind}`, [slot('top')])
  def(`border-block-end-${kind}`, [slot('bottom')])
}

// Corners. The logical names read block-axis first, inline-axis second:
// `border-end-start-radius` is block-end + inline-start, i.e. bottom-left.
const TL = 'radius:top-left'
const TR = 'radius:top-right'
const BR = 'radius:bottom-right'
const BL = 'radius:bottom-left'
def('border-radius', [TL, TR, BR, BL])
def('border-top-left-radius', [TL])
def('border-top-right-radius', [TR])
def('border-bottom-right-radius', [BR])
def('border-bottom-left-radius', [BL])
def('border-start-start-radius', [TL])
def('border-start-end-radius', [TR])
def('border-end-end-radius', [BR])
def('border-end-start-radius', [BL])

def('gap', ['gap:row', 'gap:column'])
def('row-gap', ['gap:row'])
def('column-gap', ['gap:column'])
def('overflow', ['overflow:x', 'overflow:y'])
def('overflow-x', ['overflow:x'])
def('overflow-y', ['overflow:y'])
def('overscroll-behavior', ['overscroll:x', 'overscroll:y'])
def('overscroll-behavior-x', ['overscroll:x'])
def('overscroll-behavior-y', ['overscroll:y'])

/** Custom properties and one-off properties (`translate`, `scale`) are their own slot. */
function slotsOf(prop: string): string[] {
  return SLOTS[prop] ?? [prop]
}

let build: (candidates: string[]) => string

beforeAll(async () => {
  const compiler = await compile(readFileSync(ENTRY_POINT, 'utf-8'), {
    base: dirname(ENTRY_POINT),
    onDependency() {},
  })
  build = (candidates) => compiler.build(candidates)
})

/**
 * Slots a single class writes, read straight out of the compiled stylesheet.
 *
 * Compiled with that class as the ONLY candidate, and only the declarations
 * inside its own rule are read — the `@property` blocks Tailwind appends declare
 * nothing about the element. Every probe value is a plain token, so the selector
 * needs no CSS escaping.
 */
function slotsFor(className: string): Set<string> | null {
  const css = build([className])
  const at = css.indexOf(`.${className} {`)
  if (at === -1) return null
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  if (open === -1 || close === -1) return null
  const slots = new Set<string>()
  for (const line of css.slice(open + 1, close).split(';')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const prop = line.slice(0, colon).trim()
    if (!prop) continue
    for (const slot of slotsOf(prop)) slots.add(slot)
  }
  return slots.size > 0 ? slots : null
}

function unionSlots(classNames: string[]): Set<string> | null {
  const all = new Set<string>()
  for (const cls of classNames) {
    const slots = slotsFor(cls)
    if (!slots) return null
    for (const slot of slots) all.add(slot)
  }
  return all
}

function sorted(set: Set<string>): string[] {
  return [...set].sort()
}

describe('every shorthand family collapses to the same CSS', () => {
  const cases = SHORTHAND_FAMILIES.flatMap((family) => {
    const values = PROBE_VALUES[family.to]
    if (!values) throw new Error(`no probe value for family "${family.to}"`)
    return values.map((value) => ({ family, value }))
  })

  it('has a probe value for every family', () => {
    expect(cases.length).toBeGreaterThanOrEqual(SHORTHAND_FAMILIES.length)
  })

  it.each(cases)(
    '$family.parts → $family.to at "$value"',
    ({ family, value }: { family: ShorthandFamily; value: string }) => {
      const parts = family.parts.map((part) => `${part}-${value}`)
      const replacement = `${family.to}-${value}`

      const partSlots = unionSlots(parts)
      const replacementSlots = slotsFor(replacement)

      expect(partSlots, `one of ${parts.join(', ')} emits nothing`).not.toBeNull()
      expect(replacementSlots, `${replacement} emits nothing`).not.toBeNull()
      expect(sorted(replacementSlots!)).toEqual(sorted(partSlots!))
    },
  )
})

describe('families that must NOT be merged', () => {
  it.each(NOT_MERGEABLE)('$family.parts → $family.to: $why', ({ family, value }) => {
    const partSlots = unionSlots(family.parts.map((part) => `${part}-${value}`))
    const replacementSlots = slotsFor(`${family.to}-${value}`)
    const same =
      partSlots !== null &&
      replacementSlots !== null &&
      sorted(partSlots).join() === sorted(replacementSlots).join()
    expect(same).toBe(false)
  })

  it('the table does not contain the excluded families', () => {
    for (const { family, inTable } of NOT_MERGEABLE) {
      if (inTable !== false) continue
      const present = SHORTHAND_FAMILIES.some(
        (f) => f.to === family.to && f.parts.join() === family.parts.join(),
      )
      expect(present, `${family.parts.join('+')} → ${family.to} must stay out of the table`).toBe(
        false,
      )
    }
  })
})
