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

23 lint rules that catch invalid classes, conflicts, and deprecated utilities, and keep your class
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
- **Coexists with oxfmt & Prettier** — point every tool at the same CSS and they agree
  byte-for-byte. [Interop guide ↗](https://oxlint-tailwindcss.pages.dev/interop)
- **Monorepo-ready** — one root config with a glob → CSS mapping, or one `.oxlintrc.json` per
  package. Both fully deterministic.
- **Fail loud** — misconfiguration surfaces as a single `designSystemUnavailable` diagnostic with an
  actionable hint, never silently skipped rules.
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

23 rules across four categories. Every rule has a
[dedicated docs page](https://oxlint-tailwindcss.pages.dev/rules/) (EN/ES) with examples and
options.

**Correctness** — `no-unknown-classes` · `no-duplicate-classes` · `no-conflicting-classes` ·
`no-deprecated-classes` · `no-unnecessary-whitespace` · `no-dark-without-light` ·
`no-contradicting-variants`

**Style** — `enforce-canonical` · `enforce-sort-order` · `enforce-shorthand` · `enforce-logical` ·
`enforce-physical` · `enforce-consistent-important-position` · `enforce-negative-arbitrary-values` ·
`enforce-consistent-variable-syntax` · `consistent-variant-order`

**Complexity** — `max-class-count` · `enforce-consistent-line-wrapping`

**Restrictions** — `no-restricted-classes` · `no-arbitrary-value` · `no-hardcoded-colors` ·
`no-unnecessary-arbitrary-value` · `prefer-theme-tokens`

Classes are detected in `className`/`class` attributes, 14 utility helpers (`cn`, `clsx`, `cva`,
`tv`, `twMerge`, …), `tw` tagged templates, and variables matching `/^classNames?$/`, `/^classes$/`,
`/^styles?$/` (e.g. `className`, `classNames`, `classes`, `styles`) — all extendable via
`settings.tailwindcss`.

## Requirements

- Node.js ≥ 20
- Tailwind CSS v4
- oxlint ≥ 1.43.0

## Repository structure

This is a pnpm monorepo:

- **[`packages/oxlint-tailwindcss`](./packages/oxlint-tailwindcss)** — the published npm package.
  Full installation, configuration, and per-rule reference live in its
  [README](./packages/oxlint-tailwindcss/README.md).
- **[`packages/docs`](./packages/docs)** — the VitePress documentation site at
  [oxlint-tailwindcss.pages.dev](https://oxlint-tailwindcss.pages.dev) (English at the root, Spanish
  at `/es`).

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
