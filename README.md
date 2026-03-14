# oxlint-plugin-tailwindcss

21 Tailwind CSS linting rules for [oxlint](https://oxc.rs/docs/guide/usage/linter). Built for Tailwind CSS v4 with zero-config auto-detection, typo suggestions, and autofixes.

## Highlights

- **Zero config** — Auto-detects your Tailwind CSS entry point. Works out of the box.
- **Fast** — Native oxlint plugin with a shared design system cache. Loads once, used by all rules.
- **Tailwind CSS v4** — Designed for v4 from day one.
- **Typo suggestions** — `itms-center` → "Did you mean `items-center`?"
- **Conflict detection** — Shows exactly which CSS properties conflict and which class wins.
- **Lightweight** — Only 2 runtime dependencies: `@tailwindcss/node` and `tailwindcss`.
- **21 rules** — Correctness, style, complexity, and restriction rules with autofixes where possible.
- **Variable detection** — Lints variables named `className`, `classes`, `style` automatically.
- **Component class support** — Recognizes `@layer components { .btn {} }` in your CSS.

## Installation

```bash
pnpm add -D oxlint-plugin-tailwindcss
```

## Setup

Add the plugin to your `.oxlintrc.json`:

```jsonc
{
  "jsPlugins": ["oxlint-plugin-tailwindcss"],
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
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/enforce-negative-arbitrary-values": "warn",
    "tailwindcss/enforce-consistent-variable-syntax": "warn",
    "tailwindcss/consistent-variant-order": "warn",
    // Complexity
    "tailwindcss/max-class-count": "warn",
    "tailwindcss/enforce-consistent-line-wrapping": "warn",
    // Restrictions
    "tailwindcss/no-restricted-classes": "off",
    "tailwindcss/no-arbitrary-value": "off",
    "tailwindcss/no-hardcoded-colors": "warn",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
  },
}
```

The plugin auto-detects your Tailwind CSS entry point. No configuration needed in most projects.

## Auto-detection

The plugin searches for a CSS file containing a Tailwind import signal (`@import "tailwindcss"`, `@import 'tailwindcss'`, `@import tailwindcss`, `@tailwind base`) in these locations, walking upward from the linted file:

```
src/app.css        src/globals.css      src/global.css
src/style.css      src/styles.css       src/index.css
app.css            main.css             globals.css
style.css          styles/globals.css   app/globals.css
assets/css/tailwind.css
```

The search is monorepo-aware — it stops at `package.json` boundaries so each package resolves its own Tailwind config.

To override auto-detection, pass `entryPoint` as an option:

```jsonc
{
  "rules": {
    "tailwindcss/no-unknown-classes": ["error", { "entryPoint": "src/app.css" }],
  },
}
```

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

// Utility functions
cn("flex items-center", condition && "hidden")
clsx("flex", { "bg-red-500": isError })
twMerge("p-4", "p-2")
cx("flex", "items-center")
classnames("flex", "items-center")
ctl("flex items-center")
twJoin("flex", "items-center")
cc("flex", "items-center")
clb("flex", "items-center")
cnb("flex", "items-center")
objstr({ "flex": true, "items-center": true })

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
| `entryPoint`     | `string`   | Path to Tailwind CSS entry file       |
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

**Options:**

| Option       | Type     | Description                     |
| ------------ | -------- | ------------------------------- |
| `entryPoint` | `string` | Path to Tailwind CSS entry file |

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

// ✅ OK — different values, not contradicting
<div className="text-white dark:text-black" />
<div className="bg-white hover:bg-blue-500" />

// ✅ OK — no base class, both are conditional
<div className="hover:flex dark:flex" />
```

Only reports when the **exact same utility** exists both as base and with a variant.

**No options.** **No autofix.**

---

### Style

#### `enforce-canonical`

Suggests the canonical form of a class when a shorter equivalent exists. Only known classes are checked — arbitrary values are left as-is.

```tsx
// ❌ Bad → ✅ Fixed
"-m-0"   → "m-0"
"-mt-0"  → "mt-0"
"-p-0"   → "p-0"
```

**Options:**

| Option       | Type     | Description                     |
| ------------ | -------- | ------------------------------- |
| `entryPoint` | `string` | Path to Tailwind CSS entry file |

**Requires design system.** **Autofix:** Replaces with canonical form.

---

#### `enforce-sort-order`

Sorts classes according to Tailwind's official class order.

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

| Option       | Type                      | Default     | Description                     |
| ------------ | ------------------------- | ----------- | ------------------------------- |
| `entryPoint` | `string`                  |             | Path to Tailwind CSS entry file |
| `mode`       | `"default"` \| `"strict"` | `"default"` | Sort mode                       |

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

Full mapping:

| Physical                    | Logical                     |
| --------------------------- | --------------------------- |
| `ml`                        | `ms`                        |
| `mr`                        | `me`                        |
| `pl`                        | `ps`                        |
| `pr`                        | `pe`                        |
| `left`                      | `start`                     |
| `right`                     | `end`                       |
| `border-l` / `border-r`     | `border-s` / `border-e`     |
| `rounded-l` / `rounded-r`   | `rounded-s` / `rounded-e`   |
| `rounded-tl` / `rounded-tr` | `rounded-ss` / `rounded-se` |
| `rounded-bl` / `rounded-br` | `rounded-es` / `rounded-ee` |
| `scroll-ml` / `scroll-mr`   | `scroll-ms` / `scroll-me`   |
| `scroll-pl` / `scroll-pr`   | `scroll-ps` / `scroll-pe`   |

**Autofix:** Replaces with logical equivalent.

---

#### `enforce-consistent-important-position`

Enforces a consistent position for the `!` (important) modifier — either prefix or suffix.

```tsx
// ❌ Bad (default: prefix)
<div className="font-bold!" />
<div className="hover:text-red!" />

// ✅ Fixed
<div className="!font-bold" />
<div className="hover:!text-red" />
```

Handles variants correctly — the `!` is placed on the utility, not the variant prefix.

**Options:**

| Option     | Type                     | Default    | Description                     |
| ---------- | ------------------------ | ---------- | ------------------------------- |
| `position` | `"prefix"` \| `"suffix"` | `"prefix"` | Where to place the `!` modifier |

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

When a Tailwind CSS design system is available, the variant order is automatically derived from the design system (via `getVariants()`). Without a design system, a sensible static default is used: responsive → feature queries → color scheme → container queries → group/peer → interactive states → form states → structural → pseudo elements → direction.

A user-specified `order` option always takes the highest priority, overriding both the design system and the static default.

Only checks classes with 2+ variants. Single-variant classes are always valid.

**Options:**

| Option       | Type       | Default                     | Description                     |
| ------------ | ---------- | --------------------------- | ------------------------------- |
| `entryPoint` | `string`   | (auto-detected)             | Path to Tailwind CSS entry file |
| `order`      | `string[]` | (DS order or builtin order) | Custom variant priority list    |

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

**Partial autofix:** When `classesPerLine` is set and the class string is inside a template literal, autofixes by splitting into lines. String literals report without autofix.

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

Detects hex, rgb/rgba, hsl/hsla, oklch, oklab, lch, lab, hwb, and `color()` values inside `[...]` on these utility prefixes: `bg-`, `text-`, `border-` (including directional: `-t`, `-b`, `-l`, `-r`, `-s`, `-e`, `-x`, `-y`), `outline-`, `ring-`, `ring-offset-`, `shadow-`, `accent-`, `caret-`, `fill-`, `stroke-`, `decoration-`, `divide-`, `placeholder-`, `from-`, `via-`, `to-`.

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

**Options:**

| Option       | Type     | Description                     |
| ------------ | -------- | ------------------------------- |
| `entryPoint` | `string` | Path to Tailwind CSS entry file |

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

- **`enforce-canonical`**: Only classes in Tailwind's class list can be canonicalized. Some valid classes (e.g., `grow-1`, `border-1`) are not in the list and won't be converted. Arbitrary values are also not canonicalized.
- **`no-conflicting-classes`**: Uses exact CSS property name matching. Shorthand vs longhand conflicts (e.g., `p-4` vs `px-2` where `padding` conflicts with `padding-left`) are not detected.
- **`enforce-sort-order`**: Variant-prefixed classes use the base utility's sort order as a fallback, which may not be 100% accurate for complex variant combinations.
- **`no-dark-without-light`**: Groups by utility prefix heuristic. May not perfectly match all multi-part utility prefixes.
- **`no-unnecessary-arbitrary-value`**: Only detects equivalences for classes with a single CSS property. Multi-property utilities may have arbitrary forms that aren't detected.
- **Component classes**: Only first-level `@import` relative paths are followed. Deeply nested imports or absolute paths are not resolved.

## Requirements

- Node.js >= 20
- Tailwind CSS v4
- oxlint >= 1.43.0

## License

MIT
