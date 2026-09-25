---
title: "no-dynamic-classes — Tailwind CSS lint rule"
description: "oxlint rule that reports Tailwind CSS classes built at runtime, like bg-${color}-500, which Tailwind never sees written out and so generates no CSS for."
---

# no-dynamic-classes

oxlint rule that reports Tailwind CSS classes built at runtime, like `bg-${color}-500`, which
Tailwind never sees written out and so generates no CSS for.

## At a glance

| Autofix | Editor suggestions | Design system                            | Options      |
| ------- | ------------------ | ---------------------------------------- | ------------ |
| No      | No                 | Optional — used when `entryPoint` is set | `entryPoint` |

## What this rule does

Tailwind generates CSS for the class names it finds **written out** in your source files. A class
put together at runtime — `` `bg-${color}-500` ``, `` `text-${size}` ``, `` `w-[${width}px]` `` —
never appears in full anywhere, so Tailwind emits nothing for it and the element silently goes
unstyled. It works in development only if the same class happens to be written out somewhere else.

The rule reports each such class once, when the text glued to a `${}` starts with a Tailwind utility
(`bg-`, `grid-cols-`, `-mt-`, `w-[`) or a variant (`hover:`, `md:`, `data-`). A whole class or list
coming from a variable (`` `${base} p-4` ``) is fine, and so is text that isn't Tailwind's
(`` `icon-${name}` ``, `` `${a}-${b}` ``). There is no autofix: the fix is to write out every class
the value can map to.

DS-optional. With an `entryPoint`, your project's own utilities and variants count too (a `@theme`
namespace such as `bar-*`); without one, Tailwind's built-in utility and variant roots are used.

What it doesn't see: `"bg-" + color` concatenation (the extractor reads string and template
literals, not `+` expressions), and a variant chosen at runtime after the static text
(`` `${breakpoint}:flex` ``).

## Options

### `entryPoint`

`string`, optional. Per-rule override of `settings.tailwindcss.entryPoint`, used to read your
project's utilities and variants.

## Examples

### ✗ Incorrect

```tsx
<div className={`bg-${color}-500 p-2`} />
<div className={`text-${size} font-bold`} />
<div className={`w-[${width}px]`} />
<div className={`hover:${hoverClass}`} />
<div className={cn(`p-${padding}`)} />
```

### ✓ Correct

```tsx
// Write out every class the value can map to
const bgByColor = { red: 'bg-red-500', blue: 'bg-blue-500' } as const
<div className={`${bgByColor[color]} p-2`} />

// Pick between full class names
<div className={cn(active ? 'bg-blue-500' : 'bg-gray-500')} />

// A value that really is dynamic: a CSS variable, set inline
<div className="w-(--width)" style={{ '--width': `${width}px` }} />
```

## Interactions with other rules

- **`no-unknown-classes`** ignores the glued fragments (`bg-`, `-500`) — they aren't classes, and
  this rule is the one that reports them.
- **`no-arbitrary-value`**: the CSS-variable fix above is an arbitrary value; allow it with
  `allowVariables: 'runtime'`.

## When to disable it

- **Your classes are safelisted** (`@source inline(…)`), so Tailwind generates them whether or not
  they appear in the source. Disable the rule for those files, or for the project if everything is
  safelisted.
