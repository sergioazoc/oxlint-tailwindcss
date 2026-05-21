# Migrating from v0.x to v1.0.0

v1.0.0 aligns `oxlint-tailwindcss` with the deterministic-config
philosophy that the rest of the ecosystem (prettier-plugin-tailwindcss,
oxfmt, better-tailwindcss) already follows. The trade-off is one
required setting in exchange for "configure once, never fails again."

This page lists every breaking change with a side-by-side before/after.

## Required: declare `entryPoint`

In v0.x, the plugin walked the filesystem looking for your CSS. In
v1.0.0 it doesn't — you tell it explicitly.

### Single project

```jsonc
// v0.x (still works in v1 if you happen to have one,
// but no longer auto-detected)
{ }

// v1.0.0
{
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

### Monorepo with multiple CSS files

```jsonc
// v0.x — array of strings, plugin picked the closest by path prefix
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        "packages/ui/src/styles.css",
        "packages/admin/src/admin.css"
      ]
    }
  }
}

// v1.0.0 — explicit glob → CSS mapping, first match wins
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**",    "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**", "use": "packages/admin/src/admin.css" }
      ]
    }
  }
}
```

The legacy `string[]` shape now throws
`DeprecatedEntryPointShapeError` at lint time, with the migration
snippet embedded directly in the diagnostic.

If your monorepo uses per-package `.oxlintrc.json` files, each with a
plain `entryPoint: "..."` string, no migration is needed for the
per-package approach — only the root-config + array form changed.
See the [monorepo guide](/monorepo) for both patterns.

## Removed: filesystem auto-detect

v0 walked up from each linted file looking for files named
`app.css`, `globals.css`, `tailwind.css`, etc. If found, the plugin
loaded that CSS automatically.

v1.0.0 removes this entirely. Two reasons:

1. Renaming or moving a CSS file silently changed lint results
   between team members.
2. It clashed with oxfmt and prettier-plugin-tailwindcss, both of
   which require explicit config. The
   [interop guide](/interop) explains why.

**Action**: add the `entryPoint` setting documented above. If you
weren't passing one in v0.x, the plugin was auto-detecting and you
need to declare what it found.

## Removed: silent fallbacks

v0.x silently skipped DS-dependent rules when the design system
couldn't load (missing `@tailwindcss/node`, invalid CSS, worker
timeout, etc.).

v1.0.0 surfaces failures as a single `designSystemUnavailable`
diagnostic per file. The message embeds an actionable hint — usually
exactly the path the plugin tried, or the timeout that was hit.

**Action**: if you see new `designSystemUnavailable` lints on the
first run, read the message. The fix is in the hint.

## Removed: heuristic-sort fallback

`enforce-sort-order` used to fall back to a prefix-based heuristic
sort when its worker thread timed out. Different machines could
produce different output for the same input.

v1.0.0 removes the fallback. If the worker fails, the rule emits a
fatal diagnostic instead of guessing.

**Action**: bump `settings.tailwindcss.timeout` if you hit timeouts
on slow CI. Default is now 60 seconds (up from 30 seconds).

## Changed: disk cache key

The disk cache (`os.tmpdir()/oxlint-tailwindcss/`) used to combine an
mtime index with a content cache. v1.0.0 keys by content hash only —
mtime is an in-memory fast path inside the linter process.

**Action**: clear `os.tmpdir()/oxlint-tailwindcss/` once after
upgrading. Stale v0.x `.idx` files are harmless but waste disk.

## Changed: timeouts

Default values raised to reduce spurious failures on slower
hardware / CI:

| Constant                                  | v0.x | v1.0.0 |
|-------------------------------------------|------|--------|
| `loadDesignSystemSync` timeout            | 30 s | 60 s   |
| `sort-service` init timeout               | 30 s | 60 s   |
| `sort-service` request timeout            | 10 s | 30 s   |
| `canonicalize-service` init timeout       | 30 s | 60 s   |
| `canonicalize-service` request timeout    | 10 s | 30 s   |

All overridable via `settings.tailwindcss.timeout`.

## Changed: `enforce-physical` accepts options

To bring it into shape parity with `enforce-logical`:

```jsonc
// v0.x — no options
{ "tailwindcss/enforce-physical": "warn" }

// v1.0.0
{
  "tailwindcss/enforce-physical": [
    "warn",
    {
      "allowlist": ["^ml-auto$"],     // regex patterns (as strings)
      "direction": "both"              // 'inline' | 'block' | 'both'
    }
  ]
}
```

`enforce-logical` gained the same two options.

## What did *not* change

- Every rule name, `messageId`, and `data` field is unchanged.
  `enforce-sort-order` still emits `unsorted`, `no-unknown-classes`
  still emits `unknown`, etc.
- Default extractor patterns (attributes, callees, tags, variable
  patterns) are the same. Custom `attributes`, `callees`, `tags`,
  `variablePatterns` and `exclude` settings work as before.
- The disk-cache path (`os.tmpdir()/oxlint-tailwindcss/`) is the
  same.
- Performance: the runtime cost per file is unchanged or slightly
  faster (fewer fallback branches).

## Need help?

- Read the [settings reference](/settings) for every option.
- See the [monorepo guide](/monorepo) for multi-CSS setups.
- File an issue at
  [github.com/sergioazoc/oxlint-tailwindcss](https://github.com/sergioazoc/oxlint-tailwindcss/issues)
  with your config snippet if the migration leaves something
  unclear.
