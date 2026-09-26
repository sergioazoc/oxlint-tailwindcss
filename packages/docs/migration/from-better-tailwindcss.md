---
title: "Migrating from eslint-plugin-better-tailwindcss"
description: "Move from eslint-plugin-better-tailwindcss to oxlint-tailwindcss: each of its rules and settings mapped, what differs, and the switch step by step."
---

# Migrating from eslint-plugin-better-tailwindcss

[eslint-plugin-better-tailwindcss](https://github.com/schoero/eslint-plugin-better-tailwindcss) runs
in ESLint and, as a JS plugin, in oxlint. oxlint-tailwindcss is built for oxlint and Tailwind v4.
Each of better-tailwindcss 4.7.0's 15 rules has a counterpart here, and each pair reports the same
example — the tables below are checked against it every week, with its latest release.

## Rules

<!-- generated:btw-rules -->

| better-tailwindcss                      | oxlint-tailwindcss                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enforce-consistent-class-order`        | [`enforce-sort-order`](/rules/enforce-sort-order)                                       | Their default `order: "official"` is this rule's order. Unknown classes go first, in the order written, as with their `unknownClassOrder: "preserve"`. `order: "strict"` → `mode: "strict"`, which also groups classes by variant chain (the order within can differ). `asc`, `desc` and the `componentClass*` / `unknownClass*` options have no equivalent.                           |
| `enforce-consistent-important-position` | [`enforce-consistent-important-position`](/rules/enforce-consistent-important-position) | `position: "recommended"` → `"suffix"` (the default, `p-4!`); `"legacy"` → `"prefix"` (`!p-4`).                                                                                                                                                                                                                                                                                        |
| `enforce-consistent-line-wrapping`      | [`enforce-consistent-line-wrapping`](/rules/enforce-consistent-line-wrapping)           | `printWidth`, `classesPerLine` and `group` mean the same. The autofix only rewrites template literals — a string attribute is reported, not rewritten — and a line over `printWidth` is rewrapped only with `wrapLines`. `indent`, `tabWidth`, `lineBreakStyle`, `preferSingleLine`, `strictness` and `vueConvertToBinding` have no equivalent: the indentation comes from the source. |
| `enforce-consistent-variant-order`      | [`consistent-variant-order`](/rules/consistent-variant-order)                           | Both write chains outermost first (`sm:hover:`). This rule also orders color scheme and attribute variants (`dark:hover:`, `data-[state=open]:hover:`), which theirs leaves alone; `order` sets your own.                                                                                                                                                                              |
| `enforce-consistent-variable-syntax`    | [`enforce-consistent-variable-syntax`](/rules/enforce-consistent-variable-syntax)       | `syntax: "shorthand"` is the default in both; `"variable"` → `"explicit"`.                                                                                                                                                                                                                                                                                                             |
| `enforce-shorthand-classes`             | [`enforce-shorthand`](/rules/enforce-shorthand)                                         |                                                                                                                                                                                                                                                                                                                                                                                        |
| `enforce-logical-properties`            | [`enforce-logical`](/rules/enforce-logical)                                             | `ignore` → `allowlist` (regular expressions, too). `direction` limits it to inline or block utilities; `enforce-physical` is the reverse rule.                                                                                                                                                                                                                                         |
| `enforce-canonical-classes`             | [`enforce-canonical`](/rules/enforce-canonical)                                         | Their `collapse` (merging `mt-2 mb-2` into `my-2`) is `enforce-shorthand` here. `ignore` and `logical` have no equivalent.                                                                                                                                                                                                                                                             |
| `no-duplicate-classes`                  | [`no-duplicate-classes`](/rules/no-duplicate-classes)                                   |                                                                                                                                                                                                                                                                                                                                                                                        |
| `no-deprecated-classes`                 | [`no-deprecated-classes`](/rules/no-deprecated-classes)                                 |                                                                                                                                                                                                                                                                                                                                                                                        |
| `no-unnecessary-whitespace`             | [`no-unnecessary-whitespace`](/rules/no-unnecessary-whitespace)                         | Line breaks are always kept, as with their `allowMultiline: true`.                                                                                                                                                                                                                                                                                                                     |
| `no-concatenated-classes`               | [`no-dynamic-classes`](/rules/no-dynamic-classes)                                       | Both report a class built with `${}` or `+`. This one reports it when the built class starts with a Tailwind utility or variant, so `"p-4 " + extra` and `` `icon-${name}` `` are fine.                                                                                                                                                                                                |
| `no-unknown-classes`                    | [`no-unknown-classes`](/rules/no-unknown-classes)                                       | `ignore` (regular expressions) → `allowlist` (exact names) and `ignorePrefixes`. The classes your CSS defines (`@layer components`, `@utility`) are always known, so their `detectComponentClasses` setting has no counterpart.                                                                                                                                                        |
| `no-conflicting-classes`                | [`no-conflicting-classes`](/rules/no-conflicting-classes)                               | It also reports a class another one makes redundant (`reportRedundant`), and `allow` exempts pairs.                                                                                                                                                                                                                                                                                    |
| `no-restricted-classes`                 | [`no-restricted-classes`](/rules/no-restricted-classes)                                 | `restrict: [{ pattern, message }]` → `patterns: [{ pattern, message }]`, and `classes` for exact names. There is no `fix`.                                                                                                                                                                                                                                                             |

<!-- /generated:btw-rules -->

## Settings

<!-- generated:btw-settings -->

| `settings["better-tailwindcss"]` | `settings.tailwindcss`                                                                       | Notes                                                                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entryPoint`                     | `entryPoint`                                                                                 | Required here. A string, or a glob → CSS mapping for a monorepo.                                                                                                                                    |
| `cwd`                            | `entryPoint`                                                                                 | Map each package's files to its CSS with `entryPoint: [{ files, use }]`, or give the package its own `.oxlintrc.json`.                                                                              |
| `rootFontSize`                   | `rootFontSize`                                                                               |                                                                                                                                                                                                     |
| `selectors`                      | `attributes`, `attributePatterns`, `callees`, `calleeExtractors`, `tags`, `variablePatterns` | Both read `class` / `className`, the same variable names and most helpers by default. Add what yours lists that this one doesn't: the `dcnb` helper to `callees`, the `twc` / `twx` tags to `tags`. |
| `detectComponentClasses`         | —                                                                                            | Always on: the classes your CSS defines are known.                                                                                                                                                  |
| `tailwindConfig`                 | —                                                                                            | A Tailwind v3 JavaScript config; this plugin reads Tailwind v4 CSS.                                                                                                                                 |
| `tsconfig`                       | —                                                                                            |                                                                                                                                                                                                     |
| `messageStyle`                   | —                                                                                            |                                                                                                                                                                                                     |

<!-- /generated:btw-settings -->

## Switching, step by step

1. Install the plugin: `pnpm add -D oxlint-tailwindcss` (and `oxlint`, if better-tailwindcss ran in
   ESLint).
2. In `.oxlintrc.json`, add `"jsPlugins": ["oxlint-tailwindcss"]`, and move
   `settings["better-tailwindcss"]` to `settings.tailwindcss` with the settings table. `entryPoint`
   is required.
3. Rename each `better-tailwindcss/<rule>` to the `tailwindcss/<rule>` of the rules table, turning
   its options into the ones its notes name. Or start from the [recommended config](/setup) and add
   what you had on top.
4. Remove eslint-plugin-better-tailwindcss — from `jsPlugins`, or from the ESLint config — and
   uninstall it, so the two don't report the same class.
5. Run `oxlint`, then `oxlint --fix` for the autofixes.

A typical config, before and after:

```jsonc
// Before
{
  "jsPlugins": ["eslint-plugin-better-tailwindcss"],
  "settings": { "better-tailwindcss": { "entryPoint": "src/styles.css" } },
  "rules": {
    "better-tailwindcss/enforce-consistent-class-order": "warn",
    "better-tailwindcss/enforce-consistent-important-position": ["warn", { "position": "legacy" }],
    "better-tailwindcss/no-unknown-classes": ["error", { "ignore": ["^swiper-"] }],
    "better-tailwindcss/no-concatenated-classes": "error"
  }
}

// After
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": { "tailwindcss": { "entryPoint": "src/styles.css" } },
  "rules": {
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-consistent-important-position": ["warn", { "position": "prefix" }],
    "tailwindcss/no-unknown-classes": ["error", { "ignorePrefixes": ["swiper-"] }],
    "tailwindcss/no-dynamic-classes": "error"
  }
}
```

## What else changes

- **Vue, Svelte and Astro templates.** In oxlint, JS plugins see only the `<script>` blocks of those
  files — better-tailwindcss run in ESLint with a framework parser reads templates too. See
  [Vue, Svelte & Astro](/frameworks).
- **Tailwind v3.** This plugin reads Tailwind v4 CSS (v4.1.15 and later); a `tailwind.config.js`
  project needs to stay on better-tailwindcss.

## Rules better-tailwindcss doesn't have

Worth a look once you've switched:

<!-- generated:btw-extra -->

[`enforce-negative-arbitrary-values`](/rules/enforce-negative-arbitrary-values) ·
[`enforce-physical`](/rules/enforce-physical) · [`max-class-count`](/rules/max-class-count) ·
[`no-arbitrary-value`](/rules/no-arbitrary-value) ·
[`no-contradicting-variants`](/rules/no-contradicting-variants) ·
[`no-dark-without-light`](/rules/no-dark-without-light) ·
[`no-default-palette`](/rules/no-default-palette) ·
[`no-hardcoded-colors`](/rules/no-hardcoded-colors) ·
[`no-unnecessary-arbitrary-value`](/rules/no-unnecessary-arbitrary-value) ·
[`prefer-scale-token`](/rules/prefer-scale-token) ·
[`prefer-theme-tokens`](/rules/prefer-theme-tokens)
<!-- /generated:btw-extra -->
