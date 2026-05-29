## What this rule does

The mirror of `enforce-logical`. Rewrites logical, writing-direction aware utilities (`ms-4`,
`pe-2`, `start-0`, `rounded-ss-md`, …) into their physical equivalents (`ml-4`, `pr-2`, `left-0`,
`rounded-tl-md`, …). Use this in LTR-only codebases where logical utilities add cognitive overhead
without a payoff — `ml-4` is more direct than `ms-4` when there's no RTL story. Autofix on the first
offender per location, editor suggestion on subsequent ones.

DS-independent — works without `settings.tailwindcss.entryPoint`. Shares the static mapping table
with `enforce-logical` and inverts it.

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

## Examples

### ✗ Incorrect

```tsx
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
- **`enforce-canonical`**: orthogonal. Canonical normalizes utility shape; this rule swaps logical
  for physical along one axis.
- **`enforce-shorthand`**: runs on direction-neutral `m-*` / `p-*` shorthands, so no overlap.

## When to disable it

- **The app supports RTL** (Arabic, Hebrew, Farsi, …): use `enforce-logical` instead, otherwise the
  rule's autofix breaks RTL layouts.
- **You don't have a strong preference**: leaving both disabled is fine. The two rules exist to
  express team conventions, not to enforce correctness.
