# Monorepos

`oxlint-tailwindcss` v1 supports two patterns for monorepos, both fully deterministic — no glob
heuristics, no auto-detect surprises. Pick whichever maps better to how your team already structures
its config.

## Pattern A — single root config with a glob mapping

One `.oxlintrc.json` at the root. `entryPoint` is an array of `{ files, use }` objects, evaluated in
declaration order; the first glob matching the linted file wins.

```jsonc
// /my-monorepo/.oxlintrc.json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["tailwindcss"],
  "rules": {
    "tailwindcss/no-unknown-classes": "error"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**",     "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**",  "use": "packages/admin/src/admin.css" },
        { "files": "packages/web/**",    "use": "packages/web/src/app.css" },
        { "files": "**",                  "use": "src/global.css" }
      ]
    }
  }
}
```

When to use this:

- All your packages share the same rule set.
- You want one source of truth for what lints how.
- You're already using oxlint's `overrides` for rule-by-rule customization at the root.

A `"**"` fallback entry at the end is recommended — without it, any file outside the explicit globs
will fail with `MissingEntryPointError`.

## Pattern B — one `.oxlintrc.json` per package

Each package owns its own config and CSS entry. oxlint resolves the closest config to the file being
linted, so per-package overrides just work.

```
my-monorepo/
├── .oxlintrc.json                       # rules base (optional entryPoint for top-level files)
├── packages/
│   ├── ui/
│   │   ├── .oxlintrc.json               # extends ../../.oxlintrc.json, sets entryPoint
│   │   ├── src/styles.css
│   │   └── src/Button.tsx
│   ├── admin/
│   │   ├── .oxlintrc.json
│   │   ├── src/admin.css
│   │   └── src/Page.tsx
│   └── shared-utils/                    # no Tailwind, no config needed
│       └── index.ts
```

```jsonc
// packages/ui/.oxlintrc.json
{
  "extends": "../../.oxlintrc.json",
  "settings": {
    "tailwindcss": { "entryPoint": "./src/styles.css" }
  }
}
```

When to use this:

- Packages diverge significantly in rules, plugins, or globals.
- Different teams own different packages and want self-contained config.
- You have packages without Tailwind that should not run the plugin at all.

## What does **not** work in v1

- `entryPoint: ["a.css", "b.css"]` — the legacy `string[]` shape was removed because its "closest
  entry by path prefix" heuristic was non-deterministic in edge cases. v1 throws
  `DeprecatedEntryPointShapeError` and prints the migration snippet directly in the diagnostic.

## Files that should not need the plugin

If a file lives in a package without any Tailwind — e.g. a pure TypeScript utility — the plugin's
DS-dependent rules will simply not fire on it, because they only run when the extractors find class
strings. There is no need to disable the plugin per-file.

## Verifying which CSS resolved per file

Set `settings.tailwindcss.debug` (or the `DEBUG=oxlint-tailwindcss` env var) and oxlint will print
one line per file showing which CSS the plugin loaded for it. Useful when a glob is matching the
wrong mapping.
