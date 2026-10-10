---
title: "Migrating from eslint-plugin-tailwindcss"
description: "Move from eslint-plugin-tailwindcss to oxlint-tailwindcss: each of its rules and settings mapped, what differs, and the switch from ESLint step by step."
---

# Migrating from eslint-plugin-tailwindcss

[eslint-plugin-tailwindcss](https://github.com/francoismassart/eslint-plugin-tailwindcss) is the
ESLint plugin for Tailwind CSS; its 4.x releases read Tailwind v4. oxlint-tailwindcss is built for
oxlint and Tailwind v4. Each of eslint-plugin-tailwindcss 4.4.0's 9 rules has a counterpart here,
and each pair reports the same example — the tables below are checked against it every week, with
its latest release.

## Rules

<!-- generated:eptw-rules -->

| eslint-plugin-tailwindcss            | oxlint-tailwindcss                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classnames-order`                   | [`enforce-sort-order`](/rules/enforce-sort-order)                                       | Both sort by Tailwind's own class order, the one prettier-plugin-tailwindcss uses. `mode: "strict"` also groups classes by variant chain.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `enforces-canonical-classname`       | [`enforce-canonical`](/rules/enforce-canonical)                                         | Both ask Tailwind for the canonical form, but this rule rewrites a class only when the two print the same CSS: `[&>*]:flex-1` → `*:flex-1` (another selector) and `aspect-[16/9]` → `aspect-video` (a theme variable) stay as written. The rest of what theirs folds in has its own rule here: v3 renames (`bg-gradient-to-r`) are `no-deprecated-classes`, `bg-[var(--x)]` → `bg-(--x)` is `enforce-consistent-variable-syntax`, `!p-4` → `p-4!` is `enforce-consistent-important-position`, and `-m-[5px]` → `m-[-5px]` is `enforce-negative-arbitrary-values`. |
| `enforces-negative-arbitrary-values` | [`enforce-negative-arbitrary-values`](/rules/enforce-negative-arbitrary-values)         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `enforces-shorthand`                 | [`enforce-shorthand`](/rules/enforce-shorthand)                                         | Their `overflow-hidden text-ellipsis whitespace-nowrap` → `truncate` has no equivalent here. Four corners or sides become one class at once (`rounded-tl-md rounded-tr-md rounded-br-md rounded-bl-md` → `rounded-md`), where theirs merges them two by two.                                                                                                                                                                                                                                                                                                      |
| `important-modifier-suffix`          | [`enforce-consistent-important-position`](/rules/enforce-consistent-important-position) | The suffix (`p-4!`) is the default here too; `position: "prefix"` asks for `!p-4` instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `no-arbitrary-value`                 | [`no-arbitrary-value`](/rules/no-arbitrary-value)                                       | Off in both recommended configs. Here `allow` tolerates arbitrary values under the prefixes you list (`grid-cols-`), `allowVariables` a value that is only a CSS variable, and the message names the closest values in your theme.                                                                                                                                                                                                                                                                                                                                |
| `no-contradicting-classname`         | [`no-conflicting-classes`](/rules/no-conflicting-classes)                               | Decided from the CSS each class prints, and the message names the class that wins. It also reports a class another one makes redundant (`reportRedundant`), and `allow` exempts pairs. A variant that repeats its base class (`flex hover:flex`) is `no-contradicting-variants`.                                                                                                                                                                                                                                                                                  |
| `no-custom-classname`                | [`no-unknown-classes`](/rules/no-unknown-classes)                                       | `whitelist` → `allowlist` for exact names and `ignorePrefixes` for families (`custom-`); a regular expression that is neither has no counterpart. The classes your CSS defines (`@layer components`, `@utility`) are always known, and a typo gets the closest class as a suggestion.                                                                                                                                                                                                                                                                             |
| `no-unnecessary-arbitrary-value`     | [`no-unnecessary-arbitrary-value`](/rules/no-unnecessary-arbitrary-value)               | This rule rewrites only when the named class prints the same CSS. Theirs also turns a value equal to a scale step or a theme value into its token (`m-[8px]` → `m-2`, `w-[20rem]` → `w-xs`): here that is `prefer-scale-token`, as a suggestion, since the token reads a variable your theme can change. `z-[123]` → `z-123` is `enforce-canonical`.                                                                                                                                                                                                              |

<!-- /generated:eptw-rules -->

## Settings

Both plugins read `settings.tailwindcss`, with different keys:

<!-- generated:eptw-settings -->

| eslint-plugin-tailwindcss | oxlint-tailwindcss                | Notes                                                                                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cssConfigPath`           | `entryPoint`                      | Required in both. A relative path resolves against the nearest oxlint config here, and against the nearest `eslint.config.*` or `package.json` in theirs. A glob → CSS mapping covers a monorepo.                                                                                                             |
| `attributes`              | `attributes`, `attributePatterns` | Setting theirs replaces its defaults (`class`, `className`, `ngClass`, `@apply`); here `attributes` adds to `class` and `className`, and `attributePatterns` matches names with regular expressions. `ngClass` and `@apply` have nothing to match: oxlint hands JS plugins neither Angular templates nor CSS. |
| `functions`               | `callees`, `tags`                 | Theirs is one list for calls and tagged templates, and setting it replaces the defaults; `callees` and `tags` add to this plugin's. Of their defaults, `classNames(…)` and `tw(…)` as a call aren't read here: add them to `callees` if you use them.                                                         |
| `parseKeyFunctions`       | —                                 | The keys of an object passed to any callee are read as classes (`cn({ "p-4": isOpen })`), and its values aren't. Theirs reads the keys only in these functions (by default `classnames`, `classNames`, `clsx`) and the values elsewhere.                                                                      |
| `ignoredKeys`             | —                                 | `cva` and `tv` configs are read by their structure: `defaultVariants` is skipped, `compoundVariants` and `compoundSlots` are read.                                                                                                                                                                            |
| `cacheMaxSize`            | —                                 | The design system is cached on disk, keyed by the content of your CSS, and rebuilt when it changes: there is nothing to tune.                                                                                                                                                                                 |
| `cacheMaxAge`             | —                                 | Same as `cacheMaxSize`.                                                                                                                                                                                                                                                                                       |

<!-- /generated:eptw-settings -->

## Switching, step by step

1. Install oxlint and the plugin: `pnpm add -D oxlint oxlint-tailwindcss`.
2. Create `.oxlintrc.json` with `"jsPlugins": ["oxlint-tailwindcss"]`, and turn
   `settings.tailwindcss` into this plugin's keys with the settings table: `cssConfigPath` becomes
   `entryPoint`, which is required.
3. Rename each `tailwindcss/<rule>` to the `tailwindcss/<rule>` of the rules table — both plugins
   use the `tailwindcss` prefix. Or start from the [recommended config](/setup) and add what you had
   on top.
4. Remove eslint-plugin-tailwindcss from your ESLint config and uninstall it. Both plugins are named
   `tailwindcss`, so oxlint won't load the two side by side: it stops with
   `Plugin name 'tailwindcss' is already registered`.
5. Run `oxlint`, then `oxlint --fix` for the autofixes.

A typical config, before:

```js
// eslint.config.mjs
import tailwindcss from "eslint-plugin-tailwindcss";
import { defineConfig } from "eslint/config";

export default defineConfig([
  tailwindcss.configs.recommended,
  {
    settings: {
      tailwindcss: {
        cssConfigPath: "./src/styles.css",
        functions: ["cn", "cva", "classNames"],
      },
    },
    rules: {
      "tailwindcss/no-custom-classname": ["warn", { whitelist: ["swiper-.*", "legacy-card"] }],
      "tailwindcss/no-arbitrary-value": "warn",
    },
  },
]);
```

And after, with the rules the recommended config turned on:

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": {
    "tailwindcss": { "entryPoint": "src/styles.css", "callees": ["classNames"] }
  },
  "rules": {
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-negative-arbitrary-values": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/no-unknown-classes": [
      "warn",
      { "ignorePrefixes": ["swiper-"], "allowlist": ["legacy-card"] }
    ],
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/no-arbitrary-value": "warn"
  }
}
```

## What else changes

- **Vue and Svelte templates.** Their recommended config lints `.vue` and `.svelte` files, templates
  included, through ESLint's parsers. In oxlint, JS plugins see only the `<script>` blocks of those
  files. See [Vue, Svelte & Astro](/frameworks).
- **Classes in variables.** This plugin also reads the strings assigned to `className`, `classes` or
  `styles` (`variablePatterns`), which theirs leaves alone, so expect reports there too.
- **Tailwind v3.** This plugin reads Tailwind v4 CSS (v4.1.15 and later); a `tailwind.config.js`
  project needs to stay on eslint-plugin-tailwindcss 3.x.

## Rules eslint-plugin-tailwindcss doesn't have

Worth a look once you've switched:

<!-- generated:eptw-extra -->

[`consistent-variant-order`](/rules/consistent-variant-order) ·
[`enforce-consistent-line-wrapping`](/rules/enforce-consistent-line-wrapping) ·
[`enforce-consistent-variable-syntax`](/rules/enforce-consistent-variable-syntax) ·
[`enforce-logical`](/rules/enforce-logical) · [`enforce-physical`](/rules/enforce-physical) ·
[`max-class-count`](/rules/max-class-count) ·
[`no-borrowed-component-styles`](/rules/no-borrowed-component-styles) ·
[`no-contradicting-variants`](/rules/no-contradicting-variants) ·
[`no-dark-without-light`](/rules/no-dark-without-light) ·
[`no-default-palette`](/rules/no-default-palette) ·
[`no-deprecated-classes`](/rules/no-deprecated-classes) ·
[`no-duplicate-classes`](/rules/no-duplicate-classes) ·
[`no-dynamic-classes`](/rules/no-dynamic-classes) ·
[`no-hardcoded-colors`](/rules/no-hardcoded-colors) ·
[`no-restricted-classes`](/rules/no-restricted-classes) ·
[`no-unnecessary-whitespace`](/rules/no-unnecessary-whitespace) ·
[`prefer-scale-token`](/rules/prefer-scale-token) ·
[`prefer-theme-tokens`](/rules/prefer-theme-tokens)
<!-- /generated:eptw-extra -->
