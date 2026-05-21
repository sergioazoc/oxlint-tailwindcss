# Defaults reference

Every rule declares its `meta.defaultOptions` when it accepts options.
The table below shows the runtime defaults at a glance — what the rule
behaves like when you turn it on without overriding anything.

## DS-dependent rules

These rules require `settings.tailwindcss.entryPoint` to be set; in
v1 they emit a fatal `designSystemUnavailable` diagnostic when it
isn't.

| Rule | Default options |
|---|---|
| `enforce-canonical` | `{}` |
| `enforce-sort-order` | `{ mode: 'default' }` |
| `no-conflicting-classes` | `{}` |
| `no-deprecated-classes` | `{}` |
| `no-unknown-classes` | `{ allowlist: [], ignorePrefixes: [] }` |
| `no-unnecessary-arbitrary-value` | `{}` |
| `prefer-theme-tokens` | `{}` |

`consistent-variant-order` is DS-optional — when no entryPoint is
declared, it falls back to a built-in static order (which is itself
deterministic).

## DS-independent rules

| Rule | Default options |
|---|---|
| `consistent-variant-order` | `{}` (DS-derived order when available) |
| `enforce-consistent-important-position` | `{ position: 'suffix' }` |
| `enforce-consistent-line-wrapping` | `{ classesPerLine: 0, group: 'preserve' }` |
| `enforce-consistent-variable-syntax` | `{ syntax: 'shorthand' }` |
| `enforce-logical` | `{ allowlist: [], direction: 'both' }` |
| `enforce-negative-arbitrary-values` | (no options) |
| `enforce-physical` | `{ allowlist: [], direction: 'both' }` |
| `enforce-shorthand` | (no options) |
| `max-class-count` | `{ max: 5 }` |
| `no-arbitrary-value` | `{ allow: [] }` |
| `no-contradicting-variants` | (no options) |
| `no-dark-without-light` | `{ requireLight: true }` |
| `no-duplicate-classes` | (no options) |
| `no-hardcoded-colors` | `{ allow: [] }` |
| `no-restricted-classes` | `{ classes: [], patterns: [] }` |
| `no-unnecessary-whitespace` | (no options) |

## Recommended starter config

If you want a "blessed" starting point, this covers most projects:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["tailwindcss"],
  "rules": {
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn",
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

Layer in `enforce-logical` / `enforce-physical` if you have a
direction preference, and `no-restricted-classes` /
`no-hardcoded-colors` if you want to enforce design-system discipline.
