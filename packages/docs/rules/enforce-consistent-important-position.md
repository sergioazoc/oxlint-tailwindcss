---
title: "enforce-consistent-important-position — Tailwind CSS lint rule"
description: "oxlint rule that puts the Tailwind CSS important modifier in one position — suffix flex! (the v4 form) or prefix !flex — and fixes the rest."
---

# enforce-consistent-important-position

oxlint rule that puts the Tailwind CSS important modifier in one position — suffix `flex!` (the v4
form) or prefix `!flex` — and fixes the rest.

## At a glance

| Autofix | Editor suggestions | Design system | Options    |
| ------- | ------------------ | ------------- | ---------- |
| Yes     | Yes                | Not used      | `position` |

## What this rule does

Tailwind v4 supports two syntaxes for the `!important` modifier: prefix (`!flex`, the v3-era form)
and suffix (`flex!`, the v4 canonical form). Both produce the same CSS, but mixing them inside one
project makes the codebase look inconsistent and breaks copy-paste between files. This rule picks
one position and rewrites every offender to match. Autofix on the first hit per location, editor
suggestion on subsequent hits.

DS-independent — works without `settings.tailwindcss.entryPoint`. It's a pure string transform, so
it runs everywhere, including in projects that haven't wired up the design system yet.

## Options

### `position`

`'prefix' | 'suffix'`, default `'suffix'`.

`'suffix'` is the Tailwind v4 canonical form (`flex!`, `hover:text-red!`), so it's the recommended
choice for new projects. `'prefix'` keeps the v3 form (`!flex`, `hover:!text-red`) — pick it only if
your codebase is still on the v3 spelling and you don't want to migrate yet.

```jsonc
{ "tailwindcss/enforce-consistent-important-position": ["error", { "position": "suffix" }] }
```

Note: `enforce-canonical` preserves whichever `!` position you write (it does not normalize it), so
either `position` value composes with it cleanly. This rule is the single source of truth for `!`
placement.

## Examples

### ✗ Incorrect

```tsx
// Default suffix: prefix is reported
<div className="!font-bold" />
//              ~~~~~~~~~~  → font-bold!

// Same with a variant chain
<div className="hover:!text-red" />
//              ~~~~~~~~~~~~~~~  → hover:text-red!

// Multiple offenders in one string
<div className="!font-bold !text-red" />
//              ~~~~~~~~~~ ~~~~~~~~~  → font-bold! text-red!
```

### ✓ Correct

```tsx
// Default (suffix)
<div className="font-bold!" />
<div className="hover:text-red!" />
<div className="font-bold! text-red!" />

// No important — rule doesn't touch normal classes
<div className="flex items-center" />
```

## Interactions with other rules

- **`enforce-canonical`**: preserves the `!` position you write (prefix, suffix, or none) rather
  than normalizing it, so it never fights this rule no matter which `position` you pick. This rule
  is the single source of truth for `!` placement.
- **`enforce-sort-order`**: order-independent of important position. Both prefix and suffix forms
  sort identically.
- **`no-unknown-classes`**: looks up the bare utility, stripping `!` on either side, so neither form
  trips it.

## When to disable it

- **The codebase deliberately mixes both forms** (e.g. legacy v3 files alongside fresh v4 ones
  during a migration). Re-enable once the migration is done.
- **You don't care about `!` position consistency.** No other rule enforces it — `enforce-canonical`
  preserves whatever position you wrote — so disabling this one means `!` placement goes unchecked.
