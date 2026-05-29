## What this rule does

Flags Tailwind color utilities whose arbitrary value is a hardcoded color literal — anything you'd
write with a paint chip in your hand: hex (`bg-[#ff5733]`, `text-[#000]`), `rgb()`/`rgba()`,
`hsl()`/ `hsla()`, plus the modern color spaces `oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()`, and
`color()`. The goal is the same as `no-arbitrary-value` but scoped exclusively to color, which is
where design-system drift tends to start.

The rule checks _only_ the color-bearing utility prefixes (`bg-`, `text-`, `border-*`, `outline-`,
`ring-*`, `shadow-`, `accent-`, `caret-`, `fill-`, `stroke-`, `decoration-`, `divide-`,
`placeholder-`, gradient stops `from-`/`via-`/`to-`). Non-color arbitraries like `w-[200px]` or
`tracking-[0.5em]` are explicitly ignored, so this rule can be enabled even where you _do_ want to
allow arbitrary dimensions.

Values that reference a CSS variable are treated as design-system indirection and pass:
`bg-[var(--primary)]`, `text-[hsl(var(--fg))]`, `bg-[oklch(var(--bg))]`, even
`bg-[var(--primary,#fff)]` (a fallback inside `var()` still counts as referencing a variable). The
non-recursive `var()` check is shallow — `bg-[linear-gradient(hsl(var(--a)),#fff)]` is _not_ flagged
because at least one `var()` is present. This is documented behavior and tested.

DS-independent — no design system is loaded. No autofix: picking the right token is a human
decision.

## Options

### `allow`

`string[]`, default `[]`.

Exact class strings to whitelist. Matches are literal (no prefix match, no regex) so you can pin
specific allowed escapes without opening the door wider. Useful for the occasional brand-mandated
hex in a single brand-asset component.

```jsonc
{
  "tailwindcss/no-hardcoded-colors": ["error", {
    "allow": ["bg-[#000]", "text-[#fff]"]
  }]
}
```

### `entryPoint`

`string`, optional. Present in the schema for forward compatibility but currently unused by the rule
— `no-hardcoded-colors` runs without a design system. You can ignore it.

## Examples

### ✗ Incorrect

```tsx
// Hex literals on color utilities
<div className="bg-[#ff5733] text-[#000]" />

// rgb/rgba/hsl/oklch are all the same answer
<div className="border-[rgba(0,0,0,0.5)] text-[hsl(120,100%,50%)]" />
<div className="bg-[oklch(0.5_0.2_240)]" />

// Variants and `!` modifier don't help
<div className="hover:bg-[#ff5733] !bg-[#ff5733]" />
```

### ✓ Correct

```tsx
// Named theme colors
<div className="bg-blue-500 text-white" />

// CSS variable indirection passes
<div className="bg-[var(--primary)] border-[hsl(var(--border))]" />

// Non-color arbitraries are not this rule's business
<div className="w-[200px] tracking-[0.5em]" />

// Allowlisted exact string
<div className="bg-[#000]" /> // with allow: ["bg-[#000]"]
```

## Interactions with other rules

- **`no-arbitrary-value`**: superset. If you enable that rule, every hardcoded color is already
  flagged. Use `no-hardcoded-colors` alone when you want the specific color message and tolerate
  other arbitrary values; use both for a clearer diagnostic on color drift.
- **`prefer-theme-tokens`**: complementary. `prefer-theme-tokens` asks the design system if a
  matching `@theme` color exists and suggests it; this rule fires regardless of whether a token
  exists, so it catches drift earlier (before you've defined the token).
- **`no-unknown-classes`**: orthogonal. Hardcoded arbitraries are _valid_ Tailwind syntax, so
  `no-unknown-classes` won't flag them. Both should be on.

## When to disable it

- **Marketing/brand pages** with handpicked hex that genuinely doesn't belong in the shared design
  system. Prefer `allow` with the specific class strings.
- **Generated content** (e.g. inline avatars colored from a hash) where the color is determined at
  runtime and rendered as inline style anyway — those won't show up here, but if they do, disable
  the line.
- **Component libraries shipping examples** that intentionally demonstrate arbitrary-color usage in
  docs.
