# `settings.tailwindcss`

Every setting lives under `settings.tailwindcss` in your `.oxlintrc.json`.

## `entryPoint` (required)

Path to the CSS file that `@import "tailwindcss";` and (optionally) your `@theme { ... }`
customizations. The plugin reads this file to build the design system every rule queries.

Required by the DS-dependent rules, which fail loudly without it. A second group is **DS-optional**:
those work with nothing configured and get more accurate when it is there — `enforce-shorthand`
verifies each merge against the emitted CSS, `no-dark-without-light` groups the base by declared
property, `no-deprecated-classes` derives its rename list, and the directional rules confirm the
class they suggest exists. See the [defaults reference](./rules/#defaults-reference) for which rule
is in which group.

Two shapes are supported:

```jsonc
// Single project
{ "settings": { "tailwindcss": { "entryPoint": "src/styles.css" } } }

// Monorepo: explicit glob → CSS mapping, first match wins
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**",    "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**", "use": "packages/admin/src/admin.css" },
        { "files": "**",                "use": "src/global.css" }
      ]
    }
  }
}
```

A **relative string** `entryPoint` (the single-project shape) is resolved against the directory of
the nearest enclosing `.oxlintrc.json`, falling back to the oxlint working directory — so a
per-package config resolves to the same CSS whether oxlint runs from the package (CLI) or the
workspace root (editor). See [Monorepos](/monorepo).

Globs (the mapping shape) are evaluated against the linted file's path relative to the oxlint
working directory. Supported syntax: `*` (any chars except `/`), `**` (any depth), literal segments.
Order matters — the first matching entry wins. Add a `"**"` fallback to handle files outside the
explicit globs.

`files` also accepts an array of globs (`string[]`): the entry matches if the linted file matches
any of them.

**v0.x → v1.0.0**: the legacy `string[]` shape was removed. Passing it in v1 throws
`DeprecatedEntryPointShapeError` with the migration snippet inline. See the
[migration guide](/migration/v0-to-v1).

## `rootFontSize`

`number`, default `16`.

The font size in pixels used to convert between px and rem inside `enforce-canonical`. Change this
only if your project sets a non-16 root size on `<html>`.

## `timeout`

`number` in milliseconds, default `60000`.

How long the plugin waits for the worker thread that precomputes the design system. Slow CI machines
may need this raised; you should not need it lowered.

## `debug`

`boolean`, default `false`. Also activated by the `DEBUG=oxlint-tailwindcss` environment variable.

When on, the plugin logs to stderr:

- Which CSS entry point resolved for each linted file.
- DS load successes and cache hits.

Use this when you're debugging which CSS the plugin actually loaded.

## Extractor configuration

The plugin scans these locations by default:

| Kind              | Defaults                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Attributes        | `className`, `class` (JSX)                                                                                         |
| Callees           | `cn`, `clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`, `ctl`, `twJoin`, `cc`, `clb`, `cnb`, `objstr`, `classed` |
| Tags              | `` tw`...` `` (tagged template literals)                                                                           |
| Variable patterns | `/^classNames?$/`, `/^classes$/`, `/^styles?$/`                                                                    |

Add more without losing the defaults:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "attributes": ["xyzClassName"],
      "callees": ["myHelper"],
      "tags": ["css"],
      "variablePatterns": ["^tw[A-Z]"]
    }
  }
}
```

Or remove from the defaults:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "exclude": {
        "callees": ["objstr"],
        "variablePatterns": ["^styles?$"]
      }
    }
  }
}
```

`variablePatterns` exclusions match against `RegExp.source` literally.

## Cheat sheet

```jsonc
{
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css",    // required
      "rootFontSize": 16,                  // optional
      "timeout": 60000,                    // optional
      "debug": false,                      // optional
      "attributes": [],                    // optional
      "callees": [],                       // optional
      "tags": [],                          // optional
      "variablePatterns": [],              // optional
      "exclude": {                         // optional
        "attributes": [],
        "callees": [],
        "tags": [],
        "variablePatterns": []
      }
    }
  }
}
```
