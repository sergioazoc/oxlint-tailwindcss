## What this rule does

Catches the case where you wrote `dark:bg-gray-900` but forgot the
matching light-mode base (`bg-white`, `bg-zinc-50`, whatever). The
moment a theme switcher is active, that element renders unstyled in
light mode — usually as transparent or whatever the parent inherits,
almost never what you wanted.

The check is by utility prefix, not by exact value. The rule groups
classes by their leading property family (`bg`, `text`, `border-t`,
`from`, `rounded-tl`, etc.), then asks: for every class that uses a
watched variant, is there at least one class with the same prefix
that does NOT use a watched variant? If not, the variant class has
no light-mode counterpart and gets reported.

The set of "watched variants" is configurable. By default it's just
`dark`, but the same shape applies to any other scheme-style variant
(`contrast-more`, `motion-reduce`, `print`, custom data-attribute
variants you've registered, etc.) — see `variants` below.

## Options

### `variants`

`string[]`, default `["dark"]`.

The list of variants that require a non-variant base on the same
utility prefix. Override this when your app uses a different
mechanism for theme switching (e.g. `contrast-more:` for a high-
contrast theme, or a custom `theme-foo:` variant defined in your
CSS).

```jsonc
{ "tailwindcss/no-dark-without-light": ["error", { "variants": ["dark", "contrast-more"] }] }
```

If you set `variants` to an empty array the rule effectively becomes
a no-op — prefer disabling the rule outright in that case.

## Examples

### ✗ Incorrect

```tsx
// No light-mode background — element is bare when the dark class doesn't apply
<div className="dark:bg-gray-900" />

// `bg-*` has a base, but `text-*` doesn't
<div className="bg-white dark:bg-gray-900 dark:text-white" />

// Inside a class-name helper — same problem, just less visible
cn("dark:bg-gray-900")
```

### ✓ Correct

```tsx
// Both modes covered
<div className="bg-white text-black dark:bg-gray-900 dark:text-white" />

// No watched variant → rule doesn't care about base coverage
<div className="hover:bg-blue-500" />

// Custom variant + matching base
<div
  className="bg-white contrast-more:bg-black"
  // with options: [{ variants: ["contrast-more"] }]
/>
```

## Interactions with other rules

- **`no-contradicting-variants`**: opposite shape. This rule flags
  `dark:foo` without a base; that one flags `foo dark:foo` where the
  base makes the variant redundant. They never disagree on the same
  pair of classes.
- **`no-conflicting-classes`**: orthogonal. Conflicting classes
  collide on a property; missing-base is the absence of a property
  for a given mode. A dark-only element won't trip
  `no-conflicting-classes` because it doesn't conflict — it just
  doesn't render the way you wanted.
- **`enforce-sort-order`**: doesn't affect detection (the rule
  doesn't care about order), but sorting tends to put the base and
  the dark variant adjacent, which makes the missing one obvious in
  review.

## When to disable it

- **Apps with a single color scheme** that nevertheless ship a few
  `dark:` classes for one-off overrides on top of a known-correct
  base in a parent component. Prefer narrowing `variants` (e.g.
  drop `dark`) before disabling.
- **Design systems / primitives** where the consumer is expected to
  supply the base via `className`. Disable per-file and document the
  contract; otherwise every primitive will trip the rule.
- **Server-driven class strings** where the base lives in CSS and
  only the dark override is emitted from JS. Treat as the same
  pattern above.
