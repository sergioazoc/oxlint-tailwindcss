/**
 * The colour scanner behind `no-hardcoded-colors`.
 *
 * Worth its own unit test because both of its exclusions are the kind of thing a
 * regex gets wrong: a `#` inside a quoted string is text, and a `#` inside `url()`
 * is an SVG node reference — the single most common non-colour `#` in a Tailwind
 * class. The underscore case matters just as much: Tailwind writes spaces as `_`,
 * so `0_0_4px_rgb(…)` has to break into words or the function name never surfaces.
 */

import { describe, expect, it } from 'vitest'
import { containsColorLiteral } from '../../src/utils/color-literal'

describe('containsColorLiteral', () => {
  it.each([
    '#fff',
    '#ffff',
    '#ff0000',
    '#ff0000ff',
    '#FF0000',
    'rgb(0,0,0)',
    'rgba(0 0 0 / 0.5)',
    'hsl(0deg 0% 0%)',
    'hsla(0,0%,0%,0.5)',
    'hwb(0 0% 0%)',
    'lab(50% 40 59)',
    'lch(50% 40 30)',
    'oklab(0.4 0.1 0.1)',
    'oklch(0.7 0.1 20)',
    'color(display-p3 1 0 0)',
    // Underscores are spaces, so the colour is a separate word.
    '0_1px_2px_#000',
    'inset_0_0_4px_rgb(0_0_0/0.5)',
    // Nested inside another function.
    'linear-gradient(#fff,#000)',
    'color-mix(in_oklab,#fff,#000)',
    'drop-shadow(0_0_2px_#0008)',
  ])('finds a colour in %s', (value) => {
    expect(containsColorLiteral(value)).toBe(true)
  })

  it.each([
    // Quoted: text that happens to look like a colour.
    "'#fff'",
    '"#ff0000"',
    "attr(data-x)_'#000'",
    // An SVG reference, not a colour.
    'url(#gradient)',
    'url("#gradient")',
    'url(/img.png)',
    // Lengths, keywords and other non-colour values.
    '200px',
    'calc(100%_-_2rem)',
    '18rem_1fr',
    'currentColor',
    'transparent',
    // Not a hex length CSS accepts.
    '#12345',
    '#ff00000',
    '#',
    // `color-mix` on its own carries no literal; its arguments are what count.
    'color-mix(in_oklab,var(--a),var(--b))',
    // An identifier that merely ends in a colour function's name.
    'my-rgb(1)',
    '',
  ])('finds no colour in %s', (value) => {
    expect(containsColorLiteral(value)).toBe(false)
  })

  it('does not walk off the end of an unterminated string or paren', () => {
    expect(containsColorLiteral("'#fff")).toBe(false)
    expect(containsColorLiteral('url(#fff')).toBe(false)
  })
})
