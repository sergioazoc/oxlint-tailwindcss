<div align="center">

# oxlint-tailwindcss

**Tailwind CSS v4 linting rules for [oxlint](https://oxc.rs/docs/guide/usage/linter)** — fast,
deterministic, with typo suggestions and autofixes.

[![npm version](https://img.shields.io/npm/v/oxlint-tailwindcss?color=cb0000&label=npm)](https://www.npmjs.com/package/oxlint-tailwindcss)
[![npm downloads](https://img.shields.io/npm/dm/oxlint-tailwindcss?color=cb0000)](https://www.npmjs.com/package/oxlint-tailwindcss)
[![license](https://img.shields.io/npm/l/oxlint-tailwindcss?color=blue)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-oxlint--tailwindcss.pages.dev-2563eb)](https://oxlint-tailwindcss.pages.dev)

[Documentation](https://oxlint-tailwindcss.pages.dev) ·
[Documentación (ES)](https://oxlint-tailwindcss.pages.dev/es) · [Rules](#rules) ·
[Changelog](./packages/oxlint-tailwindcss/CHANGELOG.md)

</div>

---

27 lint rules that catch invalid classes, conflicts, and deprecated utilities, and keep your class
strings canonical and sorted — reading your real Tailwind v4 design system (`@theme` tokens, shadcn
variables, typography plugin) for exact, machine-independent results.

```tsx
// oxlint-tailwindcss flags this:
<div className="flex itms-center bg-blu-500 text-red-500 text-blue-500 flex-grow" />
//                   ^^^^^^^^^^^ "itms-center" → did you mean "items-center"?  (no-unknown-classes)
//                               ^^^^^^^^^^ "bg-blu-500" → did you mean "bg-blue-500"?
//                  text-red-500 / text-blue-500 both set "color"             (no-conflicting-classes)
//                                                              ^^^^^^^^^ "flex-grow" is deprecated in v4 → "grow"  (no-deprecated-classes)

// ...and autofixes this:
<div className="text-red-500 flex items-center p-4" />   →   <div className="flex items-center p-4 text-red-500" />
//   (enforce-sort-order — identical output to oxfmt and prettier-plugin-tailwindcss)
```

## Why

- **Configure once, never fails** — declare your CSS entry point and every rule reads the same
  design system. Same input → same output on every machine and CI.
- **Built for Tailwind v4** — reads your `@theme { … }` tokens, shadcn variables, and
  `@plugin`/`@import` plugins (`@tailwindcss/typography`, `tailwindcss-animate`, `tw-animate-css`).
- **Coexists with oxfmt & Prettier** — point every tool at the same CSS and list your class helpers
  in the formatter, and they sort the same way.
  [Interop guide ↗](https://oxlint-tailwindcss.pages.dev/interop)
- **Monorepo-ready** — one root config with a glob → CSS mapping, or one `.oxlintrc.json` per
  package. Both fully deterministic.
- **Fail loud** — misconfiguration surfaces as a single `designSystemUnavailable` diagnostic with an
  actionable hint, never silently skipped rules, and a misspelt setting is named with the one you
  meant.
- **Lightweight & fast** — native oxlint plugin with content-hash disk caching; only two runtime
  dependencies (`@tailwindcss/node`, `tailwindcss`).

## Quick start

```bash
pnpm add -D oxlint-tailwindcss
```

Add the plugin and your Tailwind entry point to `.oxlintrc.json`:

```jsonc
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css", // your CSS file with @import "tailwindcss"
    },
  },
  "rules": {
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/enforce-sort-order": "warn",
  },
}
```

Then run `oxlint`. See the [Setup guide](https://oxlint-tailwindcss.pages.dev/setup) for the
recommended full rule set, monorepo patterns, and all `settings.tailwindcss` options.

> **Upgrading from v0.x?** `settings.tailwindcss.entryPoint` is now required — see the
> [migration guide](https://oxlint-tailwindcss.pages.dev/migration/v0-to-v1).

## Rules

27 rules across four categories. Every rule has a
[dedicated docs page](https://oxlint-tailwindcss.pages.dev/rules/) (EN/ES) with examples and
options.

<!-- generated:rule-list -->

**Correctness** — `no-conflicting-classes` · `no-contradicting-variants` · `no-dark-without-light` ·
`no-duplicate-classes` · `no-dynamic-classes` · `no-unknown-classes`

**Modernization** — `enforce-canonical` · `enforce-negative-arbitrary-values` ·
`no-deprecated-classes` · `no-unnecessary-arbitrary-value` · `prefer-scale-token` ·
`prefer-theme-tokens`

**Consistency** — `consistent-variant-order` · `enforce-consistent-important-position` ·
`enforce-consistent-line-wrapping` · `enforce-consistent-variable-syntax` · `enforce-logical` ·
`enforce-physical` · `enforce-shorthand` · `enforce-sort-order` · `no-unnecessary-whitespace`

**Design-system guardrails** — `max-class-count` · `no-arbitrary-value` ·
`no-borrowed-component-styles` (experimental) · `no-default-palette` · `no-hardcoded-colors` ·
`no-restricted-classes`
<!-- /generated:rule-list -->

Classes are detected in `className`/`class` attributes, 14 utility helpers (`cn`, `clsx`, `cva`,
`tv`, `twMerge`, …), `tw` tagged templates, and variables matching `/^classNames?$/`, `/^classes$/`,
`/^styles?$/` (e.g. `className`, `classNames`, `classes`, `styles`) — all extendable via
`settings.tailwindcss`.

**Files:** everything oxlint lints — `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts`.
In `.vue`, `.svelte` and `.astro` files oxlint only passes plugins the `<script>` blocks (and
Astro's frontmatter), so template and markup classes are not checked yet — see
[Vue, Svelte & Astro](https://oxlint-tailwindcss.pages.dev/frameworks).

## AI coding agents

```bash
npx skills add sergioazoc/oxlint-tailwindcss --skill oxlint-tailwindcss   # the skill, for any agent
```

In Claude Code, `/plugin marketplace add sergioazoc/oxlint-tailwindcss` and
`/plugin install oxlint-tailwindcss@oxlint-tailwindcss` add the plugin: diagnostics as Claude edits,
and a check of the files it edited before it finishes. See
[AI coding agents](https://oxlint-tailwindcss.pages.dev/ai-agents).

## Requirements

- Node.js `^20.19.0 || >=22.12.0` (the same range oxlint itself requires)
- Tailwind CSS v4.1.15+ (older releases lack a design-system API the plugin needs)
- oxlint ≥ 1.43.0

## Repository structure

This is a pnpm monorepo:

- **[`packages/oxlint-tailwindcss`](./packages/oxlint-tailwindcss)** — the published npm package.
  Full installation, configuration, and per-rule reference live in its
  [README](./packages/oxlint-tailwindcss/README.md).
- **[`packages/docs`](./packages/docs)** — the VitePress documentation site at
  [oxlint-tailwindcss.pages.dev](https://oxlint-tailwindcss.pages.dev) (English at the root, Spanish
  at `/es`).
- **[`skills/oxlint-tailwindcss`](./skills/oxlint-tailwindcss)** — the agent skill, and
  **[`agent/claude-code`](./agent/claude-code)** — the Claude Code plugin, listed by
  [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).
- **[`bench`](./bench)** — the benchmark behind
  [/benchmark](https://oxlint-tailwindcss.pages.dev/benchmark), outside the workspace.

## Development

```bash
pnpm install                # install all workspaces
pnpm build                  # build the plugin
pnpm test                   # run the plugin's test suite
pnpm lint                   # lint the plugin sources
pnpm typecheck              # type-check
pnpm -C packages/docs dev   # run the docs site locally
```

Top-level scripts (`build`, `test`, `lint`, `format`, `typecheck`) delegate to
`packages/oxlint-tailwindcss`. Target a specific package with `pnpm -C packages/<name> <script>`.

## Contributing

Bug reports and feature requests are welcome — please
[open an issue](https://github.com/sergioazoc/oxlint-tailwindcss/issues). If a Tailwind plugin's
classes aren't recognized, an issue with the CSS that triggers it helps a lot.

## License

[MIT](./LICENSE) © [Sergio Azócar](https://sergioazocar.com)
