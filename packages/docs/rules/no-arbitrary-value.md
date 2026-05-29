# no-arbitrary-value

> Disallow arbitrary values in Tailwind CSS classes

## What this rule does

Flags any Tailwind utility that uses an arbitrary value — the `[...]` escape hatch — so your team is
forced to either reach for a design token or extend the theme instead of one-off literals. Anything
the parser recognizes as an arbitrary value qualifies: dimensions (`w-[200px]`, `text-[14px]`),
colors (`bg-[#ff0000]`), arbitrary calc expressions (`p-[calc(1rem+2px)]`), gradients, and the same
inside variants (`hover:w-[200px]`) or with the `!` modifier (`!w-[200px]`, `w-[200px]!`).

DS-independent — no design system is loaded, no `entryPoint` is needed. The rule is a pure syntactic
check, which makes it cheap to run on large repos. There is no autofix: replacing an arbitrary value
with a token requires human judgement, so the rule only reports.

Arbitrary _variants_ (`[&>svg]:w-4`) are not arbitrary _values_ and are left alone. The rule looks
at the value side of the utility, not the selector prefix.

## Options

### `allow`

`string[]`, default `[]`.

A list of utility prefixes where arbitrary values are tolerated. The match is a literal
`String.prototype.startsWith` against the utility's bare form (after stripping `!` and any
variants), so entries like `"grid-cols-"` permit `grid-cols-[18rem_1fr]` without unlocking
`grid-rows-[...]`. Common candidates: container queries (`@container`), grid templates
(`grid-cols-`, `grid-rows-`), and truly bespoke transforms (`bg-[url(`).

```jsonc
{
  "tailwindcss/no-arbitrary-value": ["error", {
    "allow": ["grid-cols-", "grid-rows-", "bg-[url("]
  }]
}
```

Tip: start with `[]` to see where your codebase actually needs escapes, then promote the legitimate
ones into `allow` rather than disabling the rule wholesale.

## Examples

### ✗ Incorrect

```tsx
// One-off dimension instead of a spacing token
<div className="w-[200px] p-[10px]" />

// Hex literal instead of a theme color
<div className="bg-[#ff0000] text-white" />

// Variant doesn't change the verdict
<div className="hover:w-[200px]" />

// `!` modifier doesn't either
<div className="!w-[200px]" />
```

### ✓ Correct

```tsx
// Use spacing tokens
<div className="w-64 p-2.5" />

// Use a theme color you declared in @theme
<div className="bg-brand text-white" />

// Arbitrary variants are fine — they target selectors, not values
<div className="[&>svg]:w-4" />

// Allowed via `allow: ["grid-cols-"]`
<div className="grid grid-cols-[18rem_1fr]" />
```

## Interactions with other rules

- **`no-hardcoded-colors`**: a strict subset focused on color utilities (`bg-[#ff0]`,
  `text-[rgb(...)]`). Enable that one if you want the granular color-only message; enable both for
  layered enforcement. They'll both fire on the same class, which is usually desired during
  migration.
- **`no-unnecessary-arbitrary-value`**: this rule prohibits arbitrary values outright;
  `no-unnecessary-arbitrary-value` is gentler — it only flags arbitraries that have an exact named
  equivalent (`w-[100%]` → `w-full`). Both can coexist: the gentler rule autofixes the trivial cases
  and this rule catches what's left.
- **`prefer-theme-tokens`**: similar intent, but DS-dependent. `prefer-theme-tokens` actually
  consults your `@theme` and suggests the matching token. Pair them: this rule is your stop-gap when
  no token exists yet.

## When to disable it

- **Prototyping / spike branches** where speed beats discipline. Re-enable before merging.
- **Files that genuinely need an arbitrary value** (one-off marketing pages, dynamic CSS-in-JS
  shims). Prefer `allow` with a tight prefix list, or disable per-line via
  `// oxlint-disable-next-line tailwindcss/no-arbitrary-value`.
- **Libraries that ship Tailwind utilities consumers re-skin**: the arbitrary form is sometimes the
  cleanest contract. Document the decision and disable the rule in that package.
