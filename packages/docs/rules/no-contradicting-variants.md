# no-contradicting-variants

> Disallow variant-prefixed classes that are redundant because the base class already applies unconditionally

## What this rule does

Flags variant-prefixed classes that are redundant because the same
utility is already applied unconditionally on the same element. The
canonical case is `flex hover:flex`: `flex` always applies, so the
`hover:` variant adds nothing — under hover it's already there, and
outside hover the base still wins. The variant is pure noise (and a
strong hint that someone meant to write a different utility, like
`hover:inline-flex`).

The rule does NOT report when the variant targets a different element
than the base. Pseudo-elements (`after`, `before`, `placeholder`,
`marker`, `backdrop`, `selection`, `first-line`, `first-letter`,
`file`), child selectors (`*:`, `**:`), and arbitrary selectors
(`[&>svg]`, `[&_div]`) all change the selector target, so
`absolute after:absolute` or `shrink-0 [&>svg]:shrink-0` is fine —
the base applies to the element while the variant applies to a
descendant or pseudo-element.

The match is by exact utility identity, so `bg-white hover:bg-blue-500`
is left alone (different values), as is `flex hover:items-center`
(different utilities).

## Options

(no options)

## Examples

### ✗ Incorrect

```tsx
// `flex` already applies — `dark:flex` is dead weight
<div className="flex dark:flex" />

// Same pattern with `hover`
<div className="hidden hover:hidden" />

// Multiple redundant variants on the same base
<div className="flex hover:flex dark:flex" />
```

### ✓ Correct

```tsx
// Different values under different variants
<div className="bg-white hover:bg-blue-500" />

// Different utilities — no redundancy
<div className="text-white dark:text-black" />

// Only variant classes, no base — nothing is redundant
<div className="hover:flex dark:flex" />

// Pseudo-element targets a different element from the base
<div className="absolute after:absolute" />
<div className="shrink-0 [&>svg]:shrink-0" />
<div className="flex *:data-[slot=select-value]:flex" />
```

## Interactions with other rules

- **`no-duplicate-classes`**: complementary. Duplicates are the same
  string twice (`hover:flex hover:flex`); this rule catches the
  subtler case where the base unconditionally subsumes a variant.
- **`no-conflicting-classes`**: a base utility shadowing a variant
  isn't a CSS-property conflict (both compute to the same property
  value), so `no-conflicting-classes` won't flag it. That's the gap
  this rule fills.
- **`no-dark-without-light`**: opposite shape. This rule flags
  `base + variant:same-utility`; that one flags `dark:foo` with no
  light counterpart at all.

## When to disable it

- **Code generators / class-name builders** that intentionally emit
  both a base and a same-utility variant (rare, but happens when a
  framework merges class lists from different sources and prefers
  not to deduplicate).
- **Snapshot tests / fixtures** that need the redundant pair to
  exercise downstream tooling.

