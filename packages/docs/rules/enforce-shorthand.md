# enforce-shorthand

> Enforce shorthand Tailwind CSS classes when all axes have the same value

## What this rule does

Combines per-axis Tailwind utilities into their shorthand equivalents when every axis carries the
same value. The most common case: `mt-2 mr-2 mb-2 ml-2` collapses to `m-2`. Covered families:

| Family                  | Collapses                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| margin / padding        | four sides → `m-*`, axes → `my-*`/`mx-*`, `mx-*`+`my-*` → `m-*`, `ms-*`+`me-*` → `mx-*`                                                       |
| `scroll-m*`/`scroll-p*` | the same shapes                                                                                                                               |
| sizing                  | `w-*`+`h-*` → `size-*`                                                                                                                        |
| radii                   | corners → edges → `rounded-*`, including the logical corners (`rounded-ss-*`+`rounded-es-*` → `rounded-s-*`)                                  |
| borders                 | sides → `border-*`, axes → `border-x-*`/`border-y-*` — widths **and** colours                                                                 |
| inset                   | `top`/`right`/`bottom`/`left` → `inset-*`, axes → `inset-x-*`/`inset-y-*`, `start-*`+`end-*` → `inset-x-*`                                    |
| single-property pairs   | `gap-x`+`gap-y`, `overflow-x`+`overflow-y`, `overscroll-x`+`overscroll-y`, `border-spacing-x`+`border-spacing-y`, `translate-x`+`translate-y` |

One diagnostic per collapsible group: four sides report `m-2` once, not `m-2` plus the `my-2`/`mx-2`
halves.

`scale-x-*`+`scale-y-*` is deliberately **not** a family. `scale-110` also writes `--tw-scale-z`,
which `scale-3d` reads, so merging would change how `scale-x-110 scale-y-110 scale-3d` renders.

### With an `entryPoint`, the merge is checked against the CSS

Tailwind v4 has per-axis theme namespaces: `w-*` reads `--width-*` (and `--container-*`), `h-*`
reads `--height-*`, `size-*` reads `--size-*`. So this theme

```css
@theme {
  --width-brand: 10rem;
  --height-brand: 20rem;
}
```

makes `w-brand h-brand` → `size-brand` destructive: `size-brand` does not exist, and the element
loses its width and its height. Configure `settings.tailwindcss.entryPoint` (or the rule's own
`entryPoint`) and the rule compares the declarations Tailwind emits — the parts have to resolve to
the same value and the replacement has to reproduce it — so that merge is not offered.

Named theme tokens on the sizing family are only merged when the values are literally identical.
`w-card h-card` is left alone even when all three namespaces define `card` as `30rem`, because each
side reads a different variable and a `:root` override of one makes them diverge — the same
reasoning [`enforce-canonical`](./enforce-canonical) applies to `rounded-[0.5rem]` → `rounded-lg`.

Without an entry point the rule keeps the merges that are safe whatever the theme says: numbers and
fractions (the shared spacing scale), arbitrary values (the same literal on both sides), the core
keywords (`full`, `auto`, `min`, `max`, `fit`, `px`, and the viewport units), and every family other
than sizing — those all draw from a single namespace.

## Options

### `entryPoint`

`string`, optional. A CSS entry point for this rule alone, overriding
`settings.tailwindcss.entryPoint`. Only used to verify merges against the emitted CSS; the rule
works without it.

## Examples

### ✗ Incorrect

```tsx
// Four-side margin
<div className="mt-2 mr-2 mb-2 ml-2" />
//              ~~~~ ~~~~ ~~~~ ~~~~  → m-2

// Two-axis (vertical, horizontal)
<div className="mt-2 mb-2" />  →  my-2
<div className="ml-2 mr-2" />  →  mx-2

// Width + height with the same value
<div className="w-full h-full" />
//              ~~~~~~ ~~~~~~  → size-full

// Sides and axes of any covered family
<div className="border-t-2 border-r-2 border-b-2 border-l-2" />  →  border-2
<div className="top-0 right-0 bottom-0 left-0" />                →  inset-0
<div className="rounded-tl-lg rounded-tr-lg" />                  →  rounded-t-lg
<div className="gap-x-4 gap-y-4" />                              →  gap-4

// Logical inline pairs — `ms-*`+`me-*` IS `margin-inline`
<div className="ms-4 me-4" />  →  mx-4

// Same with important — both sides must share the modifier
<div className="!mt-2 !mr-2 !mb-2 !ml-2" />
//              ~~~~~ ~~~~~ ~~~~~ ~~~~~  → !m-2
```

### ✓ Correct

```tsx
// Already a shorthand
<div className="m-2 p-4" />

// Different values across axes — no collapse possible
<div className="mt-2 mb-4" />

// w-screen is 100vw and h-screen is 100vh; size-screen doesn't exist
<div className="w-screen h-screen" />

// Per-axis theme tokens: `size-brand` would drop both dimensions
// (needs an entryPoint to be detected — see above)
<div className="w-brand h-brand" />

// scale-110 also writes --tw-scale-z, which scale-3d reads
<div className="scale-x-110 scale-y-110" />

// Partial coverage — needs all four sides for m-*
<div className="mt-2 mr-2" />

// Adjacent sides are not an axis
<div className="top-0 right-0" />

// Different variants — rule doesn't merge across variant chains
<div className="hover:mt-2 focus:mb-2" />
```

## Interactions with other rules

- **`enforce-sort-order`**: run shorthand first so the shorthand participates in sort with its own
  priority. Otherwise sort places `mt-2 mr-2 mb-2 ml-2` in spaced positions and the shorthand fix
  collapses them later.
- **`enforce-logical` / `enforce-physical`**: most families here are direction-neutral. The logical
  pairs that do collapse (`ms-*`+`me-*` → `mx-*`, `border-s-*`+`border-e-*` → `border-x-*`,
  `start-*`+`end-*` → `inset-x-*`) land on axis utilities neither directional rule converts, so the
  two never fight.
- **`enforce-consistent-important-position`**: shorthand respects the `!` placement convention of
  the merged classes. If all four use prefix, the shorthand is prefix; same for suffix.

## When to disable it

- **You want explicit per-axis values for readability**, especially in design-system component
  libraries where reviewers find `mt-2 mr-2 mb-2 ml-2` clearer than `m-2`.
- **Code generation** where every utility is emitted on purpose and collapsing them would hide the
  intent.
