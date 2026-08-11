## What this rule does

Flags long class strings so they don't sprawl past a sensible line length and, optionally, splits
them into multiple lines when they contain more classes than your team agrees a single line should
carry. Two independent triggers: a character-based print width (warn only) and a class-count budget
per line (autofix on template literals).

DS-independent — works without `settings.tailwindcss.entryPoint`. The rule operates on the raw class
string and doesn't care what the classes mean.

The autofix wraps template literals into the **block convention**: the content starts on its own
line, each wrapped line is indented one level below the statement's own indentation, and the closing
backtick sits on its own line. The base indentation is read from the source line (not the backtick
column), so the block nests correctly even inside deeply-indented JSX. The fix is
**non-destructive** — a template that is already wrapped only has its over-budget lines re-wrapped;
conforming lines are left untouched. Other rules (`no-unnecessary-whitespace`, `enforce-sort-order`,
…) are aware of this multiline shape and won't collapse it back.

## Options

### `printWidth`

`number`, default `80`.

Maximum length of any **single line** of the class string. For a one-line string that is its whole
length; for a multiline template it is the longest individual line, so splitting a long string
across lines can actually satisfy the rule. When exceeded, the rule reports `tooLong` but does
**not** autofix — splitting a long string into a multiline literal is a judgment call (extract a
component vs. just wrap it), so the rule surfaces the warning and lets you decide.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "printWidth": 100 }] }
```

### `classesPerLine`

`number`, optional. No default.

Maximum number of classes on a single line. When exceeded inside a template literal (`` `…` ``), the
rule autofixes by wrapping the classes into the block convention, chunks of `classesPerLine` per
line. Inside string literals (`"…"`) the rule reports `tooManyPerLine` but doesn't autofix — string
literals can't safely span lines without manual intervention.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "classesPerLine": 5 }] }
```

## Examples

### ✗ Incorrect

```tsx
// Exceeds default printWidth of 80 characters
<div className="flex items-center justify-between p-4 m-2 bg-white text-black rounded shadow-lg border w-full" />
//              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ tooLong

// 6 classes with classesPerLine: 3 — template literal autofixes into a block
const className = `flex items-center justify-between p-4 m-2 bg-white`
// → const className = `
//     flex items-center justify-between
//     p-4 m-2 bg-white
//   `

// Same count, string literal — reports but no autofix
<div className="flex items-center justify-between p-4 m-2 bg-white" />
```

### ✓ Correct

```tsx
// Fits within printWidth
<div className="flex items-center p-4" />

// Already wrapped at classesPerLine (block convention)
const className = `
  flex items-center p-4
  bg-white text-black
`
```

## Interactions with other rules

- **`no-unnecessary-whitespace`**: deliberately preserves the `\n` + indent introduced by this rule.
  The two were designed to coexist; without that preservation, fixers would oscillate (issue #14).
- **`enforce-sort-order`**: rebuilds class strings from a token list via `rebuildClassString`, which
  keeps the multiline separators. The sort fixer and the wrap fixer run on the same string without
  fighting.
- **All extractor-driven rules**: `splitClassesWithSeparators` is multiline-aware, so every other
  rule (`enforce-canonical`, `enforce-shorthand`, …) reports against multiline class strings the
  same way it does against single-line ones.

## When to disable it

- **You let `prettier` handle JSX line wrapping**: prettier breaks at the JSX-attribute level, not
  inside the string. The two are complementary, but if you don't want any in-string wrapping at all,
  disable.
- **Working with code generators** that emit very long class strings intentionally (e.g. CMS-driven
  content classes).
- **You use a different convention** like "always one class per line": this rule's chunk-based
  wrapping doesn't model that.
