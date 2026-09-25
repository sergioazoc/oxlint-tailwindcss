---
title: Vue, Svelte & Astro
description: "Which parts of .vue, .svelte and .astro files oxlint-tailwindcss checks today — the scripts, not the templates — and how to keep class lists covered."
---

# Vue, Svelte & Astro

**Short answer:** oxlint-tailwindcss checks every class string oxlint lets a plugin see. In `.vue`,
`.svelte` and `.astro` files that is the **script**, not the template: oxlint passes JS plugins the
`<script>` blocks (and Astro's frontmatter) and never the markup. Classes written in a template are
not checked yet.

This is how oxlint 1.85 behaves, and the plugin's end-to-end suite locks it against the real binary.

## What gets linted

| File                                                  | Checked                                                                                   | Not checked                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `.js` `.jsx` `.ts` `.tsx` `.mjs` `.cjs` `.mts` `.cts` | The whole file                                                                            | —                                                   |
| `.vue`                                                | Every `<script>` and `<script setup>` block, including JSX in `lang="tsx"` / `lang="jsx"` | `<template>` (`class="…"`, `:class="…"`), `<style>` |
| `.svelte`                                             | `<script module>` and the instance `<script>`                                             | Markup (`class="…"`, `class:…`), `<style>`          |
| `.astro`                                              | The frontmatter (`---`) and `<script>` tags                                               | Markup, `<style>`                                   |
| `.html`, `.md`, `.mdx`                                | Not linted by oxlint                                                                      | —                                                   |

## What it means in practice

- **Class lists defined in script are covered.** That includes `cva()` / `tv()` variants in
  `<script setup>` or in a `.ts` file next to the component (shadcn-vue, for instance, keeps
  `buttonVariants` in `index.ts`), `cn()` / `clsx()` calls, and variables named like `classes` or
  `className`. See [settings](/settings) for the full detection list.
- **Classes written directly in the template are not.** `class="flex flex"` in a `<template>` is
  left alone. If you want a class list checked, build it in the script with a helper the plugin
  reads — `const cardClasses = cn('…')`, or a `cva()` / `tv()` definition — and bind it
  (`:class="cardClasses"`). A plain string only counts when the variable is named like `classes`,
  `className(s)` or `style(s)`, or matches your own
  [`variablePatterns`](/settings#extractor-configuration).
- **Fixes land where they should.** Diagnostics and autofixes map back to the right lines of the
  file, templates are never touched, and non-ASCII text before a class string doesn't shift a fix.
- **Keep `<script …>` on one line.** oxlint currently skips a Vue `<script` opening tag that spans
  several lines ([oxc#26289](https://github.com/oxc-project/oxc/pull/26289)).

## Sorting template classes

[oxfmt](https://oxc.rs/docs/guide/usage/formatter)'s `sortTailwindcss` sorts class attributes in
**`.vue` templates** (not `.svelte` or `.astro`), using the same Tailwind order as
[`enforce-sort-order`](/rules/enforce-sort-order). If you format with oxfmt, Vue template classes
are kept sorted even though the linter can't see them. See [Interop](/interop) for the setup.

## When will templates be linted?

It depends on oxlint exposing SFC templates to JS plugins. That work is tracked upstream in the
Language Plugins RFC ([oxc#21936](https://github.com/oxc-project/oxc/discussions/21936)), its
umbrella issue ([oxc#23207](https://github.com/oxc-project/oxc/issues/23207)) and
[oxc#20501](https://github.com/oxc-project/oxc/pull/20501) (reporting at real file positions). None
of it has shipped as of oxlint 1.85.

The plugin's test suite includes canaries that fail the day oxlint changes what plugins can see.
Template support follows once oxlint makes it possible.
