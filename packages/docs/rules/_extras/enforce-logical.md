---
description: "oxlint rule that rewrites physical Tailwind CSS utilities into logical, RTL-friendly ones, like `ml-4` → `ms-4` and `pr-2` → `pe-2`, with an autofix."
---

## What this rule does

Rewrites physical-direction Tailwind utilities into their logical, writing-mode aware equivalents:
`ml-4` → `ms-4`, `pr-2` → `pe-2`, `left-0` → `inset-s-0`, `rounded-tl-md` → `rounded-ss-md`, and on
the block axis `mt-4` → `mbs-4`, `top-0` → `inset-bs-0`, `border-b` → `border-be`. Logical utilities
resolve to `margin-inline-start` / `padding-block-end` / … in CSS, so they follow the writing
direction without any extra code: required if your app ships in Arabic, Hebrew, Farsi, or any other
RTL language, and the block axis also follows a vertical writing mode. Autofix on the first offender
per location, editor suggestion on subsequent ones.

| Physical                                                        | Logical                                                         | Axis                  |
| --------------------------------------------------------------- | --------------------------------------------------------------- | --------------------- |
| `ml` / `mr`, `pl` / `pr`                                        | `ms` / `me`, `ps` / `pe`                                        | inline                |
| `scroll-ml` / `scroll-mr`, `scroll-pl` / `scroll-pr`            | `scroll-ms` / `scroll-me`, `scroll-ps` / `scroll-pe`            | inline                |
| `left` / `right`                                                | `inset-s` / `inset-e` (`start` / `end` before 4.2)              | inline                |
| `border-l` / `border-r`                                         | `border-s` / `border-e`                                         | inline                |
| `rounded-l` / `rounded-r`, `rounded-tl` / `-tr` / `-bl` / `-br` | `rounded-s` / `rounded-e`, `rounded-ss` / `-se` / `-es` / `-ee` | inline                |
| `float-`, `clear-`, `text-` `left` / `right`                    | `float-`, `clear-`, `text-` `start` / `end`                     | inline                |
| `mt` / `mb`, `pt` / `pb`                                        | `mbs` / `mbe`, `pbs` / `pbe`                                    | block                 |
| `scroll-mt` / `scroll-mb`, `scroll-pt` / `scroll-pb`            | `scroll-mbs` / `scroll-mbe`, `scroll-pbs` / `scroll-pbe`        | block                 |
| `top` / `bottom`                                                | `inset-bs` / `inset-be`                                         | block                 |
| `border-t` / `border-b`                                         | `border-bs` / `border-be`                                       | block                 |
| `w`, `min-w`, `max-w`                                           | `inline`, `min-inline`, `max-inline`                            | inline, with `sizing` |
| `h`, `min-h`, `max-h`                                           | `block`, `min-block`, `max-block`                               | block, with `sizing`  |
| `size`                                                          | `inline` + `block`                                              | both, with `sizing`   |

`rounded-t-*` / `rounded-b-*` have no block-axis counterpart (Tailwind has no `rounded-bs`), so they
are left alone.

The table also covers the three utilities where the direction is the VALUE rather than part of the
property: `float-left` → `float-start` (`float: inline-start`), `clear-left` → `clear-start`, and
`text-left` → `text-start` (`text-align: start`). Miss those and a codebase can be "fully converted"
and still float things to the left in RTL.

The block axis, logical sizing and `inset-s-*` / `inset-e-*` shipped in Tailwind 4.2. With a design
system the rule checks that your Tailwind has them: on 4.1 it leaves the block axis alone and writes
`start-0` for `left-0`. Without `settings.tailwindcss.entryPoint` there is nothing to check against,
so it writes `start-0` and only **suggests** the block-axis rewrites, never autofixes them.

DS-independent in the sense that matters: the mapping table is static and the rule works without an
entry point. When one IS configured, the rule also checks that the class it suggests exists — a
project with its own `@utility ml-huge` used to be autofixed to `ms-huge`, which emits no CSS at
all, so the fix applied and the margin silently disappeared.

`enforce-logical` and `enforce-physical` are sibling rules — they share a mapping table that one
inverts. Enable **only one at a time**.

## Options

### `direction`

`'inline' | 'block' | 'both'`, default `'both'`.

Restricts conversion to one axis. `'inline'` converts left and right (`ml-*`, `left-*`, `border-r`,
`float-left`, …), the part that matters for RTL. `'block'` converts top and bottom (`mt-*`, `top-*`,
`border-b`, …), which only differ from their logical forms in a vertical writing mode. A codebase
converted for RTL that never sets text vertically can keep `'inline'`.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "direction": "inline" }] }
```

### `sizing`

`boolean`, default `false`.

Also converts widths and heights: `w-*` → `inline-*`, `h-*` → `block-*`, their `min-` / `max-`
forms, and `size-*` → `inline-* block-*`. Off by default: sizes are in nearly every class string,
and a width equals an inline size in every horizontal writing mode, RTL included. It follows
`direction` — `w-*` is inline, `h-*` block, and `size-*` needs both.

Some sizes have no logical counterpart and are left alone: a width in viewport heights (`w-dvh`) or
a height in viewport widths (`h-dvw`), `max-w-prose`, and `max-w-screen-*`. With a design system a
named value is converted only when the two classes declare the same thing: `w-*` reads `--width-*`
first and `inline-*` only `--container-*`, so if your theme defines `--width-xs`, `w-xs` and
`inline-xs` differ and `w-xs` stays as written.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "sizing": true }] }
```

### `allowlist`

`string[]`, default `[]`.

Regex patterns (compiled lazily, invalid ones silently skipped). Classes whose full string matches
any pattern bypass the rewrite. Use this for one-off cases where you genuinely want a physical
direction — e.g. an icon that should always sit on the visual left regardless of writing direction.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "allowlist": ["^ml-icon$", "^rounded-tl-special$"] }] }
```

### `entryPoint`

`string`, optional. A CSS entry point for this rule alone, overriding
`settings.tailwindcss.entryPoint`. Only used to confirm that the class being suggested exists and
that your Tailwind has the 4.2 utilities; the rule works without it.

## Examples

### ✗ Incorrect

```tsx
// Physical margins/padding
<div className="ml-4 pr-2" />
//              ~~~~ ~~~~  → ms-4 pe-2

// The direction as a VALUE
<div className="float-left clear-right text-left" />
//              ~~~~~~~~~~ ~~~~~~~~~~~ ~~~~~~~~~ → float-start clear-end text-start

// Positioning
<div className="left-0 right-0" />
//              ~~~~~~ ~~~~~~~  → inset-s-0 inset-e-0

// Borders and radii
<div className="border-l rounded-tl-md" />
//              ~~~~~~~~ ~~~~~~~~~~~~~  → border-s rounded-ss-md

// The block axis
<div className="mt-4 top-0 border-b" />
//              ~~~~ ~~~~~ ~~~~~~~~  → mbs-4 inset-bs-0 border-be

// options: { "sizing": true }
// Sizes
<div className="w-full h-screen size-4" />
//              ~~~~~~ ~~~~~~~~ ~~~~~~  → inline-full block-screen inline-4 block-4
```

### ✓ Correct

```tsx
// Logical equivalents
<div className="ms-4 pe-2" />
<div className="inset-s-0 inset-e-0" />
<div className="border-s rounded-ss-md" />
<div className="mbs-4 inset-bs-0 border-be" />

// Already logical — variants and important round-trip cleanly
<div className="hover:ms-4 ps-(--gutter) me-4!" />

// options: { "direction": "inline" }
// Only the inline axis: the block axis is left as written
<div className="mt-4 top-0" />
```

## Interactions with other rules

- **`enforce-physical`**: the inverse. They share the mapping table; enabling both at the same time
  will autofix in a loop. Pick one based on whether your app supports RTL (use `enforce-logical`) or
  is LTR-only (use `enforce-physical`).
- **`enforce-canonical`**: it agrees on the logical insets. On Tailwind 4.2+ this rule writes
  `inset-s-2`, the spelling the design system reports as canonical; `start-2` (what it writes
  without a design system, or on 4.1) is rewritten to `inset-s-2` by `enforce-canonical`. Same CSS
  either way, and `enforce-physical` converts both spellings back.
- **`enforce-shorthand`**: both rewrite pairs of sides. `mt-2 mb-2` is a block-axis pair to this
  rule and `my-2` to that one; `enforce-shorthand` also folds the logical pairs this rule writes
  (`mbs-2 mbe-2` → `my-2`, `inset-s-0 inset-e-0` → `inset-x-0`), so whichever fix lands first the
  string ends as `my-2`, which is already logical (`margin-block`). With `sizing`, `w-4 h-4` ends as
  `inline-4 block-4` either way: `enforce-shorthand` never folds that pair into `size-4`. The one
  combination that can end two ways is `direction: 'inline'` with `sizing`: `w-4 h-4` becomes
  `size-4` or `inline-4 h-4` depending on which fix runs first.

## When to disable it

- **LTR-only applications** where you're sure RTL will never be needed. Use `enforce-physical`
  instead if you want consistency in the other direction.
- **Pixel-perfect layouts where physical direction is part of the design** (rare, but happens with
  icons or decoration). Reach for `allowlist` before disabling globally.
