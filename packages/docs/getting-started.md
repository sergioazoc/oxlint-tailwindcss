# Getting started

## Install

```bash
pnpm add -D oxlint oxlint-tailwindcss
```

The plugin works with oxlint 1.43.0 or newer.

## Configure

Add the plugin and rules to your `.oxlintrc.json` and declare a single
required setting — `settings.tailwindcss.entryPoint` pointing at the
CSS file where you `@import "tailwindcss";`:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["tailwindcss"],
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

That's it. Run `oxlint` and the plugin will load your Tailwind design
system from `src/styles.css` and lint every JS / TS / JSX / TSX /
Vue / Svelte file in your project against it.

## Validate the setup

The fastest sanity check is to misspell a class on purpose:

```tsx
<div className="flx items-cetner" />
```

oxlint should flag both classes with `no-unknown-classes`, and the
`flex` and `items-center` suggestions should appear in your editor.

If you see a `designSystemUnavailable` diagnostic instead, the
`entryPoint` setting is missing or points at a file the plugin can't
read. The diagnostic message tells you exactly which path it tried.

## Common patterns

- **Single project**: one `entryPoint: "src/styles.css"` string and
  you're done.
- **Monorepo, single config**: use the
  [mapping array shape](/monorepo).
- **Coexisting with oxfmt or prettier-plugin-tailwindcss**: see
  [interop](/interop).

## What's next

- Browse the [rules catalog](/rules/) and pick the ones that match your
  style.
- See the full [settings reference](/settings) for `attributes`,
  `callees`, `tags`, `variablePatterns`, `exclude`, `timeout`,
  `rootFontSize`, and `debug`.
- Upgrading from v0.x? Read the
  [migration guide](/migration/v0-to-v1).
