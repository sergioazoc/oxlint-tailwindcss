---
description: "oxlint rule for LTR-only projects that rewrites logical Tailwind CSS utilities into physical ones, like `ms-4` → `ml-4` — the mirror of `enforce-logical`."
---

## What this rule does

The mirror of `enforce-logical`. Rewrites logical, writing-direction aware utilities (`ms-4`,
`pe-2`, `inset-s-0`, `rounded-ss-md`, and on the block axis `mbs-4`, `inset-bs-0`, `border-be`, …)
into their physical equivalents (`ml-4`, `pr-2`, `left-0`, `rounded-tl-md`, `mt-4`, `top-0`,
`border-b`, …). Use this in LTR-only codebases where logical utilities add cognitive overhead
without a payoff — `ml-4` is more direct than `ms-4` when there's no RTL story. Autofix on the first
offender per location, editor suggestion on subsequent ones. The mapping is `enforce-logical`'s
table, inverted.

It converts **both** spellings of the logical insets: `inset-s-2` (what `enforce-logical` and
`enforce-canonical` write on Tailwind 4.2+, the spelling the design system calls canonical) and
`start-2` (the older spelling, which Tailwind's docs used and `enforce-logical` still writes without
a design system).

It also mirrors the three utilities where the direction is the VALUE: `float-start` → `float-left`,
`clear-start` → `clear-left`, `text-start` → `text-left`.

DS-independent in the sense that matters: it shares the static mapping table with `enforce-logical`
and inverts it, so it works without `settings.tailwindcss.entryPoint` — every physical class it
writes exists in every Tailwind v4. When an entry point IS configured, the rule additionally checks
that the class it suggests exists, so a rewrite can never introduce a class that emits nothing.

`enforce-physical` and `enforce-logical` are sibling rules. Enable **only one at a time** — running
both produces an autofix loop.

## Options

### `direction`

`'inline' | 'block' | 'both'`, default `'both'`.

Restricts conversion to one axis: `'inline'` converts the start/end utilities (`ms-*`, `inset-s-*`,
`border-e`, …), `'block'` the block-start/end ones (`mbs-*`, `inset-bs-*`, `border-be`, …).

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "direction": "inline" }] }
```

### `sizing`

`boolean`, default `false`.

Also converts logical sizes back: `inline-*` → `w-*`, `block-*` → `h-*`, and their `min-` / `max-`
forms, one axis at a time (`inline-4 block-4` → `w-4 h-4`). `inline`, `block` and
`inline-{block,flex,grid,table}` are display utilities and are never touched.

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "sizing": true }] }
```

### `allowlist`

`string[]`, default `[]`.

Regex patterns (compiled lazily, invalid ones silently skipped). Classes whose full string matches
any pattern bypass the rewrite. Useful when a specific logical utility is intentional even in an
otherwise-LTR codebase (e.g. one component that has to support RTL).

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "allowlist": ["^ms-", "^pe-"] }] }
```

### `entryPoint`

`string`, optional. A CSS entry point for this rule alone, overriding
`settings.tailwindcss.entryPoint`. Only used to confirm the class being suggested exists; the rule
works without it.

## Examples

### ✗ Incorrect

```tsx
// The direction as a VALUE
<div className="float-start clear-end text-start" />
//              ~~~~~~~~~~~ ~~~~~~~~~ ~~~~~~~~~~ → float-left clear-right text-left

// Both spellings of the logical insets
<div className="start-2 inset-s-4" />
//              ~~~~~~~ ~~~~~~~~~  → left-2 left-4

// Logical margins/padding in an LTR-only project
<div className="ms-4 pe-2" />
//              ~~~~ ~~~~  → ml-4 pr-2

// Logical positioning
<div className="inset-s-0 inset-e-0" />
//              ~~~~~~~~~ ~~~~~~~~~  → left-0 right-0

// Logical borders and radii
<div className="border-s rounded-ss-md" />
//              ~~~~~~~~ ~~~~~~~~~~~~~  → border-l rounded-tl-md

// The block axis
<div className="mbs-4 inset-bs-0 border-be" />
//              ~~~~~ ~~~~~~~~~~ ~~~~~~~~~  → mt-4 top-0 border-b

// options: { "sizing": true }
// Logical sizes
<div className="inline-full block-screen" />
//              ~~~~~~~~~~~ ~~~~~~~~~~~~  → w-full h-screen
```

### ✓ Correct

```tsx
// Physical equivalents
<div className="ml-4 pr-2" />
<div className="left-0 right-0" />
<div className="border-l rounded-tl-md" />
<div className="mt-4 top-0 border-b" />

// options: { "sizing": true }
// Display utilities are not sizes
<div className="inline-flex block" />

// Already physical — variants and important round-trip cleanly
<div className="hover:ml-4 pl-(--gutter) mr-4!" />
```

## Interactions with other rules

- **`enforce-logical`**: the inverse. Pick **one**. Running both simultaneously rewrites in a loop.
- **`enforce-canonical`**: it rewrites `start-2` → `inset-s-2`. Harmless here: this rule converts
  both spellings to `left-2`.
- **`enforce-shorthand`**: both rewrite pairs of sides. `mbs-2 mbe-2` is two block-axis classes to
  this rule and `my-2` to that one, and `enforce-shorthand` folds the physical pair this rule writes
  (`mt-2 mb-2`) the same way, so whichever fix lands first the string ends as `my-2`.

## When to disable it

- **The app supports RTL** (Arabic, Hebrew, Farsi, …): use `enforce-logical` instead, otherwise the
  rule's autofix breaks RTL layouts.
- **You don't have a strong preference**: leaving both disabled is fine. The two rules exist to
  express team conventions, not to enforce correctness.
