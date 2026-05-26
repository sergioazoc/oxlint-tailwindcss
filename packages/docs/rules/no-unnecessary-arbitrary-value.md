# no-unnecessary-arbitrary-value

> Disallow arbitrary values when a named Tailwind class produces the same CSS

## What this rule does

Detects utilities written with an arbitrary value (`w-[200px]`,
`h-[auto]`, `bg-[var(--color-red-500)]`) where the design system
already exposes a named utility that produces the exact same CSS, and
rewrites the arbitrary form to the named one. The lookup goes through
the precomputed `arbitraryEquivalents` map (built once per `@theme` —
for every named utility, the precompute step enumerates every dash
split point so multi-segment utilities like `bg-red-500` register both
`bg-[<value>]` and `bg-red-[<value>]`). Auto-fix lands on the first
hit, suggestions cover the rest in the same string. Variants and `!`
(important) are preserved.

The check fires only when an arbitrary value is present in the
utility (`hasArbitraryValue(cls)` is true) AND the cache returns a
`getNamedEquivalent` match. That keeps the rule cheap and focused —
no fuzzy resolution, no DS round-trip per class.

DS-dependent — requires `settings.tailwindcss.entryPoint`. If the
design system can't load, the rule emits a single fatal
`designSystemUnavailable` diagnostic per file instead of silently
passing.

## Options

This rule has no per-rule options beyond the standard `entryPoint`
override (string, defaults to `settings.tailwindcss.entryPoint`).
Configure the entry point in `settings.tailwindcss.entryPoint` for the
whole project instead of per-rule whenever possible.

## Examples

### ✗ Incorrect

```tsx
// `h-[auto]` is just `h-auto`
<div className="h-[auto] w-[auto]" />

// var() reference to a theme color that has a named utility
<div className="bg-[var(--color-red-500)] text-[var(--color-blue-700)]" />

// Variant prefix and important are preserved
<div className="hover:h-[auto] !w-[auto]" />
```

### ✓ Correct

```tsx
// Named utilities produce the same CSS
<div className="h-auto w-auto" />

<div className="bg-red-500 text-blue-700" />

<div className="hover:h-auto !w-auto" />

// Arbitrary value with no named equivalent — leave it
<div className="w-[200px] bg-[#custom]" />
```

## Interactions with other rules

- **`enforce-canonical`**: complementary, no double-fire. This rule
  fires only when the arbitrary form maps directly to a named utility
  producing the same CSS (`h-[auto]` → `h-auto`,
  `bg-[var(--color-red-500)]` → `bg-red-500`). `enforce-canonical`
  fires when the canonical form is a different shape that still
  happens to produce the right CSS via your tokens (`p-[2px]` → `p-
  0.5` via the spacing scale). The two carve up the arbitrary→named
  space cleanly.
- **`prefer-theme-tokens`**: also complementary. It fires for CSS-var
  references in the `prefix-(--name)` / `prefix-[var(--name)]` paren
  shorthand when no bracket-equivalent exists — that's the heuristic-
  only case this rule explicitly rejects (see the `getNamedEquivalent`
  guard).
- **`no-deprecated-classes`**: orthogonal. Deprecated names like
  `flex-grow` don't have arbitrary values, so the two rules never
  touch the same class.

## When to disable it

- **You intentionally keep arbitrary values for readability** — some
  teams prefer `w-[200px]` to a token alias when the value is one-off
  or pixel-precise. Disable the rule and rely on `prefer-theme-
  tokens` + `enforce-canonical` for the cases you do want flagged.
- **Migrating from a different tooling chain** that produced
  arbitrary values for everything — run as `warn` until cleanup is
  complete, then bump to `error`.

