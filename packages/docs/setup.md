---
title: "Setup"
description: "Install oxlint-tailwindcss, point it at your Tailwind CSS entry file and turn on its rules: requirements, a starting config, and what each file type covers."
---

# Setup

Everything you need to get `oxlint-tailwindcss` running on a project in one page. Pick the section
that matches your repo shape — single package or monorepo — and copy the snippet.

## 1. Install

```bash
pnpm add -D oxlint oxlint-tailwindcss
```

Requirements:

- **oxlint 1.43.0** or newer.
- **Tailwind CSS v4.1.15** or newer. The plugin loads your design system via `@tailwindcss/node` and
  only understands v4 syntax (`@import "tailwindcss";`, `@theme { ... }`). It resolves _your_
  project's Tailwind per entry point; releases before 4.1.15 are not supported (they predate a
  design-system API the plugin needs) and are reported with a clear diagnostic. Insiders builds
  (`tailwindcss@insiders`) run with a one-time "untested engine" notice.
- **Node.js `^20.19.0 || >=22.12.0`** for the linter process — the same range oxlint itself
  requires.

::: warning Avoid oxlint 1.77.0 with the editor extension

oxlint **1.77.0** shipped a regression that panics the **language server** on any diagnostic from a
JS plugin — `disable_fix.rs:52`, `range end index N out of range for slice of length 0`, then
SIGABRT and a restart loop. It's an oxlint bug, not a plugin one, and the CLI is unaffected (CI and
`oxlint --fix` are fine). It's **fixed in oxlint 1.78.0**
([oxc#25280](https://github.com/oxc-project/oxc/pull/25280)) — upgrade to `oxlint@1.78.0` or newer
(or stay on `1.76.0`) if you use the editor extension.

:::

## 2. Minimal config

Create or extend your `.oxlintrc.json` at the project root:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss"],
  "rules": {
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-canonical": "warn"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

`settings.tailwindcss.entryPoint` is **required** in v1.0.0 and must point at the CSS file where you
`@import "tailwindcss";` and (optionally) declare your `@theme { ... }` tokens. The plugin reads
that file to build the design system every rule queries against.

That's it. Run `oxlint` and the plugin checks every file oxlint lints — `.js`, `.jsx`, `.ts`, `.tsx`
(and `.mjs`, `.cjs`, `.mts`, `.cts`) — against the design system loaded from `src/styles.css`. In
`.vue`, `.svelte` and `.astro` files oxlint only hands plugins the `<script>` blocks (and Astro's
frontmatter), so classes written in the template or markup are **not** checked yet. See
[Vue, Svelte & Astro](/frameworks).

## 3. Recommended starter rule set

If you want a "blessed" set that catches problems without being noisy, turn these on. It is
generated from each rule's `recommended` severity, so it always matches the rules:

<!-- generated:recommended-config -->

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  },
  "rules": {
    // Correctness
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-contradicting-variants": "warn",
    "tailwindcss/no-dark-without-light": "warn",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/no-dynamic-classes": "error",
    "tailwindcss/no-unknown-classes": "error",
    // Modernization
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-negative-arbitrary-values": "warn",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    // Consistency
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/enforce-consistent-variable-syntax": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn",
    // Design-system guardrails
    "tailwindcss/no-hardcoded-colors": "warn"
  }
}
```

<!-- /generated:recommended-config -->

Layer in extra rules as you go:

- `enforce-logical` / `enforce-physical` if you have a direction preference.
- `no-arbitrary-value`, `no-restricted-classes` and `max-class-count` if you want stricter
  design-system guardrails.
- `prefer-theme-tokens` and `prefer-scale-token` to push named utilities over `var()` references and
  hardcoded values.

The full catalog is at [Rules](/rules/). Each rule page documents the exact behavior, the available
options, and ✓ / ✗ examples.

## 4. Validate the setup

The fastest sanity check is to misspell a class on purpose:

```tsx
<div className="flx items-cetner" />
```

oxlint should flag both classes with `no-unknown-classes`, and the `flex` / `items-center`
suggestions should appear in your editor.

If you see a `designSystemUnavailable` diagnostic instead, the `entryPoint` setting is missing or
points at a file the plugin can't read. The diagnostic message tells you exactly which path it tried
— copy that into your `entryPoint` setting. A relative `entryPoint` is resolved against the
directory of the nearest enclosing `.oxlintrc.json` (the config that declares it), falling back to
the directory where you run `oxlint`.

## 5. Monorepo setups

If you have one `.oxlintrc.json` at the root and multiple Tailwind CSS files across packages, use
the mapping shape — first matching glob wins:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**",    "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**", "use": "packages/admin/src/admin.css" },
        { "files": "packages/web/**",   "use": "packages/web/src/app.css" },
        { "files": "**",                "use": "src/global.css" }
      ]
    }
  }
}
```

Add a `"**"` fallback at the end so any file outside the explicit globs resolves to a default.

If instead each package has its own `.oxlintrc.json` extending a shared base, just put
`entryPoint: "./src/styles.css"` (string) in each package's settings. See the
[monorepo guide](/monorepo) for both patterns side by side.

## 6. Coexisting with oxfmt or prettier-plugin-tailwindcss

`enforce-sort-order` sorts classes the way oxfmt and prettier-plugin-tailwindcss do **once they read
the same CSS and know your class helpers**. By default the formatters use the theme bundled in
`tailwindcss` — which doesn't know your `@theme` tokens — and sort only class attributes. Point them
at your CSS and list your helpers:

```jsonc
// .oxfmtrc.json
{ "sortTailwindcss": { "stylesheet": "./src/styles.css", "functions": ["cn", "clsx", "cva", "tv"] } }

// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles.css",
  "tailwindFunctions": ["cn", "clsx", "cva", "tv"]
}
```

Read the full [interop guide](/interop) for who formats what, the `--fix` note, and plugins like
`@tailwindcss/typography`.

## 7. Going further

- **Adjust extractors**: by default the plugin scans `className` / `class`, ~14 callees (`cn`,
  `clsx`, `cva`, `twMerge`, …), `tw` tagged templates, and variables matching `/^classNames?$/`,
  `/^classes$/`, `/^styles?$/`. Add `attributes`, `attributePatterns` (regex for `*ClassName`-style
  props), `callees`, `calleeExtractors` (route a custom wrapper through the `tv`/`cva`/`classed`
  extractor), `tags`, `variablePatterns`, or remove defaults via `exclude`. See
  [settings reference](/settings).
- **Tune timeouts**: `settings.tailwindcss.timeout` (ms, default 60000) bounds how long the plugin
  waits for the worker thread that precomputes the design system. Slow CI may need this raised.
- **Debug logging**: `settings.tailwindcss.debug: true` (or `DEBUG=oxlint-tailwindcss`) logs which
  CSS entry point resolved per linted file.
- **Which Tailwind gets used**: the plugin loads _your_ project's Tailwind engine, resolved per
  entry point, so the linter and your build agree. If the resolved engine is a major newer than the
  plugin (a future Tailwind 5) or drifts a major from your build, it fails loud;
  `settings.tailwindcss.allowUntestedEngine: true` opts into running anyway. See
  [settings reference](/settings#allowuntestedengine).
- **Upgrading from v0.x?** Read the [migration guide](/migration/v0-to-v1) — `entryPoint` is now
  required and the legacy `string[]` shape was removed.
