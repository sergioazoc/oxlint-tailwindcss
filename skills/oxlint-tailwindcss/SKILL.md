---
name: oxlint-tailwindcss
description: Set up oxlint-tailwindcss — Tailwind CSS v4 lint rules for oxlint — in a project, and act on its diagnostics. Use when a project uses Tailwind CSS v4 and oxlint, when adding Tailwind class linting, or when fixing `tailwindcss(...)` diagnostics.
---

# oxlint-tailwindcss

An oxlint plugin that checks Tailwind CSS v4 classes against the project's own design system: that
each class exists, that classes don't override each other, that they aren't deprecated, and that
colors and values come from the theme. It reads the project's Tailwind build, so it knows its custom
utilities, variants and theme. It runs under oxlint only; there is no ESLint version.

Docs: https://oxlint-tailwindcss.pages.dev — every page is also plain markdown at the same path with
`.md` (https://oxlint-tailwindcss.pages.dev/setup.md), and
https://oxlint-tailwindcss.pages.dev/llms.txt lists them.

## Set it up

1. **Check the requirements.** Tailwind CSS v4.1.15 or newer, with its CSS entry point — Tailwind v3
   and `tailwind.config.js` projects are not supported. oxlint 1.43.0 or newer, and Node
   `^20.19.0 || >=22.12.0`.
2. **Install**, with the project's package manager:

   ```bash
   npm install -D oxlint oxlint-tailwindcss
   ```

3. **Find the entry point**: the CSS file with `@import "tailwindcss"` (often `src/index.css`,
   `app/globals.css` or `src/styles.css`). It is required: the plugin never guesses it.
4. **Configure** `.oxlintrc.json` with the plugin, the entry point and the recommended rules.
   `categories` don't turn on a JS plugin's rules: only the rules listed run.

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

5. **Run** `npx oxlint`. A `designSystemUnavailable` diagnostic means the entry point is wrong or
   missing: its message says which, and how to fix it.

In a monorepo, map each package's files to its own CSS, or give each package its own
`.oxlintrc.json`: https://oxlint-tailwindcss.pages.dev/monorepo.md. For shadcn/ui projects, the
combined config with @shadcn/lint is at https://oxlint-tailwindcss.pages.dev/shadcn.md.

## Act on a diagnostic

Each message says what is wrong and, where there is one, the replacement. Fix the code, not the
rule: turn a rule off only when the project decided so, and for one line use
`// oxlint-disable-next-line tailwindcss/<rule>`.

| Diagnostic                                                        | What to do                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `no-unknown-classes`                                              | A typo, or a class from CSS the entry point doesn't import. Use the suggestion (`Did you mean …?`), or import that CSS from the entry point; `allowlist` is for classes that are hooks for JavaScript. |
| `no-conflicting-classes`                                          | Two classes set the same property and one always wins. Remove the one the message says has no effect.                                                                                                  |
| `no-deprecated-classes`, `enforce-canonical`                      | Replace the class with the one the message names; `oxlint --fix` does it.                                                                                                                              |
| `no-dynamic-classes`                                              | A class built at runtime (`` `bg-${color}-500` ``) gets no CSS. Map each value to a full class name instead.                                                                                           |
| `no-default-palette`, `no-hardcoded-colors`, `no-arbitrary-value` | A color or value from outside the theme. Use one of the theme colors the message lists, or a theme token.                                                                                              |
| `no-dark-without-light`                                           | A `dark:` color with no light one. Add the light-mode class.                                                                                                                                           |
| `no-borrowed-component-styles`                                    | A plain element that rebuilds one of the project's components. Use the component the message names.                                                                                                    |
| `designSystemUnavailable`                                         | The design system couldn't load. Fix `settings.tailwindcss.entryPoint` as the message says.                                                                                                            |

## Fix with `--fix`

`oxlint --fix` applies each rule's autofix: sorting, duplicates, whitespace, deprecated and
non-canonical names, shorthands. On the shadcn/ui corpus of the benchmark, every class string it
changed kept its style (https://oxlint-tailwindcss.pages.dev/benchmark.md). oxlint applies one fix
per class string per run, so run it again until nothing changes. `oxlint --fix --fix-suggestions`
also applies suggestions, such as typo corrections: review those, since they change what the classes
do.

## Good to know

- Only the `<script>` of `.vue`, `.svelte` and `.astro` files is linted, not their templates:
  https://oxlint-tailwindcss.pages.dev/frameworks.md.
- Classes are read from `className`/`class`, from `cn()`, `clsx()`, `cva()`, `tv()` and the other
  helpers (~14 callees), and from `tw` templates; `settings.tailwindcss` adds others:
  https://oxlint-tailwindcss.pages.dev/settings.md.
- The design system is computed once per entry point and cached on disk; in CI, keep the cache
  between jobs: https://oxlint-tailwindcss.pages.dev/ci.md.
- It works alongside oxfmt's or prettier-plugin-tailwindcss's class sorting:
  https://oxlint-tailwindcss.pages.dev/interop.md.
