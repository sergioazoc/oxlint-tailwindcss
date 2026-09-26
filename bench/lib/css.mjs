// What a class list does to an element, as data: the "effective style" the
// fix oracle compares before and after a fix. Pure — the Tailwind engine is
// passed in (lib/oracle.mjs binds it) — so it can be tested on hand-written CSS.
//
// The effective style maps `context | property` to the winning value, where
// the context is the chain of at-rules and the selector with the class's own
// selector replaced by `&` (`@media (hover: hover) > &:hover`), properties are
// expanded to physical longhands read left-to-right (`px-4` ≡ `pl-4 pr-4`,
// `ms-4` ≡ `ml-4`), and the winner is the declaration Tailwind emits last —
// `!important` first. Values are normalized so that equal lengths compare
// equal: theme variables are substituted and simple `calc()`s evaluated, so
// `mt-[16px]` and `mt-4` (`calc(var(--spacing) * 4)`) agree. `@supports`
// blocks apply — Tailwind v4's browser baseline supports what it tests for —
// and `:is(x)` of a single selector is `x`.

/** CSS.escape (CSSOM), for the class's own selector. */
export function cssEscape(value) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    const code = value.charCodeAt(i)
    if (code === 0) out += '�'
    else if ((code >= 1 && code <= 0x1f) || code === 0x7f) out += `\\${code.toString(16)} `
    else if (i === 0 && code >= 0x30 && code <= 0x39) out += `\\${code.toString(16)} `
    else if (i === 1 && code >= 0x30 && code <= 0x39 && value[0] === '-') {
      out += `\\${code.toString(16)} `
    } else if (i === 0 && ch === '-' && value.length === 1) out += `\\${ch}`
    else if (code >= 0x80 || ch === '-' || ch === '_' || /[0-9A-Za-z]/.test(ch)) out += ch
    else out += `\\${ch}`
  }
  return out
}

/**
 * A small parser for the CSS Tailwind emits: rules, at-rules and declarations,
 * with strings and comments skipped over. Nodes: `{ type: 'block', prelude,
 * children }` and `{ type: 'decl', prop, value, important }`.
 */
export function parseCss(text) {
  let i = 0
  const n = text.length
  function readUntil(stops) {
    let out = ''
    let depth = 0
    while (i < n) {
      const c = text[i]
      // An escaped character is part of an identifier (`.\[\&\:not\(…`), never syntax.
      if (c === '\\') {
        out += text.slice(i, i + 2)
        i += 2
        continue
      }
      if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2)
        i = end === -1 ? n : end + 2
        continue
      }
      if (c === '"' || c === "'") {
        let j = i + 1
        while (j < n && text[j] !== c) j += text[j] === '\\' ? 2 : 1
        out += text.slice(i, j + 1)
        i = j + 1
        continue
      }
      if (c === '(' || c === '[') depth++
      else if (c === ')' || c === ']') depth--
      else if (depth === 0 && stops.includes(c)) return out
      out += c
      i++
    }
    return out
  }
  function parseBlock() {
    const children = []
    while (i < n) {
      const chunk = readUntil('{};')
      const stop = text[i]
      if (stop === '}' || i >= n) {
        i++
        if (chunk.trim()) children.push(decl(chunk))
        return children
      }
      i++
      if (stop === ';') {
        if (chunk.trim()) children.push(decl(chunk))
      } else {
        children.push({
          type: 'block',
          prelude: chunk.trim().replace(/\s+/g, ' '),
          children: parseBlock(),
        })
      }
    }
    return children
  }
  function decl(chunk) {
    const colon = chunk.indexOf(':')
    let value = chunk.slice(colon + 1).trim()
    const important = /!important$/.test(value)
    if (important) value = value.replace(/\s*!important$/, '')
    return { type: 'decl', prop: chunk.slice(0, colon).trim(), value, important }
  }
  return parseBlock()
}

const SIDES = ['top', 'right', 'bottom', 'left']
const AXIS = {
  '': SIDES,
  inline: ['left', 'right'],
  block: ['top', 'bottom'],
  'inline-start': ['left'],
  'inline-end': ['right'],
  'block-start': ['top'],
  'block-end': ['bottom'],
  top: ['top'],
  right: ['right'],
  bottom: ['bottom'],
  left: ['left'],
}

/** A property as physical longhands, read left-to-right. */
export function longhands(prop) {
  let m = /^(margin|padding|scroll-margin|scroll-padding)(?:-(.+))?$/.exec(prop)
  if (m && AXIS[m[2] ?? '']) return AXIS[m[2] ?? ''].map((s) => `${m[1]}-${s}`)
  m = /^inset(?:-(.+))?$/.exec(prop)
  if (m && AXIS[m[1] ?? '']) return AXIS[m[1] ?? '']
  m = /^border(?:-(.+?))?-(width|color|style)$/.exec(prop)
  if (m && AXIS[m[1] ?? '']) return AXIS[m[1] ?? ''].map((s) => `border-${s}-${m[2]}`)
  if (prop === 'border-radius') {
    return ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => `border-${c}-radius`)
  }
  m = /^border-(start|end)-(start|end)-radius$/.exec(prop)
  if (m) {
    return [
      `border-${m[1] === 'start' ? 'top' : 'bottom'}-${m[2] === 'start' ? 'left' : 'right'}-radius`,
    ]
  }
  if (prop === 'gap') return ['row-gap', 'column-gap']
  if (prop === 'overflow') return ['overflow-x', 'overflow-y']
  if (prop === 'inline-size') return ['width']
  if (prop === 'block-size') return ['height']
  m = /^(min|max)-(inline|block)-size$/.exec(prop)
  if (m) return [`${m[1]}-${m[2] === 'inline' ? 'width' : 'height'}`]
  return [prop]
}

/**
 * Spellings of one selector made equal: `:is(x)` of one selector is `x` (same
 * match, same specificity), combinators are spaced alike, `*` before an
 * attribute selector adds nothing, and an identifier value needs no quotes —
 * so `&>[data-slot=x]` ≡ `:is(& > *)[data-slot="x"]`.
 */
export function normalizeSelector(selector) {
  let s = selector
  for (let pass = 0; pass < 5; pass++) {
    const next = s.replace(/:is\(([^(),]+)\)/g, '$1')
    if (next === s) break
    s = next
  }
  return s
    .replace(/\s*([>+~])\s*/g, ' $1 ')
    .replace(/\*(?=\[)/g, '')
    .replace(/\[([\w-]+)([~|^$*]?=)"([A-Za-z_][\w-]*)"\]/g, '[$1$2$3]')
}

/** Logical keywords read left-to-right, like the logical properties in `longhands`. */
const LOGICAL_KEYWORDS = {
  'text-align': { start: 'left', end: 'right' },
  float: { 'inline-start': 'left', 'inline-end': 'right' },
  clear: { 'inline-start': 'left', 'inline-end': 'right' },
}

/** A value of `prop` with its logical keyword, if any, made physical. */
export function physicalValue(prop, value) {
  return LOGICAL_KEYWORDS[prop]?.[value] ?? value
}

/**
 * Normalizes a value: `var(--x)` with a theme value is replaced by it, and a
 * `calc()` of one length times or divided by a number is evaluated, rem as 16px.
 */
export function normalizeValue(value, themeValue) {
  // Spacing around `*` and `/` is not meaning: `calc(1/2 * 100%)` ≡ `calc(1 / 2 * 100%)`.
  let v = value
    .replace(/\s+/g, ' ')
    .replace(/\s*\*\s*/g, ' * ')
    .replace(/\s*\/\s*/g, ' / ')
    .trim()
  for (let pass = 0; pass < 5; pass++) {
    const next = v.replace(/var\((--[\w-]+)\)/g, (all, name) => themeValue(name) ?? all)
    if (next === v) break
    v = next
  }
  // A number, or a length in px (rem read as 16px): `{ n, px }`.
  const quantity = (s) => {
    const m = /^(-?[\d.]+)(px|rem)?$/.exec(s.trim())
    if (!m) return null
    return { n: Number(m[1]) * (m[2] === 'rem' ? 16 : 1), px: m[2] !== undefined }
  }
  const format = ({ n, px }) => `${Number(n.toFixed(4))}${px ? 'px' : ''}`
  for (let pass = 0; pass < 5; pass++) {
    const next = v.replace(/calc\(\s*([^()]+?)\s*([*/])\s*([^()]+?)\s*\)/g, (all, a, op, b) => {
      const x = quantity(a)
      const y = quantity(b)
      // A length times a number, a length or a number over a number: anything
      // else (a length times a length) isn't a value.
      if (x === null || y === null || y.px || (x.px && y.px)) return all
      return format({ n: op === '*' ? x.n * y.n : x.n / y.n, px: x.px })
    })
    if (next === v) break
    v = next
  }
  const bare = quantity(v)
  return bare !== null && bare.px ? format(bare) : v
}

/**
 * The effective style of a class list. `engine` gives, per class, its CSS
 * (`css(cls)`, null when it compiles to nothing) and the order Tailwind emits
 * the classes in (`order(classes)`, `[cls, bigint | null][]`), and the theme's
 * values (`themeValue(name)`).
 *
 * Returns `{ style: Map<string, string>, unknown: Set<string>, declared:
 * Set<string> }` — `unknown` holds the classes that produce no CSS, which a
 * fix may only move, and `declared` every key a declaration sets, the
 * `--tw-*` ones `style` leaves out included.
 */
export function effectiveStyle(classes, engine) {
  const unique = [...new Set(classes)]
  const ordered = engine
    .order(unique)
    .filter(([, order]) => order !== null)
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([cls]) => cls)
  const unknown = new Set(unique.filter((cls) => !ordered.includes(cls)))
  const winners = new Map()
  for (const cls of ordered) {
    const css = engine.css(cls)
    if (css === null) {
      unknown.add(cls)
      continue
    }
    const self = `.${cssEscape(cls)}`
    const walk = (nodes, context) => {
      for (const node of nodes) {
        if (node.type === 'block') {
          if (/^@(property|keyframes)\b/.test(node.prelude)) continue
          if (/^@supports\b/.test(node.prelude)) {
            walk(node.children, context)
            continue
          }
          const prelude = normalizeSelector(node.prelude.split(self).join('&'))
          walk(node.children, context ? `${context} > ${prelude}` : prelude)
        } else {
          for (const prop of longhands(node.prop)) {
            const key = `${context} | ${prop}`
            const current = winners.get(key)
            if (current?.important && !node.important) continue
            winners.set(key, {
              value: physicalValue(prop, normalizeValue(node.value, engine.themeValue)),
              important: node.important,
            })
          }
        }
      }
    }
    walk(parseCss(css), '')
  }
  // Tailwind's `--tw-*` properties are registered `inherits: false`: one only
  // matters through a declaration of the same element that reads it. One that
  // no winning value reads — `leading-relaxed`'s `--tw-leading` next to a
  // `line-height` that is already 1.625 — changes nothing on screen.
  const read = new Set()
  for (const { value } of winners.values()) {
    for (const m of value.matchAll(/var\((--tw-[\w-]+)/g)) read.add(m[1])
  }
  const style = new Map()
  for (const [key, { value, important }] of winners) {
    const prop = key.slice(key.lastIndexOf(' | ') + 3)
    if (prop.startsWith('--tw-') && !read.has(prop)) continue
    style.set(key, important ? `${value} !important` : value)
  }
  return { style, unknown, declared: new Set(winners.keys()) }
}

/** What changed between two effective styles; `null` when nothing did. */
export function styleDiff(before, after) {
  const changed = []
  for (const key of new Set([...before.style.keys(), ...after.style.keys()])) {
    const a = before.style.get(key)
    const b = after.style.get(key)
    if (a !== b) changed.push({ key, before: a ?? null, after: b ?? null })
  }
  const removedUnknown = [...before.unknown].filter((c) => !after.unknown.has(c))
  const addedUnknown = [...after.unknown].filter((c) => !before.unknown.has(c))
  if (changed.length === 0 && removedUnknown.length === 0 && addedUnknown.length === 0) return null
  return { changed, removedUnknown, addedUnknown }
}
