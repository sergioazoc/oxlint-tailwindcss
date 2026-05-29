## What this rule does

Tailwind v4 added a shorthand for arbitrary CSS variable values: `bg-(--primary)` is sugar for
`bg-[var(--primary)]`. Both produce the same CSS. This rule picks one of the two syntaxes and
rewrites every class that uses the other. Autofix on the first offender per location, editor
suggestion on subsequent ones.

The rule only touches the simple `something-[var(--name)]` ↔ `something-(--name)` pair. Complex
expressions like `bg-[color-mix(in_srgb,var(--primary),transparent)]` are left alone — they don't
have a shorthand form. Important modifier (`!flex` / `flex!`) and variant chains (`hover:`, `dark:`)
round-trip correctly.

DS-independent — works without `settings.tailwindcss.entryPoint`. Pure string transform on the
utility shape; no design-system lookup.

## Options

### `syntax`

`'shorthand' | 'explicit'`, default `'shorthand'`.

`'shorthand'` rewrites `bg-[var(--primary)]` → `bg-(--primary)`. This is the Tailwind v4 idiomatic
form and the recommended choice for new projects. `'explicit'` rewrites the other direction —
`bg-(--primary)` → `bg-[var(--primary)]` — useful if you still target older tooling or if your team
prefers the longer form for grepability.

```jsonc
{ "tailwindcss/enforce-consistent-variable-syntax": ["error", { "syntax": "shorthand" }] }
```

## Examples

### ✗ Incorrect

```tsx
// Default shorthand — explicit form is reported
<div className="bg-[var(--primary)]" />
//              ~~~~~~~~~~~~~~~~~~~  → bg-(--primary)

// With a variant chain
<div className="dark:hover:text-[var(--color)]" />
//              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  → dark:hover:text-(--color)

// With important modifier
<div className="!bg-[var(--primary)]" />
//              ~~~~~~~~~~~~~~~~~~~~  → !bg-(--primary)
```

### ✓ Correct

```tsx
// Shorthand (default)
<div className="bg-(--primary) text-(--text-color)" />

// Variants and important round-trip cleanly
<div className="hover:bg-(--primary) font-bold!" />

// Complex expressions are NOT rewritten
<div className="bg-[color-mix(in_srgb,var(--primary),transparent)]" />
```

## Interactions with other rules

- **`enforce-canonical`**: doesn't touch variable syntax. Canonical normalizes utility names; this
  rule normalizes the variable form. Both run together cleanly.
- **`no-unnecessary-arbitrary-value`**: also targets arbitrary values but for the named-equivalent
  case (`bg-[#ff0000]` → `bg-red-500`). Disjoint from this rule.
- **`prefer-theme-tokens`**: when a CSS variable matches a `@theme` token, that rule swaps to the
  named utility (`bg-(--primary)` → `bg-primary` if `--primary` is declared in `@theme`). Run that
  one before this one if you want both transforms.

## When to disable it

- **You target tooling older than Tailwind v4**: the shorthand form isn't supported. Set
  `syntax: 'explicit'` instead of disabling, so you get the rewrite in the safe direction.
- **Mixed-syntax codebase mid-migration** where consistency isn't yet the goal.
