---
description: "oxlint rule that reports a plain element rebuilding one of your components from Tailwind CSS classes: a hand-made Button, Card or Input."
---

## What this rule does

Your components hold the design system's decisions: `<Button>` is the primary color, the radius, the
height and the focus ring, in one place. A `<button>` that copies Button's classes — or rewrites
them from memory — looks the same today and drifts tomorrow: when Button changes, it doesn't, and it
never had the focus ring, the disabled state or the variants. This rule reads the components you
point it at, and reports a plain element whose classes rebuild one of them:

```text
<button> rebuilds Button: 9 of its 9 style declarations match. Use Button from
components/ui/button.tsx instead, so it follows your design system.
```

It compares what the classes do, not how they're written:

- each class becomes its CSS declarations, so `px-4` and `pl-4 pr-4`, or `rounded-md` and
  `rounded-t-md rounded-b-md`, are the same style;
- layout is left out — `flex`, `w-full`, `mt-4`, `gap-2`: where an element sits is yours to change;
- so are the classes behind a variant (`hover:`, `md:`, `data-[state=open]:`), on both sides.

An element is reported when it shares at least 4 declarations with a component, those are at least
60% of all the declarations either of them sets (the element's extras count against it), one of them
styles the box — background, border, corners or shadow — and none of its colors differ from the
component's. A Button's shape in another color is another style, and `text-sm font-medium` alone is
any text.

Only native elements (`<button>`, `<div>`, `<span>`) are compared, from their `className` string or
the `cn()` call in it: a component's `className` is merged into its own styles, not a copy of them.
The component files themselves are never reported.

DS-dependent — needs `settings.tailwindcss.entryPoint` to turn classes into declarations. No
autofix: replacing an element with a component changes its props and its behavior.

## How it reads your components

The rule reads each file under `components` without running it, and takes:

- a `cva()` or `tv()` definition: its base classes plus each variant group's default, as the
  component (`Button`), and one style per value of its first variant group
  (`Button variant="outline"`);
- a capitalized function component's first `className` — its root element — when it is a string or a
  `cn()` / `clsx()` call: `Card`, `CardHeader`.

A style is compared only when it has at least 4 declarations, a color and a box. Components that
pass `className` through untouched, or build their classes at runtime, are skipped.

## Options

### `components`

`string[]`, default `[]`.

The files and directories that hold your design system's components. A directory is read
recursively, skipping `*.test.*`, `*.spec.*`, `*.stories.*` and `*.d.ts` files. Relative paths are
resolved like `entryPoint`: against the directory of the nearest `.oxlintrc.json`, then oxlint's
working directory. With no components, the rule reports nothing.

```jsonc
{
  "tailwindcss/no-borrowed-component-styles": ["warn", { "components": ["src/components/ui"] }]
}
```

### `entryPoint`

`string`, optional. Per-rule override of `settings.tailwindcss.entryPoint`.

## Examples

With shadcn/ui's Button and Card in `components/ui`:

### ✗ Incorrect

```tsx
// options: { "components": ["components/ui"] }
// Copied from Button
<button className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground h-9 hover:bg-primary/90">
  Pay
</button>
// reports: rebuilds Button

// Rewritten from memory: another order, pl-4 pr-4 for px-4, on a link
<a className="bg-primary text-primary-foreground pl-4 pr-4 py-2 h-9 rounded-md text-sm font-medium">
  Pay
</a>

// A Card, its classes merged by cn()
<div className={cn("rounded-xl border bg-card py-6", "text-card-foreground shadow-sm")}>Plan</div>
// reports: rebuilds Card
```

### ✓ Correct

```tsx
// options: { "components": ["components/ui"] }
// The components themselves
<Button className="mt-4 w-full">Pay</Button>

// Layout only
<div className="flex items-center gap-2 p-4" />

// A Button's shape in a color none of its variants use is another style
<div className="rounded-md bg-muted px-4 py-2 text-sm font-medium h-9" />

// No box in common: text styles alone are any text
<span className="h-9 px-4 py-2 text-sm font-medium text-primary-foreground" />
```

## Interactions with other rules

- **`no-default-palette`** and **`no-hardcoded-colors`** keep an element's colors in your theme;
  this rule keeps the styles your components already own in the components.
- **`max-class-count`**: a long class string on a plain element is often a component waiting to be
  extracted — or one that already exists, which this rule names.
- **@shadcn/lint's `no-restyle`** reports the other direction: classes that restyle a component
  (`<Button className="bg-blue-600">`). This rule reports a plain element restyled into one. See
  [shadcn/ui and @shadcn/lint](/shadcn).

## When to disable it

- **An element that can't be the component.** shadcn/ui draws a checkbox inside a command-menu item
  with Checkbox's classes, because a real Checkbox — a button — can't sit inside an option. Disable
  the line there.
- **Code that shows the components' markup**, such as stories or docs pages outside `components`.
- **While migrating** to the components: the reports are the to-do list; keep the rule at `warn`.
