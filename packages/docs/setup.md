# Setup

Everything you need to get `oxlint-tailwindcss` running on a project in one page. Pick the section
that matches your repo shape — single package or monorepo — and copy the snippet.

## 1. Install

```bash
pnpm add -D oxlint oxlint-tailwindcss
```

Requirements:

- **oxlint 1.43.0** or newer.
- **Tailwind CSS v4**. The plugin loads your design system via `@tailwindcss/node` and only
  understands v4 syntax (`@import "tailwindcss";`, `@theme { ... }`).
- **Node.js 20** or newer for the linter process itself.

::: warning Avoid oxlint 1.77.0 with the editor extension oxlint **1.77.0** shipped a regression
that panics the **language server** on any diagnostic from a JS plugin — `disable_fix.rs:52`,
`range end index N out of range for slice of length 0`, then SIGABRT and a restart loop. It's an
oxlint bug, not a plugin one, and the CLI is unaffected (CI and `oxlint --fix` are fine). It's
**fixed in oxlint 1.78.0** ([oxc#25280](https://github.com/oxc-project/oxc/pull/25280)) — upgrade to
`oxlint@1.78.0` or newer (or stay on `1.76.0`) if you use the editor extension. :::

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

That's it. Run `oxlint` and the plugin lints every JS / TS / JSX / TSX / Vue / Svelte file in your
project against the design system loaded from `src/styles.css`.

## 3. Recommended starter rule set

If you want a "blessed" set that catches problems without being noisy, turn these on:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss"],
  "rules": {
    // Correctness — catch real bugs
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/no-unknown-classes": "error",

    // Modernization — keep classes in current canonical form
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",

    // Style and consistency
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

Layer in extra rules as you go:

- `enforce-logical` / `enforce-physical` if you have a direction preference.
- `no-arbitrary-value`, `no-hardcoded-colors`, `no-restricted-classes` if you want to enforce
  design-system discipline.
- `prefer-theme-tokens` to push named utilities over `var()` references.

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

`enforce-sort-order` agrees byte-for-byte with oxfmt and prettier-plugin-tailwindcss **if all three
tools read the same CSS**. By default, oxfmt and the prettier plugin use the bundled
`tailwindcss/theme.css` — which doesn't know about your custom `@theme` tokens. Point them at your
CSS:

```jsonc
// .oxfmtrc.json
{ "sortTailwindcss": { "stylesheet": "./src/styles.css" } }

// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles.css"
}
```

Read the full [interop guide](/interop) for the why and edge cases around tagged template tags and
plugins like `@tailwindcss/typography`.

## 7. Going further

- **Adjust extractors**: by default the plugin scans `className` / `class`, ~14 callees (`cn`,
  `clsx`, `cva`, `twMerge`, …), `tw` tagged templates, and variables matching `/^classNames?$/`,
  `/^classes$/`, `/^styles?$/`. Add `attributes`, `callees`, `tags`, `variablePatterns`, or remove
  defaults via `exclude`. See [settings reference](/settings).
- **Tune timeouts**: `settings.tailwindcss.timeout` (ms, default 60000) bounds how long the plugin
  waits for the worker thread that precomputes the design system. Slow CI may need this raised.
- **Debug logging**: `settings.tailwindcss.debug: true` (or `DEBUG=oxlint-tailwindcss`) logs which
  CSS entry point resolved per linted file.
- **Upgrading from v0.x?** Read the [migration guide](/migration/v0-to-v1) — `entryPoint` is now
  required and the legacy `string[]` shape was removed.
