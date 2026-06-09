# enforce-canonical

> Enforce canonical Tailwind CSS class names using canonicalizeCandidates()

## What this rule does

Asks the design system for the canonical form of every utility in your code and rewrites the ones
that aren't already canonical. "Canonical" is whatever `canonicalizeCandidates()` from
`@tailwindcss/node` returns — the same source of truth used by prettier-plugin-tailwindcss, oxfmt,
and the official Tailwind tooling. Examples: `-m-0` → `m-0` (no negative is needed for a zero),
`bg-gradient-to-r` → `bg-linear-to-r`, `break-words` → `wrap-break-word`, `start-2` → `inset-s-2`,
`flex-grow-1` → `grow`, `p-[2px]` → `p-0.5` (arbitrary value normalized to a named token via your
`--spacing` scale), `text-[var(--color-text)]/90` → `text-(--color-text)/90`. Auto- fix lands the
first hit, suggestions cover the rest in the same string.

Named classes resolve through a precomputed in-memory `canonicalMap` (sub-microsecond). Arbitrary
values (`p-[2px]`, `bg-(--c)`) go through the `canonicalize-service` worker because they need a live
DS lookup; results are cached process-wide per `(entryPoint, rem, class)`. The worker preserves the
position of `!` (important prefix vs suffix vs none).

DS-dependent — requires `settings.tailwindcss.entryPoint`. If the design system can't load, the rule
emits a single fatal `designSystemUnavailable` diagnostic per file instead of silently passing.

## Options

This rule has no per-rule options beyond the standard `entryPoint` override (string, defaults to
`settings.tailwindcss.entryPoint`). Configure the entry point in `settings.tailwindcss.entryPoint`
for the whole project instead of per-rule whenever possible.

## Examples

### ✗ Incorrect

```tsx
// Negative-of-zero is just zero
<div className="-m-0 -mt-0" />

// v3 spellings the official canonicalize step rewrites
<div className="bg-gradient-to-r break-words" />

// Logical inset shorthand → canonical inset-s-* / inset-e-*
<div className="start-2 end-4" />

// Arbitrary values that match a named token via your spacing scale
<div className="p-[2px] max-w-[400px]" />

// Variants and important are preserved
<div className="hover:!break-words" />
```

### ✓ Correct

```tsx
<div className="m-0 mt-0" />

<div className="bg-linear-to-r wrap-break-word" />

<div className="inset-s-2 inset-e-4" />

<div className="p-0.5 max-w-100" />

<div className="hover:!wrap-break-word" />
```

## Interactions with other rules

- **`no-unnecessary-arbitrary-value`**: complementary, no double-fire. This rule rewrites arbitrary
  values to named utilities only when the canonical resolution produces a different CSS shape (e.g.
  `p-[2px]` → `p-0.5` via spacing scale). `no-unnecessary-arbitrary-value` covers the cases where
  the arbitrary already maps directly to a named utility producing the same CSS (e.g. `h-[auto]` →
  `h-auto`).
- **`prefer-theme-tokens`**: the third partner of the arbitrary→named trio. It catches CSS-var
  references like `border-(--border)` → `border-border` where neither `enforce-canonical` (the CSS
  differs) nor `no-unnecessary-arbitrary-value` (no shared bracket equivalent) would fire.
- **`no-deprecated-classes`**: a strict subset of what `enforce-canonical` does. Running both is
  safe; the autofixes agree. Keep `no-deprecated-classes` if you want a fast, hardcoded, DS-free
  pass.
- **`enforce-consistent-important-position`**: this rule preserves the `!` position you wrote
  (prefix vs suffix vs none). `enforce-consistent-important-position` is the single source of truth
  for enforcing a particular position.

## When to disable it

- **You don't want any class rewrites at all** — for example, in a legacy file you're keeping
  verbatim for diffing.
- **Performance-sensitive lint runs** where the worker initialization cost is unwelcome. The cache
  makes subsequent runs cheap, but the first hit pays for `@tailwindcss/node` startup. Most projects
  will not notice.
- **You haven't migrated to Tailwind v4 yet**: the canonical forms produced here assume v4
  semantics.
