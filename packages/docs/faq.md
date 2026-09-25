---
title: "FAQ"
description: "Answers about oxlint-tailwindcss: ESLint and Tailwind v3, which rules run, the entry point, Vue and Svelte, unknown classes that work, --fix, formatters and CI."
---

# FAQ

## Does it work with ESLint?

No. oxlint-tailwindcss is an oxlint plugin, built on oxlint's JS plugin API and tested with oxlint
only. Install oxlint and add the plugin to `jsPlugins` in `.oxlintrc.json` — see [Setup](/setup).

## Which Tailwind versions does it support?

Tailwind CSS v4.1.15 and later. The plugin loads your project's own Tailwind engine, so the linter
and your build read the same design system; an older engine, a future major, or a major-version
drift from your build is reported with a message that says so. Tailwind v3 (`tailwind.config.js`)
isn't supported.

## Which rules run?

Only the ones you list under `rules`. oxlint's `categories` don't turn on a JS plugin's rules, so a
config with the plugin and no rules reports nothing. Start from the
[recommended config](/setup#3-recommended-starter-rule-set) and add rules from [the list](/rules/).

## Do I need an entry point?

The rules that read your design system — which classes exist, their order, their CSS — need
`settings.tailwindcss.entryPoint`, the CSS file where you `@import "tailwindcss"`. Without it they
report `designSystemUnavailable` once per file, with a hint. The other rules work without one, and
several get more precise with it. [The rule list](/rules/) says which is which.

## Does it lint Vue, Svelte and Astro files?

Their `<script>` blocks, and Astro's frontmatter — not the templates. oxlint hands JS plugins only
those parts of the file. [Vue, Svelte & Astro](/frameworks) shows what is and isn't linted.

## Why is a class that works reported as unknown?

`no-unknown-classes` knows Tailwind's classes and the ones your CSS defines — in the entry point and
the stylesheets it imports directly. A class it reports that still works in the browser usually
comes from CSS the entry point doesn't reach: a stylesheet imported by another imported stylesheet,
or one your app loads separately. Or it has no CSS at all and is a hook for JavaScript or tests.
Import that CSS from the entry point, or tell the rule about the class with
[`allowlist` or `ignorePrefixes`](/rules/no-unknown-classes#options).

## How do I turn a rule off for one line?

With oxlint's comments, naming the rule:

```tsx
// oxlint-disable-next-line tailwindcss/no-unknown-classes
<div className="legacy-widget flex" />
```

## Why does `oxlint --fix` leave some problems?

oxlint applies one fix per class string per run. When several rules fix the same string — a
duplicate, extra whitespace and the order — each run applies one of them; run `oxlint --fix` again
until nothing changes.

## Does it replace prettier-plugin-tailwindcss or oxfmt's class sorting?

No, they work together. The formatter sorts classes, removes duplicates and collapses whitespace in
what it formats; this plugin checks correctness — unknown, conflicting, deprecated and runtime-built
classes, and more. Point both at the same CSS and they sort the same way: see [Interop](/interop).

## Can I use it with @shadcn/lint?

Yes. [shadcn/ui and @shadcn/lint](/shadcn) shows who reports what and a combined config that reports
each problem once.

## I use eslint-plugin-better-tailwindcss. How do I switch?

Each of its rules has a counterpart here; the [migration guide](/migration/from-better-tailwindcss)
maps them and their settings, and walks through the switch.

## How do I make it fast in CI?

The design system is precomputed once per entry point and cached on disk. Keep that cache between
jobs — [Running in CI](/ci) has the `actions/cache` recipe.

## Does it work in a monorepo?

Yes: map each package's files to its CSS in the root config, or give each package its own
`.oxlintrc.json`. See [Monorepo](/monorepo).
