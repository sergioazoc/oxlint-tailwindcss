# no-deprecated-classes

> Disallow deprecated Tailwind CSS v4 classes

## What this rule does

Flags any class that was renamed when Tailwind moved from v3 to v4 and rewrites it in place with an
auto-fix. The mapping is a hardcoded `DEPRECATED_MAP` — no heuristics, no DS queries against the
deprecated name. Examples: `flex-grow` → `grow`, `flex-shrink` → `shrink`, `overflow-ellipsis` →
`text-ellipsis`, `decoration-clone` → `box-decoration-clone`, `bg-gradient-to-r` → `bg-linear-to-r`
(and the rest of the gradient directions). Variants and `!` (important) modifiers are preserved on
both sides of the rewrite.

Needs **no** design system. The rule consults only the hardcoded `DEPRECATED_MAP`, so it runs even
when `settings.tailwindcss.entryPoint` is not configured, and it never emits a
`designSystemUnavailable` diagnostic. It still plays nicely with the rest of the plugin:
`no-unknown-classes` recognizes the legacy v3 spellings, so `flex-grow` gets a single `deprecated`
diagnostic here rather than that plus an "unknown class" from another rule.

## Options

This rule has no options. For backwards compatibility it still accepts an `entryPoint` string (left
over from when it loaded the design system), but the value is ignored — the rule never reads it.

## Examples

### ✗ Incorrect

```tsx
// v3 flex aliases — v4 dropped the `flex-` prefix
<div className="flex-grow flex-shrink-0" />

// Gradient direction — renamed to bg-linear-to-*
<div className="bg-gradient-to-r from-blue-500 to-purple-500" />

// Text overflow alias and box-decoration shorthand
<div className="overflow-ellipsis" />
<div className="decoration-clone" />

// Variants and important are preserved on the way out
<div className="hover:!flex-grow" />
```

### ✓ Correct

```tsx
// Post-migration spellings
<div className="grow shrink-0" />

<div className="bg-linear-to-r from-blue-500 to-purple-500" />

<div className="text-ellipsis" />
<div className="box-decoration-clone" />

<div className="hover:!grow" />
```

## Interactions with other rules

- **`no-unknown-classes`**: silently skips any class present in `DEPRECATED_MAP`. You won't get
  "unknown class" plus "deprecated class" for `flex-grow` — only the deprecation. Keep both rules
  on.
- **`enforce-canonical`**: covers a strictly larger set than this rule — it rewrites
  valid-but-non-canonical forms (`-m-0` → `m-0`, `start-2` → `inset-s-2`) and also catches every
  deprecation. Running both is fine; the autofixes don't conflict. Pick `no-deprecated-classes` when
  you want a fast pass over the fixed v3→v4 rename list; pick `enforce-canonical` for the full
  DS-backed cleanup.
- **`no-restricted-classes`**: orthogonal. Use that one to ban valid classes; this one only triggers
  on the fixed v3→v4 rename list.

## When to disable it

- **You're still on Tailwind v3** and want to keep the v3 spellings. Disable this rule until you
  migrate.
- **You intentionally ship a v3-compatible class layer** alongside v4 (for example, a shared library
  that targets both). In that case prefer a targeted `eslint-disable` on the file rather than a
  project-wide disable.
