## What this rule does

Detects utilities written as a raw CSS-variable reference — `border-(--border)`,
`bg-[var(--primary)]`, `text-(--background)/80` — and rewrites them to the named theme-token utility
when one exists in your design system. So `border-(--border)` becomes `border-border`,
`hover:bg-[var(--primary)]/50` becomes `hover:bg-primary/50`, and `bg-(--red-500)` (where the user
reached past the `--color-` prefix) becomes `bg-red-500`. Both the paren shorthand
(`prefix-(--name)`) and the bracket form (`prefix-[var(--name)]`) are recognized, and opacity
modifiers (`/80`), variants, and `!` (important) are all preserved.

The candidate `${prefix}-${varName}` has to be a real utility in your DS — the rule consults
`cache.isValid(candidate)`. Then it explicitly skips any candidate that `cache.getNamedEquivalent`
would also resolve, because that case is owned by `no-unnecessary-arbitrary-value` (same CSS, no
double-fire). What's left is exactly the heuristic-only space: the named utility exists in your
theme but does not share a bracket-equivalent shape with the original.

DS-dependent — requires `settings.tailwindcss.entryPoint`. If the design system can't load, the rule
emits a single fatal `designSystemUnavailable` diagnostic per file instead of silently passing.

## Options

This rule has no per-rule options beyond the standard `entryPoint` override (string, defaults to
`settings.tailwindcss.entryPoint`). Configure the entry point in `settings.tailwindcss.entryPoint`
for the whole project instead of per-rule whenever possible.

## Examples

### ✗ Incorrect

Assuming a shadcn-style theme with tokens like `--border`, `--primary`, `--background`:

```tsx
// Paren shorthand — the canonical case
<div className="border-(--border) bg-(--primary)" />

// Bracket form
<div className="bg-[var(--primary)]/50" />

// Variants, important, opacity modifiers all preserved
<div className="hover:!border-(--border) dark:bg-(--primary)/80" />

// Directional sub-utility
<div className="border-l-(--border)" />
```

### ✓ Correct

```tsx
<div className="border-border bg-primary" />

<div className="bg-primary/50" />

<div className="hover:!border-border dark:bg-primary/80" />

<div className="border-l-border" />

// Variable with no matching named utility — leave it
<div className="border-(--no-such-token)" />
```

## Interactions with other rules

- **`no-unnecessary-arbitrary-value`**: paired explicitly. When the bracket form is CSS-equivalent
  to a named utility, the other rule wins and this one stays silent (`getNamedEquivalent` guard). So
  `bg-[var(--color-red-500)]` → `bg-red-500` is owned there; `border-(--border)` → `border-border`
  lives here.
- **`enforce-canonical`**: also part of the arbitrary→named trio. It handles cases where
  canonicalization produces a different CSS shape via your tokens. The three rules carve up the
  space so each arbitrary form has exactly one owner.
- **`enforce-consistent-variable-syntax`**: orthogonal — that rule decides between paren and bracket
  forms when you're staying on the CSS-var representation. This one promotes you off CSS-vars onto a
  named token when possible.

## When to disable it

- **You deliberately want to reference variables by name in markup** to make the theme dependency
  explicit at the call site. In that case keep `no-unnecessary-arbitrary-value` on (CSS-equivalent
  cases) but disable this rule.
- **Your design system uses CSS variables that aren't registered as named utilities** in `@theme` —
  the rule won't fire on those, but if your codebase mixes the two patterns and you don't want
  gradual pressure to expose more tokens, disable it.
