---
description: "oxlint rule that writes Tailwind CSS variant chains outermost first — `dark:hover:`, not `hover:dark:` — and rewrites the rest to match, with an autofix."
---

## What this rule does

Reorders the variant prefixes inside a single class so that the chain is always written the same
way. `hover:dark:bg-red` and `dark:hover:bg-red` produce the same CSS in Tailwind v4, but
inconsistent variant order makes grep, code review, and diffs noisy. This rule picks one canonical
order and rewrites everything to match, with autofix on the first offender and editor suggestions on
the rest.

The order goes from the outside in — the way Tailwind's docs and shadcn/ui write chains:

1. **Where the page is**: breakpoints (`sm` … `2xl`, `min-*`, `max-*`), `supports-*`, `motion-*`,
   `contrast-*`, `forced-colors`, `pointer-*`, `portrait` / `landscape`, `dark`, container queries
   (`@md`, `@min-*`), `print`, `starting`, `ltr` / `rtl`.
2. **Which ancestor or sibling the element sits in**: `group-*`, `peer-*`, `in-*`.
3. **What the element is**: `aria-*`, `data-*`, `has-*`, `not-*`.
4. **How it's being used**: `visited`, `target`, `hover`, `focus`, `focus-within`, `focus-visible`,
   `active`.
5. **Its form state**: `enabled`, `disabled`, `checked`, … `read-only`, `open`, `inert`.
6. **Where it sits among its siblings**: `first`, `last`, `only`, `odd`, `even`, `*-of-type`,
   `nth-*`, `empty`.

Breakpoints among themselves, container queries among themselves, and the variants within step 2 or
within step 3 keep the order you wrote them in, so `data-[a]:data-[b]:` and `data-[b]:data-[a]:` are
both left alone. `not-X` sorts as X (`not-sm:hover:`). A variant the rule has no place for — one
your project defines with `@custom-variant` — is never moved, and nothing is moved across it.

Pseudo-elements (`before`, `after`, `file`, `placeholder`, `selection`, `marker`, `backdrop`,
`first-line`, `first-letter`, `details-content`) are always pinned innermost — closest to the
utility — because in Tailwind v4 a pseudo-element placed before an element-selecting variant
produces broken CSS like `&::before { &>svg { … } }`. Variants that point the selector at another
element (`*`, `**`, `[&>svg]`) are barriers: nothing is reordered across them, because
`hover:[&>svg]:` (`&:hover > svg`) and `[&>svg]:hover:` (`& > svg:hover`) style different elements.

DS-optional — the order is the same with or without `settings.tailwindcss.entryPoint`. What the
design system adds is what your project's own variants are, from the selectors it generates:
`@custom-variant thumb (&::-webkit-slider-thumb)` is pinned innermost like `before:`,
`@custom-variant child (& > *)` becomes a barrier, and a breakpoint you add with `--breakpoint-3xl`
sorts with the others. Without one, the rule uses the fixed lists above, and a missing entry point
is tolerated silently (`no-contradicting-variants` is the other rule that does this).

## Options

### `order`

`string[]`, optional.

Custom priority list, replacing the built-in order. Variants appear in the order you list them;
anything not listed sorts after, in its original position. Use this when your team has a house style
that differs from the default (e.g. you want states before breakpoints). The pseudo-element pin and
the barriers still apply regardless of your list.

```jsonc
{
  "tailwindcss/consistent-variant-order": ["error", { "order": ["hover", "focus", "sm", "md"] }]
}
```

### `entryPoint`

`string`, optional.

Per-rule override of `settings.tailwindcss.entryPoint`. Same semantics as the project-level setting;
almost never needed.

## Examples

### ✗ Incorrect

```tsx
// state before breakpoint
<div className="hover:sm:flex" />
// → <div className="sm:hover:flex" />

// state before color scheme
<div className="hover:dark:text-white" />
// → <div className="dark:hover:text-white" />

// how it's used before what it is
<div className="focus:data-[state=open]:bg-accent" />
// → <div className="data-[state=open]:focus:bg-accent" />

// pseudo-element before an element-selecting variant — broken in Tailwind v4
<div className="before:[&>svg]:text-red-500" />
// → <div className="[&>svg]:before:text-red-500" />
```

### ✓ Correct

```tsx
<div className="sm:hover:flex" />
<div className="dark:hover:text-white" />
<div className="md:peer-data-[variant=inset]:m-2" />
<div className="data-[state=open]:focus:bg-accent" />

// Pseudo-element innermost
<div className="[&>svg]:before:text-red-500" />
<div className="dark:has-[.active]:before:text-red-500" />

// Barriers: both orders target different elements, so both stay
<div className="hover:[&>svg]:w-4" />
<div className="[&>svg]:hover:w-4" />
```

## Interactions with other rules

- **`enforce-sort-order`**: complementary. `enforce-sort-order` sorts whole classes against each
  other; `consistent-variant-order` sorts the prefixes inside one class. Run both.
- **oxfmt's `sortTailwindcss`**: it sorts whole classes and leaves the variant chain inside each
  class as written, so it doesn't replace this rule.
- **`enforce-canonical`**: orthogonal. Canonical normalizes the utility shape (`m-0`,
  `bg-red-500/50`), not the variant chain.
- **`no-unknown-classes`**: when a variant is reordered the resulting class is still semantically
  equivalent, so unknown-class detection doesn't see a difference.

## When to disable it

- **Custom variant order that's hard to express as a flat list** (e.g. order depends on the
  utility): disable and rely on review.
- **Generated code** where variant order encodes meaning you don't want rewritten.
