## What this rule does

Sorts every Tailwind class string in your code to match the official Tailwind class order — the same
order Tailwind uses when generating CSS, and the same one `prettier-plugin-tailwindcss` and `oxfmt`
apply. The rule autofixes: running `oxlint --fix` rewrites the string in place.

DS-dependent — requires `settings.tailwindcss.entryPoint`. The exact sort is computed by
`@tailwindcss/node`'s class-order API against your stylesheet, so theme tokens, plugins, and
`@layer` additions all participate. When the design system can't load, the rule emits a single fatal
`designSystemUnavailable` diagnostic per file instead of falling back to a heuristic.

Output is byte-compatible with `prettier-plugin-tailwindcss` and `oxfmt` as long as the three tools
point at the same `entryPoint` CSS. See the interop guide in the docs for the recommended
combination.

## Options

### `mode`

`'default' | 'strict'`, default `'default'`.

`'default'` delegates to the Tailwind class-order worker (one shot, official order). `'strict'`
groups classes by their variant chain first (`hover:`, `dark:hover:`, …), then sorts within each
group — useful if you want responsive/state prefixes to cluster visually rather than interleave by
utility. Most projects should keep the default; it's what every other Tailwind tooling does.

```jsonc
{ "tailwindcss/enforce-sort-order": ["error", { "mode": "strict" }] }
```

### `entryPoint`

`string`, optional.

Per-rule override of `settings.tailwindcss.entryPoint`. Useful in the rare case where this rule
needs to read a different stylesheet than the rest of the plugin (e.g. you scope the sort to a
sub-app). Almost nobody needs this — set the entry point once in `settings` and forget.

## Examples

### ✗ Incorrect

```tsx
// Out of order
<div className="text-red-500 flex" />
//                            ~~~~ → flex text-red-500

// Padding before flex
<div className="p-4 flex items-center" />
//              ~~~                    → flex items-center p-4

// Important modifiers keep their position
<div className="!text-red-500 !flex" />
//                            ~~~~~  → !flex !text-red-500
```

### ✓ Correct

```tsx
// Layout → spacing → typography → color
<div className="flex items-center p-4 text-red-500" />

// Variants cluster by Tailwind's variant priority
<div className="flex sm:hidden md:flex lg:hidden" />

// Strict mode: groups by variant first
<div className="flex p-4 hover:bg-red-500 hover:text-white" />
```

## Interactions with other rules

- **`enforce-canonical`**: run canonicalization first, then sort. Canonical forms (e.g. `m-0`
  instead of `-m-0`) participate in the sort with their proper priority.
- **`enforce-shorthand`**: combine `mt-2 mr-2 mb-2 ml-2` into `m-2` first, then let sort-order place
  the shorthand where it belongs.
- **`no-unnecessary-whitespace`**: harmless in either direction. The fixer rebuilds the string from
  a deterministic token list, so any leftover double spaces collapse on the next pass.
- **`prettier-plugin-tailwindcss` / `oxfmt`**: pick one source of truth. Pointed at the same
  `entryPoint`, all three produce byte-identical output, so you can run formatter + linter without
  fighting fixers.

## When to disable it

- **You delegate sort to `prettier-plugin-tailwindcss` or `oxfmt` exclusively** and want to keep the
  rule budget small — the formatter already does this job byte-for-byte. Leaving both on is fine (no
  conflicts), it's just redundant work.
- **Working in a codebase that intentionally orders classes by authoring intent** (e.g. visual
  grouping that doesn't match Tailwind's priority). Disable locally rather than globally if it's a
  per-component preference.
