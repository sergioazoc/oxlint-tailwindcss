# consistent-variant-order

> Enforce a consistent order for Tailwind CSS variant prefixes

## What this rule does

Reorders the variant prefixes inside a single class so that the chain is always written the same
way. `hover:dark:bg-red` and `dark:hover:bg-red` produce the same CSS in Tailwind v4, but
inconsistent variant order makes grep, code review, and diffs noisy. This rule picks one canonical
order and rewrites everything to match, with autofix on the first offender and editor suggestions on
the rest.

Pseudo-elements (`before`, `after`, `file`, `placeholder`, `selection`, `marker`, `backdrop`,
`first-line`, `first-letter`, `details-content`) are always pinned innermost — closest to the
utility — because in Tailwind v4 a pseudo-element placed before an element-selecting variant
produces broken CSS like `&::before { &>svg { … } }`.

With an entry point configured, which variants those are comes from the selectors the design system
generates rather than from that fixed list, so a variant your project defines is handled too:
`@custom-variant thumb (&::-webkit-slider-thumb)` is pinned innermost like `before:`, and
`@custom-variant child (& > *)` becomes a reordering barrier because moving a state variant across a
combinator changes which element is matched.

DS-optional — when `settings.tailwindcss.entryPoint` is configured, the rule uses the design
system's variant priority table and the derived variant behaviour above. When it isn't, it falls
back to a built-in static order and the fixed list. Both paths are deterministic, and a missing
entry point is tolerated silently (`no-contradicting-variants` is the other rule that does this).

## Options

### `order`

`string[]`, optional.

Custom priority list. Variants appear in the order you list them; anything not listed sorts after,
in its original position. Use this when your team has a house style that differs from Tailwind's
default (e.g. you prefer `dark:` outermost in every chain). The pseudo-element pin still applies
regardless of where they appear in your list.

```jsonc
{
  "tailwindcss/consistent-variant-order": [
    "error",
    { "order": ["dark", "sm", "md", "lg", "xl", "hover", "focus"] }
  ]
}
```

### `entryPoint`

`string`, optional.

Per-rule override of `settings.tailwindcss.entryPoint`. Same semantics as the project-level setting;
almost never needed.

## Examples

### ✗ Incorrect

```tsx
// hover before responsive
<div className="hover:sm:flex" />
//              ~~~~~~~~~~~~~  → sm:hover:flex

// hover before dark
<div className="hover:dark:text-white" />
//              ~~~~~~~~~~~~~~~~~~~~~  → dark:hover:text-white

// pseudo-element before element-selecting variant — broken in Tailwind v4
<div className="before:[&>svg]:text-red-500" />
//              ~~~~~~~~~~~~~~~~~~~~~~~~~~~  → [&>svg]:before:text-red-500
```

### ✓ Correct

```tsx
// Responsive → state
<div className="sm:hover:flex" />

// Color scheme → state
<div className="dark:hover:text-white" />

// Pseudo-element innermost
<div className="[&>svg]:before:text-red-500" />
<div className="dark:has-[.active]:before:text-red-500" />
```

## Interactions with other rules

- **`enforce-sort-order`**: complementary. `enforce-sort-order` sorts whole classes against each
  other; `consistent-variant-order` sorts the prefixes inside one class. Run both.
- **`enforce-canonical`**: orthogonal. Canonical normalizes the utility shape (`m-0`,
  `bg-red-500/50`), not the variant chain.
- **`no-unknown-classes`**: when a variant is reordered the resulting class is still semantically
  equivalent, so unknown-class detection doesn't see a difference.

## When to disable it

- **You rely on `prettier-plugin-tailwindcss` for variant ordering too**: the formatter handles it,
  the rule is redundant. Leaving both on is safe but extra work.
- **Custom variant order that's hard to express as a flat list** (e.g. order depends on the
  utility): disable and rely on review.
- **Generated code** where variant order encodes meaning you don't want rewritten.
