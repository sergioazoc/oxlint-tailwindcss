# enforce-consistent-important-position

> Enforce consistent position of the important (!) modifier. Default: suffix (Tailwind v4 canonical form). Note: using "prefix" may conflict with enforce-canonical which normalizes to suffix.

## What this rule does

Tailwind v4 supports two syntaxes for the `!important` modifier:
prefix (`!flex`, the v3-era form) and suffix (`flex!`, the v4
canonical form). Both produce the same CSS, but mixing them inside
one project makes the codebase look inconsistent and breaks
copy-paste between files. This rule picks one position and rewrites
every offender to match. Autofix on the first hit per location,
editor suggestion on subsequent hits.

DS-independent — works without `settings.tailwindcss.entryPoint`.
It's a pure string transform, so it runs everywhere, including in
projects that haven't wired up the design system yet.

## Options

### `position`

`'prefix' | 'suffix'`, default `'suffix'`.

`'suffix'` is the Tailwind v4 canonical form (`flex!`,
`hover:text-red!`) and matches what `enforce-canonical` would
produce, so it's the recommended choice for new projects. `'prefix'`
keeps the v3 form (`!flex`, `hover:!text-red`) — pick it only if your
codebase is still on the v3 spelling and you don't want to migrate
yet.

```jsonc
{ "tailwindcss/enforce-consistent-important-position": ["error", { "position": "suffix" }] }
```

Note: setting `position: 'prefix'` will conflict with
`enforce-canonical`, which normalizes to suffix. Use one or the
other.

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

- **`enforce-canonical`**: with `position: 'suffix'` (the default) the
  two rules agree. With `position: 'prefix'` they fight — canonical
  rewrites suffix to its preferred form on every fix pass. Stick with
  suffix unless you have a strong reason.
- **`enforce-sort-order`**: order-independent of important position.
  Both prefix and suffix forms sort identically.
- **`no-unknown-classes`**: looks up the bare utility, stripping `!`
  on either side, so neither form trips it.

## When to disable it

- **The codebase deliberately mixes both forms** (e.g. legacy v3
  files alongside fresh v4 ones during a migration). Re-enable once
  the migration is done.
- **You're already running `enforce-canonical`** and trust it to
  normalize `!` position as part of canonicalization — leaving this
  rule on is harmless but redundant.

