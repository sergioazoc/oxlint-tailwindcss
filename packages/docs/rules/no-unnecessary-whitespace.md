# no-unnecessary-whitespace

> Disallow unnecessary whitespace in Tailwind CSS class strings

## What this rule does

Normalizes whitespace inside Tailwind class strings: runs of spaces
or tabs collapse to one space, leading and trailing whitespace gets
trimmed (with one carve-out at template-expression boundaries — see
below), and the rule autofixes everything in a single pass.

DS-independent — works without `settings.tailwindcss.entryPoint`.
Pure whitespace transform.

The rule is **multiline-aware**: it deliberately preserves `\n` +
the indentation that follows each newline. That's the format
`enforce-consistent-line-wrapping` produces with `classesPerLine`,
and collapsing it back would set up an unfixable cycle between the
two rules (issue #14). Inside one line, tabs and double spaces still
collapse normally.

Template literals get one extra rule: a single trailing space before
an expression (`` `flex ${x}` ``) or a single leading space after
one (`` `${x} flex` ``) is preserved — those are intentional spaces
that prevent classes from being smashed together at runtime.

## Options

This rule has no options. The behavior is "collapse runs to single
spaces, preserve intentional newlines and template-boundary spaces" —
there's no useful axis to configure.

## Examples

### ✗ Incorrect

```tsx
// Leading + trailing + internal double spaces
<div className="  flex   items-center  " />
//              ~~~~~~~~~~~~~~~~~~~~~~~~  → "flex items-center"

// Internal double space
<div className="flex  items-center" />
//              ~~~~~~~~~~~~~~~~~~  → "flex items-center"

// Tab as separator inside a single line
const className = `flex\titems-center`
//                 ~~~~~~~~~~~~~~~~~  → "flex items-center"
```

### ✓ Correct

```tsx
// Single spaces
<div className="flex items-center" />

// Template literal: boundary spaces preserved
<div className={`flex ${x}`} />
<div className={`${x} flex`} />

// Multiline (e.g. from enforce-consistent-line-wrapping): preserved
const className = `bg-red-500 text-white
                   hover:bg-red-600 focus:ring-2`
```

## Interactions with other rules

- **`enforce-consistent-line-wrapping`**: designed to coexist. This
  rule preserves the `\n` + indent that wrapping inserts; without
  that, the two would fight on every autofix pass.
- **`enforce-sort-order`** and every other class-rewriting rule:
  those rebuild the string via `rebuildClassString`, which always
  emits canonical single-space separators — running them first makes
  `no-unnecessary-whitespace` a no-op.
- **All extractor-driven rules**: the cleaned-up string is what every
  other rule sees on the next pass, so running this rule early in a
  fix cycle keeps downstream errors readable.

## When to disable it

- **You rely on a formatter** like `prettier` or `oxfmt` to handle
  whitespace globally. They cover the same ground, and disabling the
  lint rule removes redundant work.
- **Class strings that intentionally use unusual whitespace** (very
  rare — almost always a bug in extractor configuration rather than
  intent).

