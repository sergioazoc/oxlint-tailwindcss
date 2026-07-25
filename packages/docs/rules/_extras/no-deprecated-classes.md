## What this rule does

Flags any class that was renamed when Tailwind moved from v3 to v4 and rewrites it in place with an
auto-fix. Examples: `flex-grow` → `grow`, `flex-shrink` → `shrink`, `overflow-ellipsis` →
`text-ellipsis`, `decoration-clone` → `box-decoration-clone`, `bg-gradient-to-r` → `bg-linear-to-r`
(and the rest of the gradient directions). Variants and `!` (important) modifiers are preserved on
both sides of the rewrite.

### Where the rename list comes from

With `settings.tailwindcss.entryPoint` (or the rule's own `entryPoint`) configured, the list is
**derived from your design system**: Tailwind's own `canonicalizeCandidates` is asked what each v3
spelling maps to, and only the ones it still compiles AND still renames are reported. That covers
renames a hardcoded table did not — `break-words` → `wrap-break-word`, `order-none` → `order-0`, the
reordered position spellings `bg-left-top` → `bg-top-left` and `object-left-top` → `object-top-left`
— and, more importantly, an entry disappears by itself when a future Tailwind stops compiling it,
instead of suggesting a replacement for a class that no longer exists.

Without an entry point the rule falls back to a hardcoded table of the 15 best-known renames, so it
still works with nothing configured and never emits a `designSystemUnavailable` diagnostic.

## Options

### `entryPoint`

`string`, optional. A CSS entry point for this rule alone, overriding
`settings.tailwindcss.entryPoint`. Used to derive the rename list; the rule works without it.

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

- **`no-unknown-classes`**: silently skips any renamed spelling, asking the design system rather
  than a list of its own, so the two rules cannot disagree. You won't get "unknown class" plus
  "deprecated class" for `flex-grow` — only the deprecation. Keep both rules on.
- **`enforce-canonical`**: **this rule owns the renames.** Tailwind canonicalizes them too
  (`bg-gradient-to-r` → `bg-linear-to-r` is both a deprecation and a canonicalization), so both
  rules used to report the same class with the same fix. `enforce-canonical` now stays quiet about
  anything in the rename list and keeps the rest: valid-but-non-canonical forms like `-m-0` → `m-0`
  and `start-2` → `inset-s-2` (`start-*` is current Tailwind, just not the canonical spelling). Keep
  both on — with only `enforce-canonical` enabled the renames go unreported.
- **`no-restricted-classes`**: orthogonal. Use that one to ban valid classes; this one only triggers
  on the fixed v3→v4 rename list.

## When to disable it

- **You're still on Tailwind v3** and want to keep the v3 spellings. Disable this rule until you
  migrate.
- **You intentionally ship a v3-compatible class layer** alongside v4 (for example, a shared library
  that targets both). In that case prefer a targeted `eslint-disable` on the file rather than a
  project-wide disable.
