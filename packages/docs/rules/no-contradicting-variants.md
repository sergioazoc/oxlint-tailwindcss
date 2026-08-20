# no-contradicting-variants

> Disallow variant-prefixed classes that are redundant because the base class already applies
> unconditionally

## What this rule does

Flags variant-prefixed classes that are redundant because the same utility is already applied
unconditionally on the same element. The canonical case is `flex hover:flex`: `flex` always applies,
so the `hover:` variant adds nothing — under hover it's already there, and outside hover the base
still wins. The variant is pure noise (and a strong hint that someone meant to write a different
utility, like `hover:inline-flex`).

The rule does NOT report when the variant targets a different element than the base. Pseudo-elements
(`after`, `before`, `placeholder`, `marker`, `backdrop`, `selection`, `first-line`, `first-letter`,
`file`), child selectors (`*:`, `**:`), and arbitrary selectors (`[&>svg]`, `[&_div]`) all change
the selector target, so `absolute after:absolute` or `shrink-0 [&>svg]:shrink-0` is fine — the base
applies to the element while the variant applies to a descendant or pseudo-element.

With `settings.tailwindcss.entryPoint` configured, that judgement comes from the selector the design
system actually generates for each variant, so it covers variants the project defines itself:
`@custom-variant thumb (&::-webkit-slider-thumb)` makes `size-4 thumb:size-4` valid, which no list
of variant names could know. Without an entry point the rule falls back to the names above and
behaves exactly as before — it never reports a missing design system.

The match is by exact utility identity, so `bg-white hover:bg-blue-500` is left alone (different
values), as is `flex hover:items-center` (different utilities).

## Options

| Option       | Type     | Default | Description                                             |
| ------------ | -------- | ------- | ------------------------------------------------------- |
| `entryPoint` | `string` | —       | Per-rule override of `settings.tailwindcss.entryPoint`. |

The entry point is optional: with one configured the rule classifies variants from the selectors the
design system generates, and without one it falls back to the built-in list. It never reports a
missing design system.

## Examples

### ✗ Incorrect

```tsx
// `flex` already applies — `dark:flex` is dead weight
<div className="flex dark:flex" />

// Same pattern with `hover`
<div className="hidden hover:hidden" />

// Multiple redundant variants on the same base
<div className="flex hover:flex dark:flex" />
```

### ✓ Correct

```tsx
// Different values under different variants
<div className="bg-white hover:bg-blue-500" />

// Different utilities — no redundancy
<div className="text-white dark:text-black" />

// Only variant classes, no base — nothing is redundant
<div className="hover:flex dark:flex" />

// Pseudo-element targets a different element from the base
<div className="absolute after:absolute" />
<div className="shrink-0 [&>svg]:shrink-0" />
<div className="flex *:data-[slot=select-value]:flex" />
```

## Interactions with other rules

- **`no-duplicate-classes`**: complementary. Duplicates are the same string twice
  (`hover:flex hover:flex`); this rule catches the subtler case where the base unconditionally
  subsumes a variant.
- **`no-conflicting-classes`**: a base utility shadowing a variant isn't a CSS-property conflict
  (both compute to the same property value), so `no-conflicting-classes` won't flag it. That's the
  gap this rule fills.
- **`no-dark-without-light`**: opposite shape. This rule flags `base + variant:same-utility`; that
  one flags `dark:foo` with no light counterpart at all.

## Composition and merge helpers (`cn` / `twMerge` / `cva`)

"`hover:flex` is redundant because `flex` already applies" only holds when the string being checked
is the element's **final, self-contained class list**. In a `tailwind-merge` composition — the
`cn`/`twMerge` + `cva` pattern shadcn-style codebases use — a `className` is frequently an
**override fragment** that gets merged at runtime with classes contributed elsewhere, often in
another module. There the variant is usually **load-bearing**: it exists to beat a same-group class
the component merges in from its own `cva`.

Take `<Button className="bg-transparent hover:bg-transparent" />`, where `Button` does
`twMerge(buttonVariants(), className)` and `buttonVariants()` contributes `hover:bg-accent`.
`bg-transparent` (no modifier) and `hover:bg-accent` (a `hover` modifier) sit in different
`tailwind-merge` conflict groups, so the unconditional `bg-transparent` does **not** evict
`hover:bg-accent` — only `hover:bg-transparent` does. Removing the "redundant"
`hover:bg-transparent` therefore restores the accent hover. The class looks redundant in isolation
but is required in context (issue #117).

Because the base the variant defeats lives in another argument or module, redundancy is not
decidable from the fragment alone without emulating `tailwind-merge`. So the rule only evaluates a
string it can be sure is the final list: a literal (or template) used directly as
`class`/`className` on a **native host element** (`<div>`, `<button>`, …). It does **not** report
strings that are:

- arguments to a merge-aware call — `cn(...)`, `twMerge(...)`, `cva(...)`, `tv(...)`, etc.;
- the `className`/`class` of a **custom component** (`<Button …>`, `<Field.Root …>`), which is
  opaque — the component may re-merge it internally;
- assigned to a variable, or emitted from a tagged template.

The trade-off is deliberate: it accepts a few false negatives (a genuinely redundant pair hidden in
one of those positions is not caught) to eliminate the false positives, which read as obviously
correct and invite a rendering regression.

## When to disable it

- **Code generators / class-name builders** on a native element that intentionally emit both a base
  and a same-utility variant. (Override fragments passed through `cn`/`twMerge` or a custom
  component are already skipped — see the section above.)
- **Snapshot tests / fixtures** that need the redundant pair to exercise downstream tooling.
