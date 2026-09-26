/**
 * What a class list looks like, as opposed to where it puts the element: the
 * declarations its classes emit, keyed by property, without layout, and
 * without anything behind a variant.
 *
 * Declarations, not class names, so two spellings of one style compare equal:
 * `px-4` and `pl-4 pr-4` emit different properties (`padding-inline`, then
 * `padding-left` and `padding-right`), and both become `padding-inline` here,
 * because the sides are expanded to physical ones and collapsed back to the
 * most compact form they allow.
 */

import type { DesignSystemCache } from '../design-system/cache'
import { resolveDeclarationsSync } from '../design-system/declaration-service'
import { splitImportant, splitUtilityAndVariant } from './class-parser'

/** Property (`background-color`, `padding-inline`) → value. */
export type Signature = Map<string, string>

/**
 * Where the element sits and how it lays out its children — which a copy
 * adapts to its page — rather than what it looks like.
 */
const LAYOUT = new Set([
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'float',
  'clear',
  'width',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'order',
  'gap',
  'row-gap',
  'column-gap',
  'white-space',
  'text-wrap',
  'text-align',
  'text-overflow',
  'vertical-align',
  'pointer-events',
  'user-select',
  'cursor',
  'visibility',
  'box-sizing',
  'aspect-ratio',
  'isolation',
  'contain',
  'container-type',
  'container-name',
  'will-change',
  'touch-action',
  'appearance',
  'field-sizing',
  'outline-style',
  'translate',
  'rotate',
  'scale',
  'transform',
  'content',
])
const LAYOUT_PREFIXES = [
  'inset',
  'margin',
  'flex',
  'grid',
  'align-',
  'justify-',
  'place-',
  'overflow',
  'overscroll',
  'transition',
  'animation',
  'scroll-',
  'object-',
  '-webkit-',
]

const isLayout = (prop: string) =>
  LAYOUT.has(prop) || LAYOUT_PREFIXES.some((prefix) => prop.startsWith(prefix))

const COLOR_PROPS = new Set([
  'background-color',
  'color',
  'fill',
  'stroke',
  'outline-color',
  'text-decoration-color',
])

/** Whether a signature key is a color: the design system's identity. */
export function isColorKey(key: string): boolean {
  return COLOR_PROPS.has(key) || (key.startsWith('border') && key.endsWith('color'))
}

/**
 * Whether a signature key styles the element's box — its background, border,
 * corners or shadow — rather than its text. Every piece of text shares
 * `text-sm text-muted-foreground` with some component; a component is told
 * apart by its box.
 */
export function isSurfaceKey(key: string): boolean {
  return key === 'background-color' || key === 'box-shadow' || key.startsWith('border')
}

// Physical sides, clockwise from the top, and the properties that set them.
const SIDES = ['top', 'right', 'bottom', 'left'] as const
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const

/** `''`, `inline`, `block-start`, `top` → the physical sides, or `null`. */
function sidesOf(spec: string): readonly string[] | null {
  switch (spec) {
    case '':
      return SIDES
    case 'inline':
      return ['left', 'right']
    case 'block':
      return ['top', 'bottom']
    // Logical sides, read left-to-right.
    case 'inline-start':
      return ['left']
    case 'inline-end':
      return ['right']
    case 'block-start':
      return ['top']
    case 'block-end':
      return ['bottom']
    case 'top':
    case 'right':
    case 'bottom':
    case 'left':
      return [spec]
    default:
      return null
  }
}

/** `padding-inline` → the physical properties it sets; `null` for other properties. */
function physical(prop: string): string[] | null {
  const padding = /^padding(?:-(.+))?$/.exec(prop)
  if (padding) return sidesOf(padding[1] ?? '')?.map((s) => `padding-${s}`) ?? null
  const border = /^border(?:-(.+?))?-(width|color|style)$/.exec(prop)
  if (border) return sidesOf(border[1] ?? '')?.map((s) => `border-${s}-${border[2]}`) ?? null
  if (prop === 'border-radius') return CORNERS.map((c) => `border-${c}-radius`)
  const corner = /^border-(start|end)-(start|end)-radius$/.exec(prop)
  if (corner) {
    const block = corner[1] === 'start' ? 'top' : 'bottom'
    const inline = corner[2] === 'start' ? 'left' : 'right'
    return [`border-${block}-${inline}-radius`]
  }
  return null
}

/**
 * Collapses four physical sides back to the most compact keys they allow:
 * one for all four (`padding`), else one per axis whose two sides agree
 * (`padding-inline`), else the sides as they are.
 */
function collapse(
  features: Signature,
  side: (s: string) => string,
  whole: string,
  axis: (a: 'block' | 'inline') => string,
): void {
  const [t, r, b, l] = SIDES.map((s) => features.get(side(s)))
  const drop = (...sides: string[]) => {
    for (const s of sides) features.delete(side(s))
  }
  if (t !== undefined && t === r && t === b && t === l) {
    drop(...SIDES)
    features.set(whole, t)
    return
  }
  if (t !== undefined && t === b) {
    drop('top', 'bottom')
    features.set(axis('block'), t)
  }
  if (l !== undefined && l === r) {
    drop('left', 'right')
    features.set(axis('inline'), l)
  }
}

function collapseCorners(features: Signature): void {
  const keys = CORNERS.map((c) => `border-${c}-radius`)
  const first = features.get(keys[0])
  if (first !== undefined && keys.every((k) => features.get(k) === first)) {
    for (const k of keys) features.delete(k)
    features.set('border-radius', first)
  }
}

/** One class's features, before collapsing: `[physical property, value]` pairs. */
function classFeatures(cls: string, cache: DesignSystemCache): [string, string][] {
  const { bare } = splitImportant(cls)
  const own = new Map<string, string>()
  const decls = cache.getCssDeclarations(bare)
  for (const d of decls) {
    if (d.scope === 'element' && !d.conditional && d.prop.startsWith('--tw-')) {
      own.set(d.prop, d.value)
    }
  }
  const out: [string, string][] = []
  for (const d of decls) {
    if (d.scope !== 'element' || d.conditional || d.prop.startsWith('--')) continue
    if (isLayout(d.prop)) continue
    // `box-shadow: var(--tw-inset-shadow), …, var(--tw-shadow)` is the same
    // for every shadow; which one it is lives in the `--tw-shadow` the class
    // sets, so that is the value compared.
    const read = d.readsVars.filter((v) => own.has(v))
    const value = read.length > 0 ? read.map((v) => own.get(v)).join(', ') : d.value
    for (const prop of physical(d.prop) ?? [d.prop]) out.push([prop, value])
  }
  return out
}

const memo = new WeakMap<DesignSystemCache, Map<string, [string, string][]>>()

/**
 * The signature of a class list. Classes behind a variant are left out, and so
 * are those the design system has no declarations for.
 */
export function signatureOf(
  classes: readonly string[],
  cache: DesignSystemCache,
  entryPoint: string,
): Signature {
  let perClass = memo.get(cache)
  if (!perClass) memo.set(cache, (perClass = new Map()))
  const unconditional = classes.filter((cls) => splitUtilityAndVariant(cls).variant === '')
  const unknown = unconditional.filter(
    (cls) => !perClass.has(cls) && cache.getCssDeclarations(splitImportant(cls).bare).length === 0,
  )
  if (unknown.length > 0) resolveDeclarationsSync(entryPoint, cache, unknown)

  const features: Signature = new Map()
  for (const cls of unconditional) {
    let entries = perClass.get(cls)
    if (!entries) perClass.set(cls, (entries = classFeatures(cls, cache)))
    for (const [prop, value] of entries) features.set(prop, value)
  }
  collapse(
    features,
    (s) => `padding-${s}`,
    'padding',
    (a) => `padding-${a}`,
  )
  for (const part of ['width', 'color', 'style']) {
    collapse(
      features,
      (s) => `border-${s}-${part}`,
      `border-${part}`,
      (a) => `border-${a}-${part}`,
    )
  }
  collapseCorners(features)
  return features
}

export interface Resemblance {
  /** Keys whose values are equal in both. */
  shared: number
  /** Keys in either. */
  union: number
  /** A color key both set, to the same value. */
  sharedColor: boolean
  /** A color key both set, to different values. */
  conflictingColor: boolean
  /** A surface key both set, to the same value. */
  sharedSurface: boolean
}

export function resemblance(component: Signature, element: Signature): Resemblance {
  let shared = 0
  let sharedColor = false
  let conflictingColor = false
  let sharedSurface = false
  for (const [key, value] of component) {
    const other = element.get(key)
    if (other === undefined) continue
    if (other === value) {
      shared++
      if (isColorKey(key)) sharedColor = true
      if (isSurfaceKey(key)) sharedSurface = true
    } else if (isColorKey(key)) {
      conflictingColor = true
    }
  }
  let union = component.size
  for (const key of element.keys()) if (!component.has(key)) union++
  return { shared, union, sharedColor, conflictingColor, sharedSurface }
}
