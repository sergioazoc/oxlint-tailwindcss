---
title: "Interop with oxfmt and Prettier"
description: "Run oxlint-tailwindcss next to oxfmt or prettier-plugin-tailwindcss and get the same Tailwind CSS class order from all three, by pointing them at your CSS."
---

# Interop with oxfmt and prettier-plugin-tailwindcss

`enforce-sort-order` produces the official Tailwind class order — the same order
[prettier-plugin-tailwindcss](https://github.com/tailwindlabs/prettier-plugin-tailwindcss) produces,
and [oxfmt](https://oxc.rs/docs/guide/usage/formatter)'s `sortTailwindcss`, which implements the
same algorithm. The formatter and this plugin agree on every class string the formatter touches,
**once both read the same CSS and the formatter knows your class helpers**. Two settings do it.

## 1. The same stylesheet

By default the formatter reads the theme bundled in the installed `tailwindcss` package — **not your
project's CSS** — so it doesn't know your `@theme` tokens and orders them differently: `bg-brand`
and `text-brand` are sorted as unknown classes. Point it at the file this plugin reads.

## 2. Your class helpers

The formatter sorts class attributes (`className`, `class`) and **only the functions you list**.
`cn("p-4 flex")` stays unsorted unless `cn` is in `functions`, while this plugin sorts every class
string it extracts. List the helpers you use:

```jsonc
// .oxfmtrc.json
{
  "sortTailwindcss": {
    "stylesheet": "./src/styles.css",
    "functions": ["cn", "clsx", "cva", "tv"]
  }
}
```

The same two settings for prettier:

```jsonc
// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles.css",
  "tailwindFunctions": ["cn", "clsx", "cva", "tv"]
}
```

## Who does what

With both settings, running the formatter leaves `enforce-sort-order` nothing to report in class
attributes and listed helpers, and running `oxlint --fix` leaves the formatter nothing to change.
Class strings the formatter never formats — a `const classes = "…"` variable, for instance — stay
the linter's.

The formatter also drops duplicate classes and collapses whitespace in the strings it formats, so it
overlaps with `no-duplicate-classes` and `no-unnecessary-whitespace` there; the lint rules keep
covering everything else.

::: tip `--fix` more than once

When several rules fix the same class string (a duplicate, extra whitespace and the order), oxlint
applies one of those fixes per run: it has no multi-pass fixing. Run `oxlint --fix` again, or let
the formatter do the sorting, de-duplication and whitespace in one go.

:::

## Why this isn't fixed upstream

The Tailwind team
[intentionally requires explicit config](https://github.com/tailwindlabs/prettier-plugin-tailwindcss/issues/389)
for the stylesheet in v4. There's no convention like `tailwind.config.js` to auto-detect in v4 — CSS
files can live anywhere and be named anything. The plugin defaults to the bundled `theme.css` rather
than guess.

`oxlint-tailwindcss` v1 follows the same philosophy (explicit `entryPoint`), so the only step needed
for consistency is to tell each tool the same path.

## What about `tailwindcss-animate` and `@tailwindcss/typography`?

If you use plugins that register classes (e.g. `prose-*`, `animate-in`), they're imported via your
`@import` in CSS — both tools will pick them up automatically as long as they're reading the same
stylesheet.

## Multiple stylesheets per project

If different parts of your monorepo use different CSS files, see the [monorepo guide](/monorepo).
The same patterns apply to oxfmt: its
[`overrides`](https://oxc.rs/docs/guide/usage/formatter#configuration) can point different file
globs at different stylesheets.

```jsonc
// .oxfmtrc.json
{
  "sortTailwindcss": { "functions": ["cn"] },
  "overrides": [
    {
      "files": ["packages/admin/**"],
      "options": {
        "sortTailwindcss": { "stylesheet": "./packages/admin/src/admin.css", "functions": ["cn"] }
      }
    }
  ]
}
```
