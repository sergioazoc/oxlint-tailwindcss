# enforce-logical

> Enforce logical (RTL-friendly) Tailwind CSS properties instead of physical ones

## What this rule does

Rewrites physical-direction Tailwind utilities (`ml-4`, `pr-2`, `left-0`, `rounded-tl-md`, …) into
their logical, writing-direction aware equivalents (`ms-4`, `pe-2`, `start-0`, `rounded-ss-md`, …).
Logical utilities resolve to `margin-inline-start` / `padding-inline-end` / … in CSS, which means
they flip automatically in RTL contexts without any extra code. Required if your app ships in
Arabic, Hebrew, Farsi, or any other RTL language. Autofix on the first offender per location, editor
suggestion on subsequent ones.

The table also covers the three utilities where the direction is the VALUE rather than part of the
property: `float-left` → `float-start` (`float: inline-start`), `clear-left` → `clear-start`, and
`text-left` → `text-start` (`text-align: start`). Miss those and a codebase can be "fully converted"
and still float things to the left in RTL.

DS-independent in the sense that matters: the mapping table is static and the rule works without
`settings.tailwindcss.entryPoint`. When one IS configured, the rule additionally checks that the
class it suggests exists — a project with its own `@utility ml-huge` used to be autofixed to
`ms-huge`, which emits no CSS at all, so the fix applied and the margin silently disappeared.

`enforce-logical` and `enforce-physical` are sibling rules — they share a mapping table that one
inverts. Enable **only one at a time**.

## Options

### `direction`

`'inline' | 'block' | 'both'`, default `'both'`.

Restricts conversion to one axis. Today every mapping in the table is inline-axis (left/right become
start/end), so `'block'` effectively disables the rule and `'inline'` / `'both'` behave identically.
The option is in place for when Tailwind ships block-axis logical utilities.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "direction": "inline" }] }
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
`settings.tailwindcss.entryPoint`. Only used to confirm the class being suggested exists; the rule
works without it.

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
//              ~~~~~~ ~~~~~~~  → start-0 end-0

// Borders and radii
<div className="border-l rounded-tl-md" />
//              ~~~~~~~~ ~~~~~~~~~~~~~  → border-s rounded-ss-md
```

### ✓ Correct

```tsx
// Logical equivalents
<div className="ms-4 pe-2" />
<div className="start-0 end-0" />
<div className="border-s rounded-ss-md" />

// Already logical — variants and important round-trip cleanly
<div className="hover:ms-4 ps-(--gutter) me-4!" />
```

## Interactions with other rules

- **`enforce-physical`**: the inverse. They share the mapping table; enabling both at the same time
  will autofix in a loop. Pick one based on whether your app supports RTL (use `enforce-logical`) or
  is LTR-only (use `enforce-physical`).
- **`enforce-canonical`**: it has an opinion about the logical insets. This rule suggests `start-2`
  (what Tailwind's docs use); the design system reports `inset-s-2` as the canonical spelling, so
  with both rules on you end up there in two passes. Same CSS either way, and `enforce-physical`
  converts both spellings back.
- **`enforce-shorthand`**: runs on plain `m-*` / `p-*` shorthands, which are already
  direction-neutral, so the two don't overlap.

## When to disable it

- **LTR-only applications** where you're sure RTL will never be needed. Use `enforce-physical`
  instead if you want consistency in the other direction.
- **Pixel-perfect layouts where physical direction is part of the design** (rare, but happens with
  icons or decoration). Reach for `allowlist` before disabling globally.
