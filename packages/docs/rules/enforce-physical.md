# enforce-physical

> Enforce physical Tailwind CSS properties instead of logical ones for consistency in LTR-only
> projects

## What this rule does

The mirror of `enforce-logical`. Rewrites logical, writing-direction aware utilities (`ms-4`,
`pe-2`, `start-0`, `rounded-ss-md`, …) into their physical equivalents (`ml-4`, `pr-2`, `left-0`,
`rounded-tl-md`, …). Use this in LTR-only codebases where logical utilities add cognitive overhead
without a payoff — `ml-4` is more direct than `ms-4` when there's no RTL story. Autofix on the first
offender per location, editor suggestion on subsequent ones.

It converts **both** spellings of the logical insets: `start-2` (what `enforce-logical` suggests,
and what Tailwind's docs use) and `inset-s-2` (what `enforce-canonical` rewrites that into, because
the design system calls it canonical). A codebase that ran logical + canonical ends up with
`inset-s-*`, and this rule used to have no way back — its table only knew `start`.

It also mirrors the three utilities where the direction is the VALUE: `float-start` → `float-left`,
`clear-start` → `clear-left`, `text-start` → `text-left`.

DS-independent in the sense that matters: it shares the static mapping table with `enforce-logical`
and inverts it, so it works without `settings.tailwindcss.entryPoint`. When one IS configured, the
rule additionally checks that the class it suggests exists, so a rewrite can never introduce a class
that emits nothing.

`enforce-physical` and `enforce-logical` are sibling rules. Enable **only one at a time** — running
both produces an autofix loop.

## Options

### `direction`

`'inline' | 'block' | 'both'`, default `'both'`.

Restricts conversion to one axis. Today every mapping is inline-axis, so `'block'` effectively
disables the rule. Future-proofing for when Tailwind ships block-axis logical utilities.

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "direction": "inline" }] }
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
<div className="start-0 end-0" />
//              ~~~~~~~ ~~~~~  → left-0 right-0

// Logical borders and radii
<div className="border-s rounded-ss-md" />
//              ~~~~~~~~ ~~~~~~~~~~~~~  → border-l rounded-tl-md
```

### ✓ Correct

```tsx
// Physical equivalents
<div className="ml-4 pr-2" />
<div className="left-0 right-0" />
<div className="border-l rounded-tl-md" />

// Already physical — variants and important round-trip cleanly
<div className="hover:ml-4 pl-(--gutter) mr-4!" />
```

## Interactions with other rules

- **`enforce-logical`**: the inverse. Pick **one**. Running both simultaneously rewrites in a loop.
- **`enforce-canonical`**: it rewrites `start-2` → `inset-s-2`. Harmless here: this rule converts
  both spellings to `left-2`.
- **`enforce-shorthand`**: runs on direction-neutral `m-*` / `p-*` shorthands, so no overlap.

## When to disable it

- **The app supports RTL** (Arabic, Hebrew, Farsi, …): use `enforce-logical` instead, otherwise the
  rule's autofix breaks RTL layouts.
- **You don't have a strong preference**: leaving both disabled is fine. The two rules exist to
  express team conventions, not to enforce correctness.
