# Rules

The 23 rules in `oxlint-tailwindcss`, grouped by what they enforce.
Click into any rule for examples and option reference.

## Correctness

These rules catch problems that would generate invalid or unexpected CSS.

- [no-unknown-classes](./no-unknown-classes) — disallow class names the design system doesn't know about.
- [no-conflicting-classes](./no-conflicting-classes) — flag classes that fight over the same CSS property.
- [no-contradicting-variants](./no-contradicting-variants) — `flex hover:flex` is redundant.
- [no-dark-without-light](./no-dark-without-light) — `dark:` should usually have a light-mode pair.
- [no-duplicate-classes](./no-duplicate-classes) — same class twice is dead weight.

## Modernization

- [no-deprecated-classes](./no-deprecated-classes) — `flex-grow` → `grow`, etc.
- [enforce-canonical](./enforce-canonical) — `-m-0` → `m-0`, `bg-gradient-to-r` → `bg-linear-to-r`, etc.
- [no-unnecessary-arbitrary-value](./no-unnecessary-arbitrary-value) — `w-[200px]` → `w-50` when the named value exists.
- [prefer-theme-tokens](./prefer-theme-tokens) — `border-(--border)` → `border-border` when a named utility maps to the same theme variable.
- [enforce-negative-arbitrary-values](./enforce-negative-arbitrary-values) — `-top-[5px]` → `top-[-5px]`.

## Style and consistency

- [enforce-sort-order](./enforce-sort-order) — sort classes in the official Tailwind order.
- [consistent-variant-order](./consistent-variant-order) — `dark:hover:` vs `hover:dark:`.
- [enforce-consistent-important-position](./enforce-consistent-important-position) — prefix `!flex` vs suffix `flex!`.
- [enforce-consistent-line-wrapping](./enforce-consistent-line-wrapping) — one class per line vs all on one.
- [enforce-consistent-variable-syntax](./enforce-consistent-variable-syntax) — `bg-(--x)` vs `bg-[var(--x)]`.
- [enforce-logical](./enforce-logical) — `ml-4` → `ms-4` for RTL support.
- [enforce-physical](./enforce-physical) — `ms-4` → `ml-4` for LTR-only projects.
- [enforce-shorthand](./enforce-shorthand) — `mt-2 mr-2 mb-2 ml-2` → `m-2`.
- [no-unnecessary-whitespace](./no-unnecessary-whitespace) — collapse runs of spaces.

## Design-system discipline

- [no-arbitrary-value](./no-arbitrary-value) — disallow `w-[3.14rem]` and friends.
- [no-hardcoded-colors](./no-hardcoded-colors) — disallow `bg-[#fff]`, prefer theme tokens.
- [no-restricted-classes](./no-restricted-classes) — ban specific classes or regex patterns.
- [max-class-count](./max-class-count) — cap how many classes can stack on a single element.

## Per-rule pages

Each rule's page below covers:

- **What it does**, in one paragraph.
- **Options** with their default values.
- **Correct / incorrect examples**.
- For DS-dependent rules: whether `entryPoint` is required (always
  yes in v1) and what happens when it's missing.
