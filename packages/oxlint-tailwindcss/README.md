# oxlint-tailwindcss

23 Tailwind CSS linting rules for [oxlint](https://oxc.rs/docs/guide/usage/linter). Built for Tailwind CSS v4 with deterministic config, typo suggestions, and autofixes.

> **v1.0.0** — Upgrading from v0.x? See the **[migration guide](https://oxlint-tailwindcss.pages.dev/migration/v0-to-v1)**. The headline change: `settings.tailwindcss.entryPoint` is now required.

Read the story behind this plugin: [oxlint-tailwindcss: The Linting Plugin Tailwind v4 Needed](https://sergioazocar.com/en/blog/oxlint-tailwindcss-the-linting-plugin-tailwind-v4-needed)

## Highlights

- **Configure once, never fails** — `settings.tailwindcss.entryPoint` is explicit. Same input → same output on every machine.
- **Monorepo-ready** — Single root config with a glob → CSS mapping array, or one `.oxlintrc.json` per package. Both fully deterministic.
- **Coexists with oxfmt and Prettier** — Point all tools at the same CSS and they agree byte-for-byte. See the [interop guide](https://oxlint-tailwindcss.pages.dev/interop).
- **Tailwind CSS v4** — Designed for v4 from day one. Reads your `@theme { ... }` custom tokens, your shadcn variables, your typography plugin.
- **Fail loud** — Misconfiguration surfaces as a single `designSystemUnavailable` diagnostic with an actionable hint. Never silently skipped rules.
- **Fast** — Native oxlint plugin with per-entry-point caching and content-hash disk cache for monorepo deduplication.
- **Typo suggestions** — `itms-center` → "Did you mean `items-center`?"
- **Conflict detection** — Shows exactly which CSS properties conflict and which class wins.
- **Lightweight** — Only 2 runtime dependencies: `@tailwindcss/node` and `tailwindcss`.
- **23 rules** — Correctness, style, complexity, and restriction rules with autofixes where possible.
- **Variable detection** — Lints variables named `className`, `classes`, `style` automatically.
- **Customizable** — Extend class detection with custom attributes, callees, tags, and variable patterns.
- **Component class support** — Recognizes `@layer components { .btn {} }` in your CSS.

Full documentation: **https://oxlint-tailwindcss.pages.dev** (English) · **https://oxlint-tailwindcss.pages.dev/es** (Español)

## Installation

```bash
pnpm add -D oxlint-tailwindcss
```

## Setup

Add the plugin to your `.oxlintrc.json`:

```jsonc
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "rules": {
    // Correctness
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-duplicate-classes": "error",
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-unnecessary-whitespace": "error",
    "tailwindcss/no-dark-without-light": "warn",
    "tailwindcss/no-contradicting-variants": "warn",
    // Style
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-logical": "off",
    "tailwindcss/enforce-physical": "off",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/enforce-negative-arbitrary-values": "warn",
    "tailwindcss/enforce-consistent-variable-syntax": "warn",
    "tailwindcss/consistent-variant-order": "warn",
    // Complexity
    "tailwindcss/max-class-count": "off",
    "tailwindcss/enforce-consistent-line-wrapping": "off",
    // Restrictions
    "tailwindcss/no-restricted-classes": "off",
    "tailwindcss/no-arbitrary-value": "off",
    "tailwindcss/no-hardcoded-colors": "warn",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/prefer-theme-tokens": "off",
  },
}
```

Declare your Tailwind CSS entry point in `settings.tailwindcss.entryPoint`:

```jsonc
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css",
    },
  },
  "rules": {
    "tailwindcss/no-unknown-classes": "error",
    // ...
  },
}
```

That's the only required setting. The plugin loads your design system from that file once and shares it across every rule.

### Monorepos

Two patterns, both fully deterministic:

**Pattern A — single root config with a glob → CSS mapping.** First match wins, evaluation in array order:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**", "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**", "use": "packages/admin/src/admin.css" },
        { "files": "**", "use": "src/global.css" },
      ],
    },
  },
}
```

**Pattern B — one `.oxlintrc.json` per package**, each with its own string `entryPoint`. oxlint resolves the closest config to the file being linted.

See the full [monorepo guide](https://oxlint-tailwindcss.pages.dev/monorepo) for examples of both.

### Per-rule override

You can also override per rule if needed:

```jsonc
{
  "rules": {
    "tailwindcss/no-unknown-classes": ["error", { "entryPoint": "src/app.css" }],
  },
}
```

Resolution order: rule option > `settings.tailwindcss.entryPoint`. If neither resolves a CSS file, DS-dependent rules emit a single `designSystemUnavailable` diagnostic per file (with the migration hint inline). v1.0.0 removed the filesystem auto-detect — explicit `entryPoint` is mandatory.

### Timeout

For slow environments (large monorepos, CI), you can increase the design system loading timeout:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "timeout": 120000, // milliseconds (default: 60000)
    },
  },
}
```

### Root font size

The `enforce-canonical` rule converts px-based arbitrary values to named classes (e.g. `p-[2px]` → `p-0.5`). This conversion depends on the root font size:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "rootFontSize": 16, // pixels (default: 16)
    },
  },
}
```

### Debug logging

To see which design system is used for each file, enable debug mode:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "debug": true,
    },
  },
}
```

Or use the environment variable (no config changes needed):

```bash
DEBUG=oxlint-tailwindcss oxlint .
```

Output:

```
[oxlint-tailwindcss] Loaded design system from "packages/web/src/globals.css"
[oxlint-tailwindcss] packages/web/src/App.tsx → packages/web/src/globals.css
[oxlint-tailwindcss] packages/admin/src/Dashboard.tsx → packages/admin/src/styles.css
```

If no entry point is configured, the DS-dependent rules (`no-unknown-classes`, `no-conflicting-classes`, `no-deprecated-classes`, `enforce-canonical`, `enforce-sort-order`, `no-unnecessary-arbitrary-value`, `prefer-theme-tokens`) emit a single `designSystemUnavailable` diagnostic per file with an actionable hint — no more silent skips. `consistent-variant-order` is the lone exception: its static fallback is itself deterministic, so a missing entryPoint is tolerated there. All non-DS rules work without an entry point.

## Custom class detection

By default the plugin detects Tailwind classes in `className`/`class` attributes, 14 utility functions (`cn`, `clsx`, `cva`, `tv`, `classed`, etc.), `tw` tagged templates, and variables named `className`/`classes`/`style`.

You can extend these defaults via `settings.tailwindcss`. All values are **additive** — your custom entries are appended to the built-in defaults:

```jsonc
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": {
    "tailwindcss": {
      // Additional JSX attribute names to scan
      "attributes": ["xyzClassName", "classNames", "overlayClassName"],
      // Additional function names to scan
      "callees": ["myHelper"],
      // Additional tagged template tags to scan
      "tags": ["css"],
      // Additional regex patterns for variable names (as strings)
      "variablePatterns": ["^tw"],
    },
  },
  "rules": {
    "tailwindcss/no-unknown-classes": "error",
    // ...
  },
}
```

This applies to all 23 rules at once. For example, adding `"classNames"` to `attributes` makes every rule lint `<Input classNames={{ root: "..." }} />`.

To **remove** specific items from the built-in defaults, use `exclude`:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "exclude": {
        // Stop scanning variables named "style" / "styles"
        "variablePatterns": ["^styles?$"],
        // Stop scanning a specific callee
        "callees": ["objstr"],
      },
    },
  },
}
```

For `variablePatterns`, exclusions match against the regex source (e.g. `"^styles?$"` removes the default `/^styles?$/` pattern).

## Supported patterns

The plugin extracts Tailwind classes from:

```tsx
// JSX attributes
<div className="flex items-center" />
<div class="flex items-center" />

// Template literals
<div className={`flex ${condition ? "hidden" : ""}`} />

// Ternaries
<div className={active ? "bg-blue-500" : "bg-gray-200"} />

// Utility functions (cn, clsx, cx, cva, twMerge, twJoin, classnames, ctl, cc, clb, cnb, objstr)
cn("flex items-center", condition && "hidden")
clsx("flex", { "bg-red-500": isError })
twMerge("p-4", "p-2")

// cva() — full extraction: base, variants, compoundVariants
cva("flex items-center", {
  variants: {
    size: { sm: "text-sm p-2", lg: "text-lg p-4" },
  },
  compoundVariants: [
    { size: "sm", class: "font-medium" },
  ],
})

// tv() — full extraction: base, slots, variants (with slot objects), compoundVariants, compoundSlots
tv({
  base: "flex items-center",
  slots: { header: "p-4 font-bold", body: "p-2" },
  variants: {
    color: {
      primary: { header: "bg-blue-500", body: "text-blue-900" },
    },
  },
  compoundSlots: [
    { color: "primary", class: "border-blue-500" },
  ],
})

// classed() (tw-classed) — skips element type, extracts classes and cva-like config
classed("button", "flex items-center", {
  variants: {
    color: { primary: "bg-blue-500", secondary: "bg-gray-500" },
  },
})

// Array values — the idiomatic multi-line form of cn()/cva()/tv()
cn(["flex", "items-center"])
tv({ base: ["flex", "items-center"], variants: { size: { sm: ["p-2", "text-sm"] } } })

// Object-valued JSX attributes (e.g. Mantine classNames prop)
<Input classNames={{ root: "flex items-center", input: "border-none" }} />

// Tagged templates
const styles = tw`flex items-center hover:bg-blue-500`

// Variable declarations (matched by name: className, classNames, classes, style, styles)
const className = "flex items-center"
const classes = condition ? "bg-blue-500" : "bg-gray-200"
```

## Rules

### Correctness

#### `no-unknown-classes`

Reports classes not recognized by Tailwind CSS. Includes typo suggestions.

```tsx
// ❌ Bad
<div className="flex itms-center bg-blu-500" />
//                   ^^^^^^^^^^^
// "itms-center" is not a valid Tailwind class. Did you mean "items-center"?
//                                ^^^^^^^^^^
// "bg-blu-500" is not a valid Tailwind class. Did you mean "bg-blue-500"?
```

**Options:**

| Option           | Type       | Description                           |
| ---------------- | ---------- | ------------------------------------- |
| `allowlist`      | `string[]` | Custom classes to allow               |
| `ignorePrefixes` | `string[]` | Prefixes to ignore (e.g. `["data-"]`) |

**Requires design system.** No autofix.

---

#### `no-duplicate-classes`

Detects repeated classes in the same string. `hover:flex` and `focus:flex` are **not** considered duplicates (different variants).

```tsx
// ❌ Bad
<div className="flex flex items-center" />

// ✅ Fixed
<div className="flex items-center" />
```

**Autofix:** Removes the duplicate.

---

#### `no-conflicting-classes`

Detects classes that set the same CSS property. Reports which property conflicts and which class wins.

```tsx
// ❌ Bad
<div className="text-red-500 text-blue-500" />
// "text-red-500" and "text-blue-500" affect "color".
// "text-blue-500" takes precedence (appears later).

<div className="mt-2 mt-4" />
// "mt-2" and "mt-4" affect "margin-top".
```

> **Note:** Shorthand vs longhand conflicts (e.g., `p-4` vs `px-2`) are not currently detected. See [Known limitations](#known-limitations).

**Requires design system.** No autofix.

---

#### `no-deprecated-classes`

Detects classes deprecated in Tailwind CSS v4.

```tsx
// ❌ Bad
<div className="flex-grow" />
// "flex-grow" is deprecated in Tailwind v4. Use "grow" instead.

// ✅ Fixed
<div className="grow" />
```

Deprecated class mappings:

| Deprecated          | Replacement            |
| ------------------- | ---------------------- |
| `flex-grow`         | `grow`                 |
| `flex-grow-0`       | `grow-0`               |
| `flex-shrink`       | `shrink`               |
| `flex-shrink-0`     | `shrink-0`             |
| `overflow-ellipsis` | `text-ellipsis`        |
| `decoration-slice`  | `box-decoration-slice` |
| `decoration-clone`  | `box-decoration-clone` |

**Autofix:** Replaces with the modern equivalent.

---

#### `no-unnecessary-whitespace`

Normalizes whitespace in class strings.

```tsx
// ❌ Bad
<div className="  flex   items-center  " />

// ✅ Fixed
<div className="flex items-center" />
```

**Autofix:** Trims and collapses whitespace.

---

#### `no-dark-without-light`

Requires a base (light) utility when using the `dark:` variant on the same element.

```tsx
// ❌ Bad — dark variant without base
<div className="dark:bg-gray-900" />
// "dark:bg-gray-900" uses the dark variant, but there is no base "bg-*" class.

// ✅ OK — has matching base
<div className="bg-white dark:bg-gray-900" />
<div className="text-black dark:text-white" />
```

Groups by utility prefix (`bg-`, `text-`, `border-`, etc.) — only checks that a base utility of the same type exists.

**Options:**

| Option     | Type       | Default    | Description                          |
| ---------- | ---------- | ---------- | ------------------------------------ |
| `variants` | `string[]` | `["dark"]` | Variant prefixes to check for a base |

**No autofix.**

---

#### `no-contradicting-variants`

Detects variant-prefixed classes that are redundant because the base class already applies unconditionally.

```tsx
// ❌ Bad — dark:flex is redundant because flex already applies always
<div className="flex dark:flex" />
<div className="hidden hover:hidden" />

// ✅ OK — different values, both conditional, or different selector targets
<div className="text-white dark:text-black" />
<div className="hover:flex dark:flex" />
<div className="absolute after:absolute" />
<div className="shrink-0 [&>svg]:shrink-0" />
```

Only flags when the exact same utility exists both as base and with a conditional variant. Variants that change the selector target (pseudo-elements, child/descendant selectors, arbitrary selectors) are not flagged.

**No options.** **No autofix.**

---

### Style

#### `enforce-canonical`

Enforces canonical Tailwind CSS class names. Uses `canonicalizeCandidates()` from the Tailwind CSS engine dynamically — the same API that powers Tailwind CSS IntelliSense's `suggestCanonicalClasses`.

```tsx
// ❌ Bad → ✅ Fixed
"-m-0"                              → "m-0"
"-mt-0"                             → "mt-0"
"p-[2px]"                           → "p-0.5"
"max-w-[400px]"                     → "max-w-100"
"text-[var(--color-text)]/90"       → "text-(--color-text)/90"
"[--w-padding:theme(spacing.1)]"    → "[--w-padding:--spacing(1)]"
```

The px→named conversion (e.g. `p-[2px]` → `p-0.5`) depends on `rootFontSize` (default: 16).

**Requires design system.** **Autofix:** Replaces with canonical form.

---

#### `enforce-sort-order`

Sorts classes according to Tailwind's official class order — identical to [oxfmt](https://oxc.rs/docs/guide/usage/formatter) and [prettier-plugin-tailwindcss](https://github.com/tailwindlabs/prettier-plugin-tailwindcss). Uses `ds.getClassOrder()` from the Tailwind CSS engine for exact results.

```tsx
// ❌ Bad
<div className="text-red-500 flex items-center p-4" />

// ✅ Fixed
<div className="flex items-center p-4 text-red-500" />
```

In `strict` mode, classes are grouped by variant prefix, sorted within each group by DS sort order, and groups are ordered: no-variant first, then by variant priority.

```tsx
// ❌ Bad (strict mode)
<div className="hover:text-red-500 p-4 hover:bg-blue-500 m-2" />

// ✅ Fixed
<div className="m-2 p-4 hover:bg-blue-500 hover:text-red-500" />
```

**Options:**

| Option | Type                      | Default     | Description |
| ------ | ------------------------- | ----------- | ----------- |
| `mode` | `"default"` \| `"strict"` | `"default"` | Sort mode   |

**Requires design system.** **Autofix:** Reorders classes.

---

#### `enforce-shorthand`

Suggests shorthand classes when all axes have the same value.

```tsx
// ❌ Bad → ✅ Fixed
"mt-2 mr-2 mb-2 ml-2"  → "m-2"
"mt-2 mb-2"             → "my-2"
"ml-2 mr-2"             → "mx-2"
"pt-4 pr-4 pb-4 pl-4"  → "p-4"
"pt-4 pb-4"             → "py-4"
"pl-4 pr-4"             → "px-4"
"w-full h-full"         → "size-full"
"rounded-tl-lg rounded-tr-lg rounded-br-lg rounded-bl-lg" → "rounded-lg"
```

**Autofix:** Replaces with shorthand.

---

#### `enforce-logical`

Converts physical properties to logical ones for LTR/RTL support.

```tsx
// ❌ Bad → ✅ Fixed
"ml-4"    → "ms-4"
"mr-4"    → "me-4"
"pl-4"    → "ps-4"
"pr-4"    → "pe-4"
"left-0"  → "start-0"
"right-0" → "end-0"
```

Also converts `border-l/r`, `rounded-l/r/tl/tr/bl/br`, and `scroll-ml/mr/pl/pr` to their logical equivalents.

**Autofix:** Replaces with logical equivalent.

---

#### `enforce-physical`

The inverse of `enforce-logical`. Converts logical properties back to physical ones for consistency in LTR-only projects.

```tsx
// ❌ Bad → ✅ Fixed
"ms-4"    → "ml-4"
"me-4"    → "mr-4"
"ps-4"    → "pl-4"
"pe-4"    → "pr-4"
"start-0" → "left-0"
"end-0"   → "right-0"
```

**Autofix:** Replaces with physical equivalent.

---

#### `enforce-consistent-important-position`

Enforces a consistent position for the `!` (important) modifier — either prefix or suffix.

```tsx
// ❌ Bad (default: suffix — Tailwind v4 canonical form)
<div className="!font-bold" />
<div className="hover:!text-red" />

// ✅ Fixed
<div className="font-bold!" />
<div className="hover:text-red!" />
```

Handles variants correctly — the `!` is placed on the utility, not the variant prefix.

**Options:**

| Option     | Type                     | Default    | Description                     |
| ---------- | ------------------------ | ---------- | ------------------------------- |
| `position` | `"prefix"` \| `"suffix"` | `"suffix"` | Where to place the `!` modifier |

> **Note:** The default is `"suffix"` to match Tailwind CSS v4's canonical form. The prefix form (`!flex`) is deprecated in v4. Using `"prefix"` may conflict with `enforce-canonical`, which also normalizes `!` to the suffix position.

**Autofix:** Moves `!` to the correct position.

---

#### `enforce-negative-arbitrary-values`

Moves the negative sign inside arbitrary value brackets for consistency.

```tsx
// ❌ Bad
<div className="-top-[5px]" />
<div className="-translate-x-[10px]" />
<div className="hover:-mt-[8px]" />

// ✅ Fixed
<div className="top-[-5px]" />
<div className="translate-x-[-10px]" />
<div className="hover:mt-[-8px]" />
```

**No options.** **Autofix:** Moves the negative inside the brackets.

---

#### `enforce-consistent-variable-syntax`

Enforces consistent CSS variable syntax between Tailwind v4 shorthand `bg-(--var)` and explicit `bg-[var(--var)]`.

```tsx
// ❌ Bad (default: shorthand)
<div className="bg-[var(--primary)]" />
<div className="text-[var(--text-color)]" />

// ✅ Fixed
<div className="bg-(--primary)" />
<div className="text-(--text-color)" />
```

Does NOT convert complex expressions — only simple `var(--name)` wrappers:

```tsx
// ✅ Left as-is (complex expression)
<div className="bg-[color-mix(in_srgb,var(--primary),transparent)]" />
```

**Options:**

| Option   | Type                          | Default       | Description             |
| -------- | ----------------------------- | ------------- | ----------------------- |
| `syntax` | `"shorthand"` \| `"explicit"` | `"shorthand"` | Which syntax to enforce |

**Autofix:** Converts between syntaxes.

---

#### `consistent-variant-order`

Enforces a consistent order for variant prefixes.

Uses the design system's variant order when available, falls back to a sensible static default. Only checks classes with 2+ variants. Pseudo-element variants (`before:`, `after:`, `placeholder:`, etc.) are always kept innermost (closest to the utility) regardless of the ordering source — placing them before element-selecting variants like `[&>svg]:` or `has-[.active]:` produces broken CSS in Tailwind v4.

**Options:**

| Option  | Type       | Default                     | Description                  |
| ------- | ---------- | --------------------------- | ---------------------------- |
| `order` | `string[]` | (DS order or builtin order) | Custom variant priority list |

**Optionally uses design system.** **Autofix:** Reorders variants.

---

### Complexity

#### `max-class-count`

Warns when an element has too many Tailwind classes, suggesting extraction into a component or utility.

```tsx
// ❌ Bad (with default max: 20)
<div
  className="flex items-center justify-between p-4 m-2 bg-white text-black
  rounded shadow border w-full h-10 gap-2 font-bold text-sm overflow-hidden
  cursor-pointer transition duration-200 opacity-50"
/>
// Too many Tailwind classes (21). Maximum allowed is 20.
```

**Options:**

| Option | Type     | Default | Description                 |
| ------ | -------- | ------- | --------------------------- |
| `max`  | `number` | `20`    | Maximum classes per element |

**No autofix** — requires developer judgment on how to split.

---

#### `enforce-consistent-line-wrapping`

Warns when a class string exceeds the configured print width or classes-per-line limit.

```tsx
// ❌ Bad (with default printWidth: 80)
<div className="flex items-center justify-between p-4 m-2 bg-white text-black rounded shadow-lg border w-full" />
// Class string is 97 characters long, exceeding the print width of 80.

// ❌ Bad (with classesPerLine: 3)
<div className="flex items-center justify-between p-4 m-2 bg-white" />
// Too many classes on a single line (7). Maximum allowed per line is 3.
```

**Options:**

| Option           | Type     | Default | Description             |
| ---------------- | -------- | ------- | ----------------------- |
| `printWidth`     | `number` | `80`    | Max class string length |
| `classesPerLine` | `number` |         | Max classes per line    |

**Autofix:** Only for `classesPerLine` with template literals.

---

### Restrictions

#### `no-restricted-classes`

Blocks specific Tailwind classes by exact name or regex pattern with optional custom messages.

```tsx
// With options: { classes: ["hidden"], patterns: [{ pattern: "^float-", message: "Use flexbox" }] }

// ❌ Bad
<div className="hidden" />        // "hidden" is restricted.
<div className="float-left" />    // "float-left" is restricted: Use flexbox
```

**Options (required — rule is a no-op without them):**

| Option     | Type                                           | Default | Description                |
| ---------- | ---------------------------------------------- | ------- | -------------------------- |
| `classes`  | `string[]`                                     | `[]`    | Exact class names to block |
| `patterns` | `Array<{ pattern: string, message?: string }>` | `[]`    | Regex patterns to match    |

**No autofix.**

---

#### `no-arbitrary-value`

Prohibits arbitrary values (`[...]`) in Tailwind classes. Useful for teams that want to enforce strict design system adherence.

```tsx
// ❌ Bad
<div className="w-[200px]" />
<div className="bg-[#ff0000]" />
<div className="hover:w-[200px]" />

// ✅ OK — arbitrary variants are NOT flagged
<div className="[&>svg]:w-4" />
```

**Options:**

| Option  | Type       | Default | Description                                         |
| ------- | ---------- | ------- | --------------------------------------------------- |
| `allow` | `string[]` | `[]`    | Utility prefixes to allow (e.g. `["bg-", "text-"]`) |

**No autofix.**

---

#### `no-hardcoded-colors`

Flags hardcoded color values in arbitrary brackets. Encourages use of design tokens.

```tsx
// ❌ Bad
<div className="bg-[#ff5733]" />
<div className="text-[rgb(255,0,0)]" />
<div className="border-[hsl(120,100%,50%)]" />
<div className="hover:bg-[#ff5733]" />

// ✅ OK — not a color utility
<div className="w-[200px]" />
<div className="tracking-[0.5em]" />
```

Detects hex, rgb/rgba, hsl/hsla, oklch, oklab, and other color function values inside `[...]` on color-related utility prefixes (`bg-`, `text-`, `border-`, `ring-`, `shadow-`, `fill-`, `stroke-`, etc.).

**Options:**

| Option  | Type       | Default | Description               |
| ------- | ---------- | ------- | ------------------------- |
| `allow` | `string[]` | `[]`    | Full class names to allow |

**No autofix.**

---

#### `no-unnecessary-arbitrary-value`

Detects arbitrary values that have a named Tailwind equivalent. The arbitrary form produces the exact same CSS, so the named class is preferred.

```tsx
// ❌ Bad → ✅ Fixed
"h-[auto]"        → "h-auto"
"hover:h-[auto]"  → "hover:h-auto"

// ✅ OK — no named equivalent
"w-[200px]"
"bg-[#custom]"
```

**Requires design system.** **Autofix:** Replaces with named class.

---

#### `prefer-theme-tokens`

Suggests replacing raw CSS variable references like `border-(--border)` or `bg-[var(--primary)]` with the equivalent named theme-token utility (`border-border`, `bg-primary`) when one exists in your design system.

Unlike `no-unnecessary-arbitrary-value`, this rule fires even when the named utility produces _different_ CSS — for example, in themes that wrap the raw variable in a color function (`--color-border: hsl(var(--border))`). Useful to match the official Tailwind VS Code extension's `suggestCanonicalClasses` behavior. **Off by default** because the replacement may change observable CSS in those setups. (When the theme exposes the variable directly with no wrapping function, `border-[var(--border)]` is CSS-equivalent to `border-border` and is owned by `no-unnecessary-arbitrary-value` instead.)

```tsx
// ❌ Bad → ✅ Fixed (when border-border is a valid utility)
"border-(--border)"        → "border-border"
"bg-[var(--primary)]"      → "bg-primary"
"hover:bg-(--primary)/80"  → "hover:bg-primary/80"
```

**Requires design system.** **Autofix:** Replaces with named class.

---

## Edge cases

The class parser correctly handles:

- Nested brackets: `bg-[url('https://example.com/img.png')]`
- Nested calc: `h-[calc(100vh-var(--header-height))]`
- Arbitrary variants: `[&>svg]:w-4`, `[&_p]:mt-2`
- Quoted values: `content-['hello_world']`
- Important modifier: `!font-bold`
- Negative values: `-translate-x-1`
- Named groups/peers: `group/sidebar`, `peer/input`

## Known limitations

- **`enforce-canonical`**: Named classes are canonicalized via the precomputed map (covers everything in `getClassList()` plus a curated list of legacy v3 spellings like `break-words`, `flex-grow`, `start-N`, `bg-gradient-to-*`). Arbitrary/CSS-var forms (`p-[2px]`, `bg-(--c)`) are canonicalized dynamically via the worker. Some valid v4 classes that don't appear in `getClassList()` and have no canonical rewrite (e.g. `border-1` is valid as a dynamic numeric value but isn't enumerated) are left untouched.
- **`no-conflicting-classes`**: Uses exact CSS property name matching plus composition heuristics: CSS-var composition (`shadow` + `ring`), narrowing-override (later class is a strict subset of earlier — handles `size-4 h-6`, `rounded-t-lg rounded-tl-sm`, `truncate text-clip`), complementary groups (gradient stops, transition family, transform axes, mask gradient family across edges/axes/`linear`/`radial`/`conic`), and composition pairs (e.g. `mask-add` + any mask gradient). Shorthand vs longhand cases where Tailwind emits the shorthand and Tailwind's longhand has a different CSS property name (e.g., `p-4` vs `px-2`: `padding` vs `padding-left`/`padding-right`) are still not detected.
- **`no-dark-without-light`**: Groups by utility prefix heuristic. May not perfectly match all multi-part utility prefixes.
- **`no-unnecessary-arbitrary-value`**: Only detects equivalences for classes with a single CSS property. Multi-property utilities may have arbitrary forms that aren't detected.
- **Component classes**: Only first-level `@import` relative paths are followed. Deeply nested imports or absolute paths are not resolved.

## Supported plugins

The plugin loads classes through `@tailwindcss/node`, so any plugin imported into your CSS entry point — `@plugin '...'` or `@import '...'` — is recognized automatically by every rule. The following are exercised by the test suite:

- **[`@tailwindcss/typography`](https://github.com/tailwindlabs/tailwindcss-typography)** — `prose`, `prose-sm/lg/xl`, `not-prose`. `no-conflicting-classes` extracts only root-level CSS properties from `prose`, so utilities like `prose overflow-x-auto` aren't reported as conflicts.
- **[`tailwindcss-animate`](https://github.com/jamiebuilds/tailwindcss-animate)** — `animate-in`, `animate-out`, `fade-{in,out}-*`, `zoom-{in,out}-*`, `spin-{in,out}-*`, `slide-{in-from,out-to}-*`, `duration-*`, `delay-*`, `ease-*`, `direction-*`, `fill-mode-*`, `repeat-*`, `running`, `paused`. `animate-in`/`animate-out` initialize all `--tw-enter-*` / `--tw-exit-*` custom properties to `initial`, and modifiers (`fade-in`, `zoom-in`, `slide-in-from-*`, etc.) each override one of them; this composition is recognized by `no-conflicting-classes`.
- **[`tw-animate-css`](https://github.com/Wombosvideo/tw-animate-css)** — v4-native rewrite of `tailwindcss-animate`. Adds `blur-{in,out}-*`, logical (RTL-aware) `slide-{in-from,out-to}-{start,end}-*`, `play-state-*`, `animation-duration-*`, and the `animate-accordion-{up,down}` / `animate-collapsible-{up,down}` / `animate-caret-blink` keyframe animations used by Radix-style headless component libraries.

Other plugins that emit classes through standard `getClassList()` and CSS output should work out of the box. If you find one that doesn't, open an issue.

## Requirements

- Node.js >= 20
- Tailwind CSS v4
- oxlint >= 1.43.0

## License

MIT
