# enforce-consistent-line-wrapping

> Warn when a class string exceeds the configured print width

## What this rule does

Flags long class strings so they don't sprawl past a sensible line length and, when you opt in,
wraps them into multiple lines. Two independent formatting modes: a width-based re-wrap (opt-in via
`wrapLines`) and a class-count budget per line (`classesPerLine`), both autofixing template literals
(string literals only report — they can't safely span lines).

DS-optional — works without `settings.tailwindcss.entryPoint`. The rule operates on the raw class
string and doesn't care what the classes mean, with one exception: when a design system **is**
available, the `wrapLines: "all"` grouping consults it for the Tailwind v4 project prefix
(`@import "tailwindcss" prefix(tw)`) so the prefix is transparent to grouping — `tw:flex` groups as
a base utility and `tw:hover:x` as `hover:`. Without an entry point the rule silently falls back to
treating the prefix as part of the variant chain (it never reports a missing design system).

Both fixers wrap template literals into the **block convention**: the content starts on its own
line, each wrapped line is indented one level below the statement's own indentation, and the closing
backtick sits on its own line. The base indentation is read from the source line (not the backtick
column), so the block nests correctly even inside deeply-indented JSX. The `classesPerLine` fix and
the `"overWidth"` width fix are **non-destructive** — a template that is already wrapped only has
its over-budget lines re-wrapped; conforming lines are left untouched. The `"all"` width fix is a
**full re-layout**: it lays the whole template out in the canonical variant-grouped form, replacing
any hand layout (which is why it's a separate, explicit mode). Other rules
(`no-unnecessary-whitespace`, `enforce-sort-order`, …) are aware of this multiline shape and won't
collapse it back.

## Options

### `printWidth`

`number`, default `80`.

Maximum length of any **single line** of the class string. For a one-line string that is its whole
length; for a multiline template it is the longest individual line, so splitting a long string
across lines can actually satisfy the rule. A line whose single class alone exceeds the width is not
reported — it can't be wrapped any shorter.

On its own, `printWidth` is **warn-only**: it reports `tooLong` and never rewrites your code. The
autofix is opt-in via `wrapLines`.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "printWidth": 100 }] }
```

### `wrapLines`

`"overWidth" | "all"`, optional. No default — like `classesPerLine`, leaving it unset means the
fixer is off and `printWidth` only reports.

Turns on the **width-based autofix** for template literals. The two modes differ in both reach and
layout:

- `"overWidth"`: only the **lines** that actually exceed `printWidth` are re-wrapped — each is
  greedily packed into the fewest lines that fit the budget (no variant grouping), reusing the
  line's own indentation. Everything else is left verbatim: templates whose lines all fit, and the
  conforming lines of a template that does get touched, keep their hand-formatted layout. A
  single-line template has no layout to preserve, so it converts to the block convention.
- `"all"`: **every** multiline (or over-width) template is normalized to a canonical layout,
  mirroring `eslint-plugin-better-tailwindcss`'s fixer: classes are grouped into runs sharing a
  variant chain (`hover:`, `md:hover:`, or none), and within a run classes are packed onto a line
  until adding the next would exceed `printWidth` (indentation included). How the runs are separated
  is controlled by `group` (below). Within-budget templates that don't match that layout report
  `inconsistentWrapping`.

In string literals the rule reports `tooLong` without a fix regardless of `wrapLines` — splitting a
string literal into a multiline template is a judgment call (extract a component vs. just wrap it),
so the rule surfaces the warning and lets you decide. A template fragment **glued** to a `${}` with
no whitespace (`` `${a}flex …` `` — one runtime class) is also never autofixed: any whitespace
introduced at the boundary would split that class in two.

`wrapLines` only applies when `classesPerLine` is **not** set — `classesPerLine` owns the layout
otherwise.

```jsonc
{
  "tailwindcss/enforce-consistent-line-wrapping": [
    "error",
    { "printWidth": 100, "wrapLines": "overWidth" },
  ],
}
```

### `group`

`"newLine" | "emptyLine" | "never"`, default `"newLine"`.

How the `wrapLines: "all"` layout separates variant groups. Matches
`eslint-plugin-better-tailwindcss`'s `group` option (same name, values, and default), so a migrated
config carries over unchanged.

- `"newLine"` (default): each variant run starts its own line.
- `"emptyLine"`: additionally, a **blank line** separates the runs (the blank lines carry no
  trailing whitespace, and `no-unnecessary-whitespace` preserves them).
- `"never"`: no grouping — classes are packed greedily across run boundaries into the fewest lines
  that fit `printWidth`.

`group` only shapes the `"all"` layout: `"overWidth"` deliberately never re-groups (it only splits
over-budget lines), and the `classesPerLine` fixer chunks by count, so both ignore it.

```jsonc
{
  "tailwindcss/enforce-consistent-line-wrapping": [
    "error",
    { "printWidth": 100, "wrapLines": "all", "group": "emptyLine" },
  ],
}
```

### `classesPerLine`

`number`, optional. No default.

Maximum number of classes on a single line. When exceeded inside a template literal (`` `…` ``), the
rule autofixes by wrapping the classes into the block convention, chunks of `classesPerLine` per
line. Inside string literals (`"…"`) the rule reports `tooManyPerLine` but doesn't autofix — string
literals can't safely span lines without manual intervention.

Setting `classesPerLine` switches the template-literal fixer to this chunk-based mode and turns the
width-based (variant-grouped) fixer off — `printWidth` then only reports, and `wrapLines` is
ignored.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "classesPerLine": 5 }] }
```

## Examples

### ✗ Incorrect

```tsx
// Exceeds default printWidth of 80 characters — reports; without `wrapLines` there is no autofix
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

// printWidth: 40 with wrapLines: "overWidth" — ONLY the over-budget
// line is re-wrapped; the conforming lines around it stay exactly as written
const cardClass = `
  flex hover:underline
  items-center justify-between gap-4 rounded-lg p-6
  focus:outline-none
`
// → const cardClass = `
//     flex hover:underline
//     items-center justify-between gap-4
//     rounded-lg p-6
//     focus:outline-none
//   `

// printWidth: 40 with wrapLines: "all" — full re-layout, grouped by variant
const buttonClass = `flex items-center gap-2 hover:bg-red-500 hover:underline focus:outline-none`
// → const buttonClass = `
//     flex items-center gap-2
//     hover:bg-red-500 hover:underline
//     focus:outline-none
//   `
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

// Hand-formatted multiline template, every line within printWidth — untouched
// when wrapLines is unset or "overWidth"; only "all" re-groups it
const cardClass = `
  flex hover:underline
  items-center
`
```

## Interactions with other rules

- **`no-unnecessary-whitespace`**: deliberately preserves the `\n` + indent introduced by this rule.
  The two were designed to coexist; without that preservation, fixers would oscillate (issue #14).
- **`enforce-sort-order`**: rebuilds class strings from a token list via `rebuildClassString`, which
  keeps the multiline separators. The sort fixer and the wrap fixer run on the same string without
  fighting. The width fixer never reorders classes — it only chooses where the line breaks go — so
  sorting stays entirely `enforce-sort-order`'s job.
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
