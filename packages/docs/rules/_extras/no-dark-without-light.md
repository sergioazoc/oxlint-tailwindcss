## What this rule does

Catches the case where you wrote `dark:bg-gray-900` but forgot the matching light-mode base
(`bg-white`, `bg-zinc-50`, whatever). The moment a theme switcher is active, that element renders
unstyled in light mode — usually as transparent or whatever the parent inherits, almost never what
you wanted.

The check is by group, not by exact value: for every class that uses a watched variant, is there at
least one class in the same group that does NOT use one? If not, the variant class has no light-mode
counterpart and gets reported.

A class counts as the base in either of two ways:

- **Same utility prefix** — `bg-white` is the base for `dark:bg-black`, `text-gray-900` for
  `dark:text-white`. This is the leading property family (`bg`, `text`, `border-t`, `from`,
  `rounded-tl`, …).
- **Same declared CSS property**, when `settings.tailwindcss.entryPoint` (or the rule's own
  `entryPoint`) is configured. `underline` and `no-underline` share no prefix at all, yet both write
  `text-decoration-line` — so `underline dark:no-underline` is a complete pair, not a missing base.
  The same goes for `italic dark:not-italic`, `visible dark:invisible`,
  `uppercase dark:normal-case`, `truncate dark:text-clip` and `sr-only dark:not-sr-only`, all of
  which used to be reported.

The property check is **additive**: anything that matched by prefix still matches, so configuring an
entry point can only make this rule report less, never more. Without one it falls back to the prefix
check plus a small built-in table for `display` and `position` (so `block dark:hidden` works), which
is why the pairs listed above still report when no CSS is configured.

The set of "watched variants" is configurable. By default it's just `dark`, but the same shape
applies to any other scheme-style variant (`contrast-more`, `motion-reduce`, `print`, custom
data-attribute variants you've registered, etc.) — see `variants` below.

## Options

### `variants`

`string[]`, default `["dark"]`.

The list of variants that require a non-variant base on the same utility prefix. Override this when
your app uses a different mechanism for theme switching (e.g. `contrast-more:` for a high- contrast
theme, or a custom `theme-foo:` variant defined in your CSS).

```jsonc
{ "tailwindcss/no-dark-without-light": ["error", { "variants": ["dark", "contrast-more"] }] }
```

If you set `variants` to an empty array the rule effectively becomes a no-op — prefer disabling the
rule outright in that case.

### `entryPoint`

`string`, optional. A CSS entry point for this rule alone, overriding
`settings.tailwindcss.entryPoint`. Enables the declared-property grouping described above; the rule
works without it.

## Examples

### ✗ Incorrect

```tsx
// No light-mode background — element is bare when the dark class doesn't apply
<div className="dark:bg-gray-900" />

// `bg-*` has a base, but `text-*` doesn't
<div className="bg-white dark:bg-gray-900 dark:text-white" />
```

### ✓ Correct

```tsx
// Both modes covered
<div className="bg-white text-black dark:bg-gray-900 dark:text-white" />

// Same property under a different name — needs an entryPoint to be recognized
<div className="underline dark:no-underline" />
<div className="italic dark:not-italic" />
<div className="visible dark:invisible" />

// Show in light, hide in dark: both write `display`
<div className="block dark:hidden" />

// No watched variant → rule doesn't care about base coverage
<div className="hover:bg-blue-500" />

// Custom variant + matching base
<div
  className="bg-white contrast-more:bg-black"
  // with options: [{ variants: ["contrast-more"] }]
/>

// A dark-only string inside a merge helper or on a custom component is an
// override fragment — the light base lives elsewhere, so it is NOT reported.
// See "Composition and merge helpers" below.
cn("dark:bg-gray-900")
;<Field className="dark:bg-transparent" />
```

## Interactions with other rules

- **`no-contradicting-variants`**: opposite shape. This rule flags `dark:foo` without a base; that
  one flags `foo dark:foo` where the base makes the variant redundant. They never disagree on the
  same pair of classes.
- **`no-conflicting-classes`**: orthogonal. Conflicting classes collide on a property; missing-base
  is the absence of a property for a given mode. A dark-only element won't trip
  `no-conflicting-classes` because it doesn't conflict — it just doesn't render the way you wanted.
- **`enforce-sort-order`**: doesn't affect detection (the rule doesn't care about order), but
  sorting tends to put the base and the dark variant adjacent, which makes the missing one obvious
  in review.

## Composition and merge helpers (`cn` / `twMerge` / `cva`)

"There is no base for this `dark:` class" only holds when the string being checked is the element's
**final, self-contained class list**. In a `tailwind-merge` composition — the `cn`/`twMerge` + `cva`
pattern shadcn-style codebases use — a `className` is frequently an **override fragment** that gets
merged at runtime with classes contributed elsewhere, often in another module. A dark-only override
like `<Field className="dark:bg-transparent" />` is not missing anything: the light base
(`bg-white`) lives in the component's own `cva`, and `tailwind-merge` keeps both because they sit in
different modifier scopes. Reporting it — and "fixing" it by adding a light base to the override —
silently changes light-mode rendering (issue #117).

Because that base lives in another argument or module, redundancy is not decidable from the fragment
alone without emulating `tailwind-merge`. So the rule only evaluates a string it can be sure is the
final list: a literal (or template) used directly as `class`/`className` on a **native host
element** (`<div>`, `<input>`, …). It does **not** report strings that are:

- arguments to a merge-aware call — `cn(...)`, `twMerge(...)`, `cva(...)`, `tv(...)`, etc.;
- the `className`/`class` of a **custom component** (`<Field …>`, `<Card.Body …>`), which is opaque
  — the component may re-merge it internally;
- assigned to a variable, or emitted from a tagged template.

The trade-off is deliberate: it accepts a few false negatives (a genuinely dark-only class hidden in
one of those positions is not caught) to eliminate the false positives, which read as obviously
correct and invite a rendering regression.

## When to disable it

- **Apps with a single color scheme** that nevertheless ship a few `dark:` classes for one-off
  overrides on top of a known-correct base in a parent component. Prefer narrowing `variants` (e.g.
  drop `dark`) before disabling.
- **Server-driven class strings** on a native element where the base lives in CSS and only the dark
  override is emitted from JS. (Override fragments passed through `cn`/`twMerge` or a custom
  component are already skipped — see the section above.)
