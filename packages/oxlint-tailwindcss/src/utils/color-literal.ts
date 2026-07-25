/**
 * Does this CSS value contain a hardcoded color literal, anywhere in it?
 *
 * `no-hardcoded-colors` used to answer that with `^`-anchored regexes over the
 * whole value, which only ever matched a value that IS a color. Every real
 * shorthand slipped through: `shadow-[0_1px_2px_#000]` carries a hardcoded black
 * that the rule promised to catch and didn't. Anchoring also forced a companion
 * list of "color-bearing utility prefixes" to keep the match plausible, and that
 * list drifted from Tailwind (it has `ring` but not `inset-ring`, `shadow` but not
 * `inset-shadow`, and no way to spell an arbitrary property like `[color:#f00]`).
 *
 * Scanning the value instead of anchoring to it drops both problems: the value
 * carries the color or it doesn't, whatever utility it is attached to.
 *
 * Two things must NOT count, and they are why this is a scanner rather than a
 * regex:
 *  - quoted strings — `content-['#fff']` is the text `#fff`, not a color;
 *  - `url()` contents — `fill-[url(#gradient)]` references an SVG node by id, the
 *    single most common `#` in a Tailwind class that isn't a color.
 *
 * The notation set is exactly the one the rule documents (hex + the CSS color
 * functions). Named colors (`bg-[red]`) are deliberately absent: they were never
 * covered, and `currentColor`/`transparent`/`inherit` make that a separate
 * judgement call rather than a scan.
 */

/** CSS color functions. `color-mix` is absent on purpose: its arguments are scanned. */
const COLOR_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
])

/** Hex digit counts CSS accepts: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
const HEX_LENGTHS = new Set([3, 4, 6, 8])

function isHexDigit(ch: string): boolean {
  return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
}

/**
 * `-` belongs to the identifier so `color-mix(` is not read as `color(`. `_` does
 * NOT: in a Tailwind arbitrary value an underscore stands for a space, so
 * `0_0_4px_rgb(…)` has to break into words or the function name never surfaces.
 */
function isIdentChar(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '-'
  )
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

/** Index just past the closing quote (or end of input on an unterminated string). */
function skipQuoted(value: string, start: number): number {
  const quote = value[start]
  let i = start + 1
  while (i < value.length) {
    if (value[i] === '\\') {
      i += 2
      continue
    }
    if (value[i] === quote) return i + 1
    i++
  }
  return value.length
}

/** Index just past the matching `)`, given `open` pointing at a `(`. */
function skipBalanced(value: string, open: number): number {
  let depth = 0
  let i = open
  while (i < value.length) {
    const ch = value[i]
    if (ch === '"' || ch === "'") {
      i = skipQuoted(value, i)
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  return value.length
}

export function containsColorLiteral(value: string): boolean {
  let i = 0
  while (i < value.length) {
    const ch = value[i]

    if (ch === '"' || ch === "'") {
      i = skipQuoted(value, i)
      continue
    }

    if (ch === '#') {
      let end = i + 1
      while (end < value.length && isHexDigit(value[end])) end++
      if (HEX_LENGTHS.has(end - i - 1)) return true
      i = end > i + 1 ? end : i + 1
      continue
    }

    if (isIdentStart(ch)) {
      const start = i
      while (i < value.length && isIdentChar(value[i])) i++
      if (value[i] !== '(') continue
      const name = value.slice(start, i).toLowerCase()
      // `url(#gradient)` is an SVG reference, not a color — skip its contents
      // entirely so the `#` inside never reaches the hex branch.
      if (name === 'url') {
        i = skipBalanced(value, i)
        continue
      }
      if (COLOR_FUNCTIONS.has(name)) return true
      continue
    }

    i++
  }
  return false
}
