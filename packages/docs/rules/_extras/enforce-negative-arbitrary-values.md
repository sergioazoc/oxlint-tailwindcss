## What this rule does

Detects utilities written with a negative prefix outside an arbitrary
value bracket — `-top-[5px]`, `-translate-x-[10px]`, `-mt-[8px]` —
and rewrites the negative sign into the bracket: `top-[-5px]`,
`translate-x-[-10px]`, `mt-[-8px]`. The outer `-` is redundant once
you have an arbitrary value, and moving it inside makes the intent
explicit and matches how `@tailwindcss/node` canonicalizes the same
shape. Auto-fix lands the first hit, suggestions cover the rest in
the same string. Variants (`hover:-mt-[8px]`) and `!` (important,
prefix or suffix) are preserved.

The rule only fires when both conditions hold: the utility starts
with `-` (after stripping `!`) AND there is an arbitrary value
bracket whose inner content does **not** already start with `-`. So
`top-[-5px]` and `-translate-x-1` (no brackets) are both correct as
written.

Pure string transform — no design system, no worker, no entry point.
This is the only rule in the Modernization bucket that does not load
the DS. It will run identically whether or not
`settings.tailwindcss.entryPoint` is configured.

## Options

This rule has no options. It applies the same transformation
everywhere.

## Examples

### ✗ Incorrect

```tsx
// Negative outside brackets — move it inside
<div className="-top-[5px] -left-[10px]" />

// Transform with arbitrary value
<div className="-translate-x-[10px]" />

// Variant prefix preserved
<div className="hover:-mt-[8px]" />

// Important modifier preserved
<div className="!-top-[5px]" />
```

### ✓ Correct

```tsx
// Negative is inside the bracket
<div className="top-[-5px] left-[-10px]" />

<div className="translate-x-[-10px]" />

<div className="hover:mt-[-8px]" />

<div className="!top-[-5px]" />

// Negative without arbitrary value — fine
<div className="-translate-x-1 -mt-4" />
```

## Interactions with other rules

- **`enforce-canonical`**: complementary. `enforce-canonical` will
  also normalize the canonical form of negative arbitraries through
  the worker; this rule provides the same fix without paying the DS-
  load cost. If both are enabled the autofixes converge on the same
  output.
- **`no-unnecessary-arbitrary-value`**: orthogonal. That rule only
  fires when the arbitrary value has a named equivalent; this one
  fires whether or not it does.
- **`prefer-theme-tokens`**: orthogonal. Theme-token references
  (`bg-(--name)`) don't carry an outer negative, so the two never
  touch the same class.

## When to disable it

- **You prefer the outer-negative form for readability** at the call
  site (rare — most teams find the inner-negative form clearer once
  they see it).
- **You're auto-generating class strings** that always emit the outer-
  negative form and you don't want lint diagnostics in that
  generated layer. Prefer disabling the rule in the generated file
  rather than project-wide.
