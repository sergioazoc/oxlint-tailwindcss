## What this rule does

Reports the same class string appearing more than once in the same
class list, then autofixes by removing the second (and any further)
occurrences. `flex flex` is always dead weight — there's no
disagreement about which one wins, no shadowing, no override; the
second one is purely a typing accident.

The comparison is by exact token, so `hover:flex hover:flex` is a
duplicate but `flex hover:flex` is NOT — the latter is a different
class even though it shares a utility (and is the territory of
`no-contradicting-variants`). The fix preserves the surrounding
whitespace introduced by `enforce-consistent-line-wrapping`, so a
multiline class string keeps its indentation.

The rule walks the same extraction surface as every other rule:
`className` / `class` attributes, all 14 default callees (`cn`,
`clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`, `ctl`, `twJoin`,
`cc`, `clb`, `cnb`, `objstr`, `classed`), tagged templates like
`` tw`...` ``, JSX object values (`classNames={ { root: "..." } }`),
and variables matching the default name patterns (`className`,
`classNames`, `classes`, `style`, `styles`). Deep extraction for
`cva` / `tv` / `classed` covers `base`, `slots`, `variants`,
`compoundVariants`, and `compoundSlots`.

## Options

(no options — extractor surface comes from `settings.tailwindcss`)

## Examples

### ✗ Incorrect

```tsx
// Trivial duplicate
<div className="flex flex items-center" />

// Duplicate with variant — same token, twice
<div className="hover:flex hover:flex items-center" />

// Triple duplicate — two diagnostics, fix collapses to one
<div className="flex flex flex" />

// Inside helpers
cn("flex flex items-center")
cva("flex flex", {})
tv({ slots: { header: "p-2 p-2" } })

// Template literal — surrounding whitespace is preserved
<div className={`flex flex items-center ${x}`} />
```

### ✓ Correct

```tsx
// Same utility, different variants — NOT a duplicate
<div className="flex hover:flex dark:flex" />

// Different values
<div className="p-4 m-2 text-red-500" />

// Inside helpers
cn("flex", "items-center")
tv({ slots: { header: "p-2", body: "p-4" } })
```

## Interactions with other rules

- **`no-contradicting-variants`**: `flex flex` is this rule;
  `flex hover:flex` is `no-contradicting-variants`. Keep both on —
  they cover disjoint shapes.
- **`no-conflicting-classes`**: a duplicate is a degenerate
  conflict (same class hits the same property, trivially). The
  duplicate path here is faster and produces a clearer message, so
  this rule reports first; `no-conflicting-classes` adds nothing
  on top.
- **`enforce-sort-order`**: sorting after dedup is the natural
  pipeline. Both rules autofix, so they can run in the same lint
  pass.
- **`enforce-consistent-line-wrapping`**: the autofix preserves the
  newlines + indentation that the wrapping rule introduced, so the
  two rules compose cleanly on multiline class strings.

## When to disable it

- **Never, basically.** A literal duplicate is always wrong and the
  fix is mechanical. If the rule is flagging something that isn't a
  real duplicate, the bug is in extractor configuration — tighten
  `settings.tailwindcss` (e.g. `exclude.attributes`,
  `exclude.callees`, `exclude.variablePatterns`) so the lookalike
  string isn't treated as a class list.
- **Generated code** in tests or fixtures that intentionally builds
  a duplicate to exercise downstream tooling — disable per file.
