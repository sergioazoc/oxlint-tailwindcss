## What this rule does

Combines per-axis Tailwind utilities into their shorthand equivalents when every axis carries the
same value. The most common case: `mt-2 mr-2 mb-2 ml-2` collapses to `m-2`. The rule covers margins,
paddings, width/height sizing, and corner radii — all combinations where Tailwind ships a one-class
shorthand for the multi-class form. Autofix runs on every matching pattern.

DS-independent — works without `settings.tailwindcss.entryPoint`. The mapping table is static, and
value parsing comes from a single regex; no design-system lookup needed.

Special case: `w-X h-X` → `size-X` only fires when both sides resolve to the same CSS dimension.
Viewport units (`screen`, `dvw`, `dvh`, `svw`, `svh`, `lvw`, `lvh`) are excluded because `w-screen`
and `h-screen` reference different axes (`100vw` vs `100vh`) and would not be equivalent to
`size-screen`.

## Options

This rule has no options. The set of shorthand pairs is fixed by Tailwind's own utility surface —
anything we'd let you configure here is more a job for the upstream Tailwind project.

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

// Viewport units excluded — w-screen ≠ h-screen
<div className="w-screen h-screen" />

// Partial coverage — needs all four sides for m-*
<div className="mt-2 mr-2" />

// Different variants — rule doesn't merge across variant chains
<div className="hover:mt-2 focus:mb-2" />
```

## Interactions with other rules

- **`enforce-sort-order`**: run shorthand first so the shorthand participates in sort with its own
  priority. Otherwise sort places `mt-2 mr-2 mb-2 ml-2` in spaced positions and the shorthand fix
  collapses them later.
- **`enforce-logical` / `enforce-physical`**: the shorthand pairs here (`m-*`, `p-*`, `size-*`,
  `rounded-*`) are direction-neutral, so neither directional rule interferes.
- **`enforce-consistent-important-position`**: shorthand respects the `!` placement convention of
  the merged classes. If all four use prefix, the shorthand is prefix; same for suffix.

## When to disable it

- **You want explicit per-axis values for readability**, especially in design-system component
  libraries where reviewers find `mt-2 mr-2 mb-2 ml-2` clearer than `m-2`.
- **Code generation** where every utility is emitted on purpose and collapsing them would hide the
  intent.
