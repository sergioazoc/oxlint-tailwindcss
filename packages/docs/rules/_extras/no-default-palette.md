---
description: "oxlint rule that reports Tailwind CSS default palette colors, like `bg-red-500`, in a project whose theme defines its own colors — and names the ones to use."
---

## What this rule does

Tailwind ships a default palette — `red-500`, `gray-100`, `white`, 288 colors in all — and your
theme adds its own: `brand`, or shadcn/ui's `primary`, `muted`, `destructive`. Once a project has
colors of its own, a palette color is usually a design-system leak: it doesn't follow the theme, and
`bg-white` stays white in dark mode where `bg-background` wouldn't. This rule reports every class
that reads a palette color, and names your colors in the message:

```text
"bg-red-500" uses red-500 from Tailwind's default palette, not one of your theme colors: brand,
brand-light.
```

It reads what each class does, not its name: any utility that sets a color (`bg-`, `text-`,
`border-`, `ring-`, `from-`, `fill-`, …), with variants and opacity modifiers
(`hover:bg-red-500/50`), and an arbitrary value that reads a palette variable
(`bg-[var(--color-red-500)]`). A palette color your theme redefines (`--color-red-500: …` in your
`@theme`) is yours, and isn't reported. `transparent`, `current` and `inherit` aren't palette
colors.

With no colors of its own — stock Tailwind — the palette _is_ the project's design system, and the
rule reports nothing.

DS-dependent — needs `settings.tailwindcss.entryPoint` to tell the palette from your colors. No
autofix: which of your colors a palette color should become is a design decision.

## Options

### `allow`

`string[]`, default `[]`.

Palette colors to allow, by name, or by prefix with a trailing `*`. `white` and `black` are palette
colors too, and are reported unless you allow them.

```jsonc
{ "tailwindcss/no-default-palette": ["error", { "allow": ["white", "black", "gray-*"] }] }
```

### `entryPoint`

`string`, optional. Per-rule override of `settings.tailwindcss.entryPoint`.

## Examples

With a theme that declares `--color-brand` and `--color-brand-light`:

### ✗ Incorrect

```tsx
<div className="bg-red-500" />
// reports: "bg-red-500" uses red-500 from Tailwind's default palette

// Variants, opacity modifiers and every color utility read the same variable
<div className="hover:text-blue-600 bg-gray-900/50 from-emerald-400" />

// An arbitrary value that reads a palette variable
<div className="bg-[var(--color-red-500)]" />

// white and black are palette colors
<div className="bg-white" />
```

### ✓ Correct

```tsx
<div className="bg-brand text-brand-light hover:bg-brand/90" />

// Not palette colors
<div className="bg-transparent text-current" />

// Allowed by name or prefix
// options: { "allow": ["white", "gray-*"] }
<div className="bg-white text-gray-900" />
```

## Interactions with other rules

- **`no-hardcoded-colors`**: the other half. It reports color literals (`bg-[#f00]`); this rule
  reports palette colors (`bg-red-500`). Together they leave only your theme's colors.
- **`no-unknown-classes`**: a misspelt theme color (`bg-brnd`) isn't a palette color; that rule
  reports it, with the name you meant.
- **@shadcn/lint's `no-raw-colors`** reports the same palette colors in a shadcn/ui project; run one
  of the two. See [shadcn/ui and @shadcn/lint](/shadcn).

## When to disable it

- **The palette is your design system**, or part of it, on purpose: allow those colors with `allow`,
  or leave the rule off.
- **Code you don't own**, such as vendored components styled with the palette.
