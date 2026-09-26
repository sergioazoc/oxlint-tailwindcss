---
title: "oxlint-tailwindcss, @shadcn/lint and better-tailwindcss compared"
description: "What oxlint-tailwindcss, @shadcn/lint and eslint-plugin-better-tailwindcss each check, measured on the same code, and which to use when."
---

# Compared with other plugins

Three plugins lint Tailwind CSS classes under oxlint:
[@shadcn/lint](https://github.com/shadcn-ui/lint), shadcn/ui's design-system policy for its
components;
[eslint-plugin-better-tailwindcss](https://github.com/schoero/eslint-plugin-better-tailwindcss), an
ESLint plugin oxlint can run; and this one. They overlap less than their names suggest. The numbers
below are the [benchmark](/benchmark)'s, generated from the same results file.

## At a glance

<!-- generated:comparison-summary -->

| Summary                                 | oxlint-tailwindcss 1.13.0 | @shadcn/lint 0.2.0 | eslint-plugin-better-tailwindcss 4.7.0 |
| --------------------------------------- | ------------------------- | ------------------ | -------------------------------------- |
| Seeded mistakes caught                  | 50/56                     | 34/56              | 20/56                                  |
| False alarms on clean lines             | 0/6                       | 0/6                | 0/6                                    |
| Warm run, all rules                     | 1.3 s                     | 1.0 s              | 30.9 s                                 |
| Unknown-class reports Tailwind compiles | 0/77                      | 0/34               | 0/97                                   |
| `--fix`: strings whose style changed    | 0/670                     | no autofix         | 1/2,865                                |

<!-- /generated:comparison-summary -->

Seeded mistakes are the [benchmark's labeled files](/benchmark#seeded-mistakes), and they lean to
what this plugin checks. "Unknown-class reports Tailwind compiles" are reports Tailwind itself
proves wrong, and "strings whose style changed" are class strings an unattended `--fix` changed the
look of.

## What each one checks

A ✓ means the plugin has a rule for it; which rules is in the tables of
[shadcn/ui and @shadcn/lint](/shadcn) and the [migration guide](/migration/from-better-tailwindcss).

<!-- generated:comparison-coverage -->

| Mistake                                                                        | oxlint-tailwindcss | @shadcn/lint | eslint-plugin-better-tailwindcss |
| ------------------------------------------------------------------------------ | ------------------ | ------------ | -------------------------------- |
| Restyling a design-system component through `className`                        | —                  | ✓            | —                                |
| Inline styles                                                                  | —                  | ✓            | —                                |
| A Tailwind palette color instead of a theme color                              | ✓                  | ✓            | —                                |
| Arbitrary values                                                               | ✓                  | ✓            | —                                |
| A CSS variable where the theme has a named class                               | ✓                  | —            | —                                |
| Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| Classes built at runtime                                                       | ✓                  | ✓            | ✓                                |
| Classes that override each other                                               | ✓                  | —            | ✓                                |
| Duplicate classes                                                              | ✓                  | —            | ✓                                |
| Classes deprecated in Tailwind v4                                              | ✓                  | —            | ✓                                |
| A dark-mode color with no light-mode base                                      | ✓                  | —            | —                                |
| Component rebuilt from raw classes                                             | ✓                  | —            | —                                |
| Redundant or contradicting variant                                             | ✓                  | —            | —                                |
| Arbitrary value that is on the scale                                           | ✓                  | —            | —                                |
| Classes with a canonical form                                                  | ✓                  | —            | ✓                                |
| Class and variant order                                                        | ✓                  | —            | ✓                                |
| Extra whitespace                                                               | ✓                  | —            | ✓                                |
| Longhands with a shorthand                                                     | ✓                  | —            | ✓                                |
| Other style policy                                                             | ✓                  | —            | ✓                                |

<!-- /generated:comparison-coverage -->

## Which to use

- **oxlint-tailwindcss** checks classes against your design system: that they exist, don't override
  each other, aren't deprecated, and stay within your theme. It reads your Tailwind build, so its
  reports and its fixes match what Tailwind generates. It is an oxlint plugin only.
- **@shadcn/lint** enforces shadcn/ui's component policy — no restyling a component through
  `className`, no inline styles — which this plugin doesn't check. The two run together:
  [shadcn/ui and @shadcn/lint](/shadcn) has a combined config that reports each problem once.
- **eslint-plugin-better-tailwindcss** is the choice for a project that stays on ESLint. Under
  oxlint, oxlint-tailwindcss has a rule for each of its rules, and runs faster:
  [the migration guide](/migration/from-better-tailwindcss) maps the rules and their settings.
