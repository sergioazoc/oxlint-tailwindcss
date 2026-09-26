# oxlint-tailwindcss

27 lint rules for Tailwind CSS v4, for [oxlint](https://oxc.rs/docs/guide/usage/linter). They read
your own Tailwind build — your theme, your utilities, your plugins — so they know which classes
exist, which override each other, which are deprecated or have a canonical form, and which colors
are yours; most fix themselves.

**Docs: [oxlint-tailwindcss.pages.dev](https://oxlint-tailwindcss.pages.dev)** (English) ·
[/es](https://oxlint-tailwindcss.pages.dev/es) (Español) —
[setup](https://oxlint-tailwindcss.pages.dev/setup), every rule with examples,
[settings](https://oxlint-tailwindcss.pages.dev/settings),
[monorepos](https://oxlint-tailwindcss.pages.dev/monorepo),
[CI](https://oxlint-tailwindcss.pages.dev/ci), the
[benchmark](https://oxlint-tailwindcss.pages.dev/benchmark) and
[AI coding agents](https://oxlint-tailwindcss.pages.dev/ai-agents).

## Installation

```bash
npm install -D oxlint oxlint-tailwindcss
```

## Setup

Point the plugin at the CSS file with `@import "tailwindcss"` — `settings.tailwindcss.entryPoint`,
the one required setting — and list the rules you want: oxlint's `categories` don't turn on a JS
plugin's rules. This is every rule, at its recommended severity (`"off"` for the opt-in ones):

<!-- generated:full-config -->

```jsonc
{
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
    "tailwindcss/prefer-scale-token": "off",
    "tailwindcss/prefer-theme-tokens": "off",
    // Consistency
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/enforce-consistent-line-wrapping": "off",
    "tailwindcss/enforce-consistent-variable-syntax": "warn",
    "tailwindcss/enforce-logical": "off",
    "tailwindcss/enforce-physical": "off",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn",
    // Design-system guardrails
    "tailwindcss/max-class-count": "off",
    "tailwindcss/no-arbitrary-value": "off",
    "tailwindcss/no-borrowed-component-styles": "off",
    "tailwindcss/no-default-palette": "off",
    "tailwindcss/no-hardcoded-colors": "warn",
    "tailwindcss/no-restricted-classes": "off"
  }
}
```

<!-- /generated:full-config -->

A missing or wrong entry point is reported once per file as `designSystemUnavailable`, with what to
fix; a misspelt setting as `invalidSetting`. [Setup](https://oxlint-tailwindcss.pages.dev/setup) has
the recommended set, and how to map each package of a monorepo to its own CSS.

## Rules

<!-- generated:rule-table -->

| Rule                                                                                                                        | Category                                | Checks                                                                                                                                                                                                                                            | Recommended | Fix        | Design system |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- | ------------- |
| [`no-conflicting-classes`](https://oxlint-tailwindcss.pages.dev/rules/no-conflicting-classes)                               | Correctness                             | Disallow Tailwind CSS classes that generate conflicting CSS properties                                                                                                                                                                            | `error`     | —          | required      |
| [`no-contradicting-variants`](https://oxlint-tailwindcss.pages.dev/rules/no-contradicting-variants)                         | Correctness                             | Disallow variant-prefixed classes that are redundant because the base class already applies unconditionally                                                                                                                                       | `warn`      | —          | optional      |
| [`no-dark-without-light`](https://oxlint-tailwindcss.pages.dev/rules/no-dark-without-light)                                 | Correctness                             | Require a base (light) utility when using dark: (or other scheme) variant                                                                                                                                                                         | `warn`      | —          | optional      |
| [`no-duplicate-classes`](https://oxlint-tailwindcss.pages.dev/rules/no-duplicate-classes)                                   | Correctness                             | Disallow duplicate Tailwind CSS classes                                                                                                                                                                                                           | `warn`      | autofix    | not used      |
| [`no-dynamic-classes`](https://oxlint-tailwindcss.pages.dev/rules/no-dynamic-classes)                                       | Correctness                             | Disallow Tailwind CSS class names built at runtime, which Tailwind cannot see and generates no CSS for                                                                                                                                            | `error`     | —          | optional      |
| [`no-unknown-classes`](https://oxlint-tailwindcss.pages.dev/rules/no-unknown-classes)                                       | Correctness                             | Disallow classes that are not defined in the Tailwind CSS design system                                                                                                                                                                           | `error`     | suggestion | required      |
| [`enforce-canonical`](https://oxlint-tailwindcss.pages.dev/rules/enforce-canonical)                                         | Modernization                           | Enforce canonical Tailwind CSS class names using canonicalizeCandidates()                                                                                                                                                                         | `warn`      | autofix    | required      |
| [`enforce-negative-arbitrary-values`](https://oxlint-tailwindcss.pages.dev/rules/enforce-negative-arbitrary-values)         | Modernization                           | Enforce moving the negative sign inside arbitrary value brackets: -top-[5px] → top-[-5px]                                                                                                                                                         | `warn`      | autofix    | not used      |
| [`no-deprecated-classes`](https://oxlint-tailwindcss.pages.dev/rules/no-deprecated-classes)                                 | Modernization                           | Disallow deprecated Tailwind CSS v4 classes                                                                                                                                                                                                       | `error`     | autofix    | optional      |
| [`no-unnecessary-arbitrary-value`](https://oxlint-tailwindcss.pages.dev/rules/no-unnecessary-arbitrary-value)               | Modernization                           | Disallow arbitrary values when a named Tailwind class produces the same CSS                                                                                                                                                                       | `warn`      | autofix    | required      |
| [`prefer-scale-token`](https://oxlint-tailwindcss.pages.dev/rules/prefer-scale-token)                                       | Modernization                           | Prefer the scale step or theme token a hardcoded value is numerically equal to                                                                                                                                                                    | off         | suggestion | required      |
| [`prefer-theme-tokens`](https://oxlint-tailwindcss.pages.dev/rules/prefer-theme-tokens)                                     | Modernization                           | Prefer named theme-token utilities over raw CSS variable references when a matching utility exists                                                                                                                                                | off         | autofix    | required      |
| [`consistent-variant-order`](https://oxlint-tailwindcss.pages.dev/rules/consistent-variant-order)                           | Consistency                             | Enforce a consistent order for Tailwind CSS variant prefixes                                                                                                                                                                                      | `warn`      | autofix    | optional      |
| [`enforce-consistent-important-position`](https://oxlint-tailwindcss.pages.dev/rules/enforce-consistent-important-position) | Consistency                             | Enforce consistent position of the important (!) modifier. Default: suffix (Tailwind v4 canonical form). This rule is the single source of truth for ! placement — enforce-canonical preserves the position you wrote, so the two never conflict. | `warn`      | autofix    | not used      |
| [`enforce-consistent-line-wrapping`](https://oxlint-tailwindcss.pages.dev/rules/enforce-consistent-line-wrapping)           | Consistency                             | Warn (and optionally autofix) when a class string exceeds the configured print width or classes-per-line budget                                                                                                                                   | off         | autofix    | optional      |
| [`enforce-consistent-variable-syntax`](https://oxlint-tailwindcss.pages.dev/rules/enforce-consistent-variable-syntax)       | Consistency                             | Enforce consistent CSS variable syntax: bg-[var(--color)] ↔ bg-(--color)                                                                                                                                                                          | `warn`      | autofix    | not used      |
| [`enforce-logical`](https://oxlint-tailwindcss.pages.dev/rules/enforce-logical)                                             | Consistency                             | Enforce logical (RTL-friendly) Tailwind CSS properties instead of physical ones                                                                                                                                                                   | off         | autofix    | optional      |
| [`enforce-physical`](https://oxlint-tailwindcss.pages.dev/rules/enforce-physical)                                           | Consistency                             | Enforce physical Tailwind CSS properties instead of logical ones for consistency in LTR-only projects                                                                                                                                             | off         | autofix    | optional      |
| [`enforce-shorthand`](https://oxlint-tailwindcss.pages.dev/rules/enforce-shorthand)                                         | Consistency                             | Enforce shorthand Tailwind CSS classes when all axes have the same value                                                                                                                                                                          | `warn`      | autofix    | optional      |
| [`enforce-sort-order`](https://oxlint-tailwindcss.pages.dev/rules/enforce-sort-order)                                       | Consistency                             | Enforce consistent sort order of Tailwind CSS classes using the official class order                                                                                                                                                              | `warn`      | autofix    | required      |
| [`no-unnecessary-whitespace`](https://oxlint-tailwindcss.pages.dev/rules/no-unnecessary-whitespace)                         | Consistency                             | Disallow unnecessary whitespace in Tailwind CSS class strings                                                                                                                                                                                     | `warn`      | autofix    | not used      |
| [`max-class-count`](https://oxlint-tailwindcss.pages.dev/rules/max-class-count)                                             | Design-system guardrails                | Enforce a maximum number of Tailwind CSS classes per class string                                                                                                                                                                                 | off         | —          | not used      |
| [`no-arbitrary-value`](https://oxlint-tailwindcss.pages.dev/rules/no-arbitrary-value)                                       | Design-system guardrails                | Disallow arbitrary values in Tailwind CSS classes                                                                                                                                                                                                 | off         | —          | optional      |
| [`no-borrowed-component-styles`](https://oxlint-tailwindcss.pages.dev/rules/no-borrowed-component-styles)                   | Design-system guardrails (experimental) | Disallow a plain element that rebuilds one of your design system's components from its classes                                                                                                                                                    | off         | —          | required      |
| [`no-default-palette`](https://oxlint-tailwindcss.pages.dev/rules/no-default-palette)                                       | Design-system guardrails                | Disallow colors from Tailwind CSS's default palette in a project that defines its own theme colors                                                                                                                                                | off         | —          | required      |
| [`no-hardcoded-colors`](https://oxlint-tailwindcss.pages.dev/rules/no-hardcoded-colors)                                     | Design-system guardrails                | Disallow hardcoded color values in Tailwind CSS classes                                                                                                                                                                                           | `warn`      | —          | optional      |
| [`no-restricted-classes`](https://oxlint-tailwindcss.pages.dev/rules/no-restricted-classes)                                 | Design-system guardrails                | Disallow specific Tailwind CSS classes                                                                                                                                                                                                            | off         | —          | not used      |

<!-- /generated:rule-table -->

## Files and frameworks

Classes are read from `className` / `class` attributes, from `cn()`, `clsx()`, `cva()`, `tv()`,
`twMerge()` and the other common helpers, from `tw` tagged templates, and from variables named like
`className`, `classes` or `styles`; [settings](https://oxlint-tailwindcss.pages.dev/settings) add
your own. Any Tailwind plugin your entry point loads is part of the design system the rules read. In
`.vue`, `.svelte` and `.astro` files, oxlint passes plugins only the `<script>` (and Astro's
frontmatter), so classes in templates aren't linted:
[Vue, Svelte & Astro](https://oxlint-tailwindcss.pages.dev/frameworks).

## Requirements

- Node.js `^20.19.0 || >=22.12.0` (the same range oxlint itself requires)
- Tailwind CSS v4.1.15 or newer, loaded from your project, per entry point; an older engine is
  reported with a clear diagnostic
- oxlint >= 1.43.0. With the editor extension, avoid oxlint 1.77.0: its language server crashes on
  any JS plugin diagnostic ([oxc#25280](https://github.com/oxc-project/oxc/pull/25280), fixed in
  1.78.0).

Only 2 runtime dependencies: `@tailwindcss/node` and `tailwindcss`.

Upgrading from v0? See the
[migration guide](https://oxlint-tailwindcss.pages.dev/migration/v0-to-v1).

## License

MIT
