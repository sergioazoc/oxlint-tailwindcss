---
title: "shadcn/ui and @shadcn/lint"
description: "oxlint-tailwindcss in a shadcn/ui project, alongside @shadcn/lint: who reports what, one combined .oxlintrc.json, and what it finds in shadcn/ui itself."
---

# shadcn/ui and @shadcn/lint

oxlint-tailwindcss reads a shadcn/ui project's theme — `app/globals.css`, with its CSS variables and
`@theme inline` colors — like any other Tailwind v4 stylesheet, so it needs nothing shadcn-specific.
[@shadcn/lint](https://github.com/shadcn-ui/lint) is a separate oxlint plugin with a different job:
it enforces your design-system policy — which classes a component accepts, theme colors instead of
the palette, no arbitrary values, no inline styles. They run together. Where both have a rule for
the same problem, turn one off, so each problem is reported once.

## Who reports what

<!-- generated:shadcn-table -->

| What                                                                           | Example                                                        | @shadcn/lint                          | oxlint-tailwindcss                               | Combined config    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ | ------------------ |
| Restyling a design-system component through `className`                        | `<Button className="rounded-full p-4">Pay</Button>`            | `no-restyle`                          | —                                                | @shadcn/lint       |
| Inline styles                                                                  | <span v-pre>`<div style={{ color: "#f00" }}>Sale</div>`</span> | `no-inline-styles`                    | —                                                | @shadcn/lint       |
| A Tailwind palette color instead of a theme color                              | `<div className="bg-red-500">Sale</div>`                       | `no-raw-colors`                       | —                                                | @shadcn/lint       |
| Arbitrary values                                                               | `<div className="p-[13px]">Card</div>`                         | `no-arbitrary-values`                 | `no-arbitrary-value`, `no-hardcoded-colors`      | @shadcn/lint       |
| A CSS variable where the theme has a named class                               | `<div className="bg-(--primary)">Card</div>`                   | —                                     | `no-arbitrary-value`, `prefer-theme-tokens`      | oxlint-tailwindcss |
| Classes Tailwind can't generate: typos in utilities, variants and theme colors | `<div className="itms-center">Card</div>`                      | `no-unknown-classes`, `no-raw-colors` | `no-unknown-classes`                             | oxlint-tailwindcss |
| Classes built at runtime                                                       | `<div className={`bg-${tone}-500`}>Card</div>`                 | `require-static-classes`              | `no-dynamic-classes`                             | both               |
| Classes that override each other                                               | `<div className="line-clamp-1 flex">Card</div>`                | —                                     | `no-conflicting-classes`                         | oxlint-tailwindcss |
| Duplicate classes                                                              | `<div className="flex flex">Card</div>`                        | —                                     | `no-duplicate-classes`                           | oxlint-tailwindcss |
| Classes deprecated in Tailwind v4                                              | `<div className="flex-shrink-0">Card</div>`                    | —                                     | `no-deprecated-classes`                          | oxlint-tailwindcss |
| Classes with a canonical form                                                  | `<div className="-m-0">Card</div>`                             | —                                     | `enforce-canonical`                              | oxlint-tailwindcss |
| A dark-mode color with no light-mode base                                      | `<div className="dark:bg-accent">Card</div>`                   | —                                     | `no-dark-without-light`                          | oxlint-tailwindcss |
| Class and variant order                                                        | `<div className="p-4 flex">Card</div>`                         | —                                     | `enforce-sort-order`, `consistent-variant-order` | oxlint-tailwindcss |

<!-- /generated:shadcn-table -->

Every example above is linted by both plugins in a minimal shadcn/ui project, and the table is
checked against what they report: this plugin's column on every build, @shadcn/lint's every week
against its latest release. Where the combined config below gives a problem to one of them:

- **Unknown classes → oxlint-tailwindcss.** Both report a misspelt utility or variant with a
  suggestion. This plugin also reports a class name Tailwind can't generate at all (`line`), and a
  misspelt theme color under the same rule, with the color you meant (`bg-primray` → `bg-primary`).
  @shadcn/lint's `no-raw-colors` reports that misspelt color as well, as an undeclared theme color —
  the one problem both still report.
- **Arbitrary values → @shadcn/lint.** Both report them with a fix; `no-arbitrary-values` suggests
  the exact value on the scale (`p-[13px]` → `p-3.25`). This plugin's `no-arbitrary-value` is off in
  its recommended config, and the combined config also turns off `no-hardcoded-colors`, whose
  arbitrary colors `no-arbitrary-values` already reports.
- **Classes built at runtime → both.** @shadcn/lint's `require-static-classes` reports a `className`
  it can't read on a component, which it needs to check the component's policy; this plugin's
  `no-dynamic-classes` reports a class built at runtime on any element, because Tailwind generates
  no CSS for it.
- **`prefer-theme-tokens` is on** (it's off in the recommended config): shadcn/ui's colors are CSS
  variables, and `bg-(--primary)` has a named class, `bg-primary`.

## The combined config

```bash
pnpm add -D oxlint oxlint-tailwindcss @shadcn/lint
```

<!-- generated:shadcn-config -->

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss", "@shadcn/lint"],
  "settings": {
    "tailwindcss": {
      "entryPoint": "app/globals.css"
    }
  },
  "rules": {
    // oxlint-tailwindcss: the recommended rules, adjusted for shadcn/ui
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-contradicting-variants": "warn",
    "tailwindcss/no-dark-without-light": "warn",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/no-dynamic-classes": "error",
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-negative-arbitrary-values": "warn",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/prefer-theme-tokens": "warn",
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/enforce-consistent-variable-syntax": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn",
    // @shadcn/lint
    "shadcn/no-restyle": ["error", { "allow": ["layout"] }],
    "shadcn/no-raw-colors": "error",
    "shadcn/no-arbitrary-values": "error",
    "shadcn/no-inline-styles": "error",
    "shadcn/require-static-classes": "error"
  },
  "overrides": [
    {
      "files": ["components/ui/**"],
      "rules": { "shadcn/no-restyle": "off" }
    }
  ]
}
```

<!-- /generated:shadcn-config -->

- `entryPoint` is the stylesheet `components.json` names under `tailwind.css`: `app/globals.css` in
  a Next.js app, `src/index.css` in a Vite one.
- The override turns `no-restyle` off inside the components directory, as @shadcn/lint's docs ask,
  so components can style their own internals. Point it at yours if `components.json` puts them
  elsewhere (`aliases.ui`).
- What each component accepts (`contracts`), custom messages and the rest of @shadcn/lint's
  configuration are its own: see [its rules](https://github.com/shadcn-ui/lint#rules).

## What it finds in shadcn/ui

Run on shadcn/ui's own components (`apps/v4` at `98a1fe67`), `no-conflicting-classes` reports the
select trigger in `registry/new-york-v4/ui/select.tsx`:

```text
"*:data-[slot=select-value]:flex" overrides "*:data-[slot=select-value]:line-clamp-1" on "display".
"*:data-[slot=select-value]:flex" comes later in the generated stylesheet, so it wins no matter how
the class attribute is ordered. Remove one.
```

`line-clamp-1` truncates with `display: -webkit-box`, and the later `display: flex` replaces it, so
the clamp never applies: a long selected value gets no ellipsis and pushes past the trigger's width.
[shadcn-ui/ui#11832](https://github.com/shadcn-ui/ui/pull/11832), an open pull request that fixes
that overflow, describes the same cause.

## Setting it up, step by step

For a person or an agent, in a shadcn/ui project:

1. Read `components.json`: `tailwind.css` is the entry point, and `aliases.ui` is the components
   directory (`@/components/ui` → `components/ui/**`).
2. Install `oxlint`, `oxlint-tailwindcss` and `@shadcn/lint` as dev dependencies, with the project's
   package manager.
3. Write the combined config to `.oxlintrc.json`, with `entryPoint` set to the entry point and the
   override's `files` to the components directory. If there's a config already, merge: keep its
   rules and add the plugins, the setting and the rules above.
4. Run `oxlint`. `oxlint --fix` applies the autofixes; the editor offers the suggestions.
5. Leave @shadcn/lint's policy — what each component accepts — to the design system's owner.
