## What this rule does

Reports a hardcoded value that is **numerically equal** to something your design system already
names, and suggests the name — `p-[10px]` → `p-2.5`, `w-[140px]` → `w-35`, `rounded-[0.5rem]` →
`rounded-lg`.

### Parity with Tailwind CSS IntelliSense

This is the rule that reproduces Tailwind CSS IntelliSense's `suggestCanonicalClasses` diagnostic
for arbitrary lengths — the "`pl-[15px]` can be written as `pl-3.75`" hint. `enforce-canonical` and
`no-unnecessary-arbitrary-value` deliberately do **not** report it: both require byte-identical CSS,
and `pl-3.75` compiles to `calc(var(--spacing) * 3.75)`, not `15px`
([#78](https://github.com/sergioazoc/oxlint-tailwindcss/issues/78)).

The suggestions are applied by `oxlint --fix-suggestions` (never by plain `oxlint --fix`), which
matches the editor experience. To reproduce the IntelliSense example exactly — dynamic steps like
`pl-3.75` that fall between the enumerated `0.5` stops — set a finer `step` (see [`step`](#step)
below):

```jsonc
{ "tailwindcss/prefer-scale-token": ["warn", { "step": 0.25 }] }
```

It exists because the other three arbitrary→named rules each key on something this case does not
satisfy:

| Rule                             | Fires on                               | Keyed on               |
| -------------------------------- | -------------------------------------- | ---------------------- |
| `no-unnecessary-arbitrary-value` | `w-[100%]` → `w-full`                  | byte-identical CSS     |
| `enforce-canonical`              | what `canonicalizeCandidates` proposes | the same, since #78    |
| `prefer-theme-tokens`            | `bg-(--primary)` → `bg-primary`        | the NAME of a variable |
| **this rule**                    | `p-[10px]` → `p-2.5`                   | **numeric equality**   |

`p-2.5` compiles to `padding: calc(var(--spacing) * 2.5)` and `p-[10px]` to `padding: 10px`. Same
length, different text — so no rule that requires identical CSS can report it, which is exactly what
changed in [#78](https://github.com/sergioazoc/oxlint-tailwindcss/issues/78) when the autofixer was
made conservative.

### Report-only, on purpose

**There is no autofix.** The equivalence holds in _this_ theme: the token reaches its value through
a CSS variable, so a `:root` override or a different root font size makes the two diverge. Rewriting
that automatically is the bug #78 fixed. The rule reports, offers the replacement as an editor
suggestion, and says so in the message.

### What counts as "equal"

Two families, both derived from your design system — there is no name table in this rule:

- **The spacing scale.** `--spacing` is read from your theme, and the utility prefixes that use it
  are found by asking what `<prefix>-1` compiles to. `p-[10px]` ÷ `0.25rem` = 2.5 steps → `p-2.5`.
- **Named theme tokens, by value.** For every class that emits exactly one declaration whose whole
  value is one `var(--x)`, the theme says what `--x` is worth: `0.5rem` → `rounded-lg`. Two
  restrictions come out of that shape and matter:
  - a class that declares MORE than the literal is not an equivalent, so `text-[14px]` → `text-sm`
    is **not** reported (`text-sm` also sets `line-height`);
  - a colour token can never match a value a human typed, so the ~7 000 colour classes are simply
    not candidates.

### Why there is a granularity at all

Tailwind v4 compiles _any_ number: `w-8.425` is a valid class. So every length is N spacing units
for some N, and reporting all of them would make this rule fire on practically every arbitrary value
— which is what `no-arbitrary-value` is for.

The cut is not a number picked here. Every step Tailwind's own scale enumerates (`0`, `0.5`, `1`,
`1.5`, `2`, `2.5`, `3`, `3.5`, `4`, `5`…`96`) is a multiple of `0.5`, and the precompute derives
that from the enumerated steps themselves. `w-[140px]` → `w-35` is reported (35 is a whole number of
steps); `w-[33.7px]` → `w-8.425` is not. Use `step` to go finer.

## Options

### `entryPoint`

`string`, optional. A CSS entry point for this rule alone, overriding
`settings.tailwindcss.entryPoint`. This rule is DS-dependent — every equivalence comes from the
design system, so there is no static fallback and a missing entry point is a fatal
`designSystemUnavailable` diagnostic.

### `step`

`number`, optional. Defaults to the granularity derived from your theme's enumerated scale (`0.5`
with Tailwind's default `--spacing`). Lower it to report finer values:

```jsonc
// also report w-[33px] → w-8.25
{ "tailwindcss/prefer-scale-token": ["warn", { "step": 0.25 }] }
```

Raising it makes the rule quieter (`step: 1` stops reporting `p-[10px]` → `p-2.5`). It has no effect
on named theme tokens: those match by value, not by granularity.

### `allow`

`string[]`, default `[]`. Utility prefixes to skip, matched with `startsWith` against the bare
utility — the same shape as `no-arbitrary-value`'s option.

```jsonc
{ "tailwindcss/prefer-scale-token": ["warn", { "allow": ["grid-cols-", "bg-[url("] }] }
```

## Examples

### ✗ Incorrect

```tsx
// Values that are whole steps of the spacing scale
<div className="p-[10px] gap-[4px] mt-[6px]" />
//              ~~~~~~~~ ~~~~~~~~~ ~~~~~~~~  → p-2.5 gap-1 mt-1.5

// Off the enumerated scale but still a whole step — Tailwind compiles w-35
<div className="w-[140px]" />
//              ~~~~~~~~~  → w-35

// A named theme token, matched by its value
<div className="rounded-[0.5rem] basis-[28rem]" />
//              ~~~~~~~~~~~~~~~~ ~~~~~~~~~~~~~  → rounded-lg basis-md

// Variants and `!` travel with the class
<div className="hover:p-[10px] p-[10px]!" />
```

### ✓ Correct

```tsx
// The token itself
<div className="p-2.5 rounded-lg w-35" />

// Finer than the granularity Tailwind's own scale uses
<div className="w-[33px] w-[33.7px]" />

// Byte-identical to a named class — no-unnecessary-arbitrary-value's business
<div className="w-[100%] z-[10] p-[0px]" />

// text-sm also sets line-height, so it is not what text-[14px] says
<div className="text-[14px]" />

// A variable reference has no literal to compare — prefer-theme-tokens looks at these
<div className="p-(--gutter) p-[var(--gutter)]" />

// Not a length, or on a prefix that does not read the scale
<div className="w-[50%] grid-cols-[18rem_1fr] bg-[#ff0000]" />
```

## Interactions with other rules

- **`enforce-canonical`**: this rule is the report-only half of what that one gave up in #78. They
  cannot both fire on the same class: anything `enforce-canonical` rewrites is byte-identical, and
  this rule's `getNamedEquivalent` guard skips exactly those.
- **`no-unnecessary-arbitrary-value`**: owns the byte-identical cases (`w-[100%]` → `w-full`). Same
  guard, same reason.
- **`prefer-theme-tokens`**: owns the cases where the user wrote a variable reference
  (`bg-(--primary)`), matched by NAME. This rule only looks at literals.
- **`no-arbitrary-value`**: a superset in spirit — it bans arbitrary values outright. If you run
  that, this rule adds the specific "and there is a token for this exact value" message.

The four-way boundary is locked down in `tests/integration/prefer-theme-tokens-coexistence.test.ts`.

## When to disable it

- **You deliberately use pixel values** for a subsystem where the scale is the wrong unit (a chart,
  a canvas overlay, an embedded third-party widget). Prefer `allow` with those prefixes.
- **You don't want the nudge at all.** This rule is off unless you enable it: the equivalence is
  real but acting on it is a convention, not a correctness fix.
