---
layout: home
title: "Tailwind CSS linting for oxlint"
description: "oxlint-tailwindcss is the oxlint plugin for Tailwind CSS v4: lint rules that check your classes against your own design system, with autofixes."

hero:
  name: oxlint-tailwindcss
  text: Tailwind CSS linting for oxlint.
  tagline: 26 rules, designed for Tailwind v4. Deterministic, fast, fail-loud.
  actions:
    - theme: brand
      text: Get started
      link: /setup
    - theme: alt
      text: Browse rules
      link: /rules/
    - theme: alt
      text: View on GitHub
      link: https://github.com/sergioazoc/oxlint-tailwindcss

features:
  - title: Configure once
    details: |
      `settings.tailwindcss.entryPoint` is required and explicit. No
      filesystem auto-detect, no surprises across machines. Same input,
      same output.
  - title: Tailwind v4 native
    details: |
      Calls `@tailwindcss/node` directly to understand your custom
      `@theme` tokens, your shadcn variables, your typography plugin.
      No need to keep a parallel config in sync.
  - title: Coexists with oxfmt and Prettier
    details: |
      Point oxfmt's `sortTailwindcss` at the same CSS this plugin uses and
      list your class helpers, and the two sort the same way. The
      [interop guide](/interop) walks through the setup.
  - title: Fail loud, fix easy
    details: |
      Misconfiguration surfaces as a single `designSystemUnavailable`
      diagnostic with an actionable hint — never as silently-skipped
      rules — and a misspelt setting is named, with the one you meant.
---

## What is oxlint-tailwindcss?

oxlint-tailwindcss is a plugin for [oxlint](https://oxc.rs/docs/guide/usage/linter), the linter of
the Oxc project, that lints Tailwind CSS v4 class names. It loads your project's design system from
the CSS entry point you configure — its `@theme` tokens, `@utility` and `@custom-variant`
definitions and plugins — and checks every class string in JSX, TSX, JavaScript and TypeScript (and
the `<script>` of Vue, Svelte and Astro files) against it, with 26 rules, most with an autofix.

## What it catches

- **Classes Tailwind can't generate**: a typo like `itms-center`, with the class you meant —
  [`no-unknown-classes`](/rules/no-unknown-classes).
- **Classes that override each other**: `p-4 p-6`, or `line-clamp-1 flex`, where `flex` replaces the
  clamp's `display` — [`no-conflicting-classes`](/rules/no-conflicting-classes).
- **Classes built at runtime**, which get no CSS: `` `bg-${color}-500` `` —
  [`no-dynamic-classes`](/rules/no-dynamic-classes).
- **Classes Tailwind v4 renamed**: `flex-shrink-0` → `shrink-0` —
  [`no-deprecated-classes`](/rules/no-deprecated-classes).
- **A dark-mode color with no light-mode base** —
  [`no-dark-without-light`](/rules/no-dark-without-light).
- **Values your theme already names**: `p-[10px]` → `p-2.5`, `bg-(--primary)` → `bg-primary` —
  [`prefer-scale-token`](/rules/prefer-scale-token),
  [`prefer-theme-tokens`](/rules/prefer-theme-tokens).
- **Order and form**: class and variant order, canonical and shorthand forms, whitespace —
  [`enforce-sort-order`](/rules/enforce-sort-order),
  [`consistent-variant-order`](/rules/consistent-variant-order),
  [`enforce-canonical`](/rules/enforce-canonical), and [the rest](/rules/).

## Quick start

```bash
pnpm add -D oxlint oxlint-tailwindcss
```

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": { "tailwindcss": { "entryPoint": "src/styles.css" } },
  "rules": {
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-conflicting-classes": "error"
  }
}
```

```bash
npx oxlint
```

`entryPoint` is the CSS file where you `@import "tailwindcss"`. [Setup](/setup) has the recommended
rules and the editor, monorepo and formatter setup.
