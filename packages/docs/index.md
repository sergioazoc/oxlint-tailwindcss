---
layout: home
title: "Tailwind CSS linting for oxlint"
description: "oxlint-tailwindcss is the oxlint plugin for Tailwind CSS v4: lint rules that check your classes against your own design system, with autofixes."

hero:
  name: oxlint-tailwindcss
  text: Tailwind CSS linting for oxlint.
  tagline: 25 rules, designed for Tailwind v4. Deterministic, fast, fail-loud.
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
      rules. The error tells you exactly which file and what to set.
---
