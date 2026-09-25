---
title: "Settings"
description: "Every settings.tailwindcss option of oxlint-tailwindcss — entryPoint, rootFontSize, timeout, debug and the class extractor — plus its environment variables."
---

# `settings.tailwindcss`

Every setting lives under `settings.tailwindcss` in your `.oxlintrc.json`. Settings are read for
each linted file, so a nested `.oxlintrc.json` can give one package its own values — see
[different options and settings per package](/monorepo#different-options-and-settings-per-package).

oxlint doesn't check `settings`, so the plugin does: a key it doesn't know, a value of the wrong
type, a pattern that isn't a regular expression or an unknown `calleeExtractors` kind is reported
once per file, on its first line, by the first rule that lints it (`invalidSetting`):

```text
Check settings.tailwindcss: "rootfontsize" is not a setting (did you mean "rootFontSize"?)
```

A bad `entryPoint` is reported by the rules that need the design system, with a hint on how to fix
it (`designSystemUnavailable`).

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

The font size in pixels used to convert between px and rem. `prefer-scale-token` uses it to compare
a px value against the rem-based scale (`p-[10px]` → `p-2.5`), and `enforce-canonical` passes it to
Tailwind's canonicalizer. Change this only if your project sets a non-16 root size on `<html>`.

## `timeout`

`number` in milliseconds, default `60000`.

How long the plugin waits for the worker thread that precomputes the design system. Slow CI machines
may need this raised; you should not need it lowered.

This governs the **precompute loader** only. The sort / canonicalize / declaration worker services
that the design-system-dependent rules use while linting have their own **30 s per-request** timeout
that this setting does not move. If a slow-but-functional machine or CI runner reports
`worker request timed out after 30000ms` on valid class lists, raise it with the
`OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT` environment variable (milliseconds) so the request
completes instead of failing:

```bash
OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT=60000 oxlint
```

A timeout no longer costs O(files): after a few consecutive timeouts for one entry point the rest of
the run fails fast, and the state self-heals once the machine recovers.

## `debug`

`boolean`, default `false`. Also activated by the `DEBUG=oxlint-tailwindcss` environment variable.

When on, the plugin logs to stderr:

- Which CSS entry point resolved for each linted file (`src/Button.tsx → src/styles.css`).
- Each design-system load, once per entry point per run (`Loaded design system from "…"`) — the same
  line whether it came from the disk cache or a fresh precompute.
- The Tailwind engine check for each entry point (`engine E=4.3.3 B=4.3.3 → ok`).

Use this when you're debugging which CSS the plugin actually loaded.

## `allowUntestedEngine`

`boolean`, default `false`.

The plugin loads **your** Tailwind engine — the `@tailwindcss/node` resolved from the project around
each entry point, per entry point (so a monorepo's packages can be on different Tailwind versions).
It grades that engine against the version it was built for:

- **Older than Tailwind v4.1.15** → fatal (`designSystemUnavailable`). Not affected by this flag
  (older releases lack a design-system API the plugin needs).
- **A major newer than the plugin** (e.g. a future Tailwind 5), or a **major-version drift** between
  the engine and the `tailwindcss` your build uses → fatal by default.
- **A newer minor**, a Tailwind **insiders build** (`0.0.0-insiders.*`), or a **minor-level drift**
  from your build → a one-time stderr warning; the plugin lints best-effort.
- **In range and aligned** → silent.

Set this to `true` to downgrade the future-major / major-drift **fatals** to a warning and lint
anyway (results may be inaccurate against an untested engine). An engine older than v4.1.15 stays
fatal regardless.

```jsonc
{
  "settings": {
    "tailwindcss": {
      "allowUntestedEngine": true
    }
  }
}
```

## Extractor configuration

The plugin scans these locations by default:

| Kind              | Defaults                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Attributes        | `className`, `class` (JSX)                                                                                         |
| Callees           | `cn`, `clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`, `ctl`, `twJoin`, `cc`, `clb`, `cnb`, `objstr`, `classed` |
| Tags              | `` tw`...` `` (tagged template literals)                                                                           |
| Variable patterns | `/^classNames?$/`, `/^classes$/`, `/^styles?$/`                                                                    |

`attributes`, `callees`, and `tags` match **exact names**. Two axes match by **regex**, and their
scope differs — mind which one you want:

- **`attributePatterns`** matches **JSX attribute names**. Use it for `*ClassName` conventions so
  you don't list every prop — e.g. `["ClassName$"]` catches `contentContainerClassName` and
  `tintColorClassName` on React Native / Uniwind components. Additive to the exact `attributes`
  list; empty by default, so exact matching stays the default.
- **`variablePatterns`** matches **variable declaration names only** (`const fooClassName = "..."`),
  **not** JSX attributes. Its default `/^classNames?$/` overlaps in spelling with the `className`
  attribute, but the two are unrelated — a `variablePatterns` entry never affects JSX props.

Add more without losing the defaults:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "attributes": ["xyzClassName"],
      "attributePatterns": ["ClassName$"],
      "callees": ["myHelper"],
      "tags": ["css"],
      "variablePatterns": ["^tw[A-Z]"]
    }
  }
}
```

Or remove from the defaults with `exclude`, which takes `attributes`, `callees`, `tags` and
`variablePatterns`:

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

### Structured wrappers (`calleeExtractors`)

`cva`, `tv`, and `classed` are extracted with dedicated logic that understands each helper's config
shape (`base`, `slots`, `variants`, `compoundVariants`, …). If a shared package re-exports one of
them under your own name, map that name to the structure it follows so it gets the same deep
extraction — without renaming imports at every call site:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "calleeExtractors": {
        "defineStyles": "tv",     // reads base / slots / variants / compoundVariants
        "makeVariants": "cva",    // reads base / variants / compoundVariants
        "styledEl": "classed",    // skips the first (element-type) argument
        "cnx": "flat"             // plain cn/clsx/twMerge-style extraction
      }
    }
  }
}
```

Mapped names are registered as callees automatically — no need to list them in `callees` as well. A
value must be one of `tv`, `cva`, `classed`, or `flat`; any other value is ignored rather than
throwing. The reserved names `tv`, `cva`, and `classed` always use their built-in extractor and
can't be remapped.

## Environment variables

For what doesn't belong in a shared config file — CI tuning and one-off debugging:

| Variable                                    | Effect                                                                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEBUG=oxlint-tailwindcss`                  | Same as [`debug: true`](#debug), for every file.                                                                                                                                                                            |
| `OXLINT_TAILWINDCSS_CACHE_DIR`              | Where the design-system disk cache lives. Default: a per-user directory in the system temp dir (`oxlint-tailwindcss-<uid>`, the user name on Windows). Set it to keep the cache between CI jobs — see [Running in CI](/ci). |
| `OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT` | Per-request timeout of the worker services, in milliseconds (default `30000`). See [`timeout`](#timeout). A value that isn't a positive number is ignored.                                                                  |

A cache directory the plugin creates is private to its owner (`0700`). If you point the variable at
an existing directory, make sure no one else can write to it: what the cache holds feeds the
autofixes.

## Cheat sheet

```jsonc
{
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css",    // required
      "rootFontSize": 16,                  // optional
      "timeout": 60000,                    // optional
      "debug": false,                      // optional
      "allowUntestedEngine": false,        // optional
      "attributes": [],                    // optional
      "attributePatterns": [],             // optional
      "callees": [],                       // optional
      "calleeExtractors": {},              // optional (name → tv|cva|classed|flat)
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
