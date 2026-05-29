# max-class-count

> Enforce a maximum number of Tailwind CSS classes per element

## What this rule does

Counts the Tailwind classes on each element (or inside each `cn()`/`clsx()`/`tw\`\`` call) and
reports when the count exceeds a configurable maximum. The diagnostic suggests extracting a
component or utility — the assumption being that once an element needs more than ~20 classes, you're
describing a _component_ inline and the right move is to name it.

The counter is dumb on purpose: it counts whitespace-separated classes after the standard extractor
has resolved the location. No deduplication, no semantic grouping, no DS lookup. That keeps it
predictable: if your `className` reads as N classes, the rule sees N. Multiline strings rebuilt by
`enforce-consistent-line-wrapping` are counted as the underlying class set, not by visual lines.

DS-independent — no `entryPoint` needed. No autofix: extracting a component requires judgement the
rule can't make for you.

## Options

### `max`

`number`, default `20`.

The maximum number of classes allowed on a single element / call. The rule reports when
`classes.length > max` (i.e. the limit is inclusive: `max: 20` allows _exactly_ 20). Adjust it to
your team's threshold for "this is now a component."

```jsonc
{ "tailwindcss/max-class-count": ["warn", { "max": 15 }] }
```

Suggested ballparks:

- **`max: 10-15`** — strict component-extraction culture, lots of small reusable building blocks.
- **`max: 20`** (default) — middle ground, fires on outliers without nagging on legitimately dense
  utility-first markup.
- **`max: 30+`** — large dashboard apps where dense one-off layouts are common and you only want a
  guard against truly egregious cases.

## Examples

### ✗ Incorrect

```tsx
// 21 classes — over the default max of 20
<div className="flex items-center p-4 m-2 bg-white text-black rounded shadow border w-full h-10 gap-2 justify-between font-bold text-sm overflow-hidden cursor-pointer transition duration-200 opacity-50 z-10" />
//
// Diagnostic:
//   Too many Tailwind classes (21). Maximum allowed is 20.
//   Consider extracting into a component or utility.

// 6 classes with `max: 5`
<div className="flex items-center p-4 m-2 gap-2 w-full" />
```

### ✓ Correct

```tsx
// Within the default limit
<div className="flex items-center p-4 m-2 gap-2" />

// Extracted into a component — count resets per element
function Card({ children }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow">
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

// `cn()` counts the same — counted at the location level
cn("flex items-center", "p-4 m-2 gap-2")
```

## Interactions with other rules

- **`no-duplicate-classes`**: if a class is repeated, both rules will see the bloated count. Fix the
  duplicate first — the count drops and this rule may stop firing on its own.
- **`enforce-sort-order`** / **`enforce-consistent-line-wrapping`**: cosmetic siblings. The counter
  is whitespace-insensitive so line-wrapping doesn't change the verdict.
- **`enforce-canonical`**: collapses redundant pairs (`-m-0` → `m-0`) before this rule runs,
  sometimes pushing a borderline element back under the limit.
- **`no-arbitrary-value`**: orthogonal, but related in spirit — both nudge toward extracting a
  component when a single element starts carrying too much markup-level logic.

## When to disable it

- **Files that are inherently dense** (top-level layouts, marketing hero sections, design-system
  primitive components that _are_ the abstraction). Prefer per-line disables or a higher `max` in
  the override block.
- **Generated markup** (codegen, MDX components) where the count reflects the generator, not author
  intent.
- **You disagree with the heuristic**: the rule is opinionated and won't suit every codebase.
  There's no shame in turning it off — it exists for teams that want the nudge.
