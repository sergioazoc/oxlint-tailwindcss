# Rules

The 23 rules in `oxlint-tailwindcss`, grouped by what they enforce. Click into any rule for examples
and option reference.

## Correctness

These rules catch problems that would generate invalid or unexpected CSS.

- [no-unknown-classes](./no-unknown-classes) — disallow class names the design system doesn't know
  about.
- [no-conflicting-classes](./no-conflicting-classes) — flag classes that fight over the same CSS
  property.
- [no-contradicting-variants](./no-contradicting-variants) — `flex hover:flex` is redundant.
- [no-dark-without-light](./no-dark-without-light) — `dark:` should usually have a light-mode pair.
- [no-duplicate-classes](./no-duplicate-classes) — same class twice is dead weight.

## Modernization

- [no-deprecated-classes](./no-deprecated-classes) — `flex-grow` → `grow`, etc.
- [enforce-canonical](./enforce-canonical) — `-m-0` → `m-0`, `bg-gradient-to-r` → `bg-linear-to-r`,
  etc.
- [no-unnecessary-arbitrary-value](./no-unnecessary-arbitrary-value) — `w-[100%]` → `w-full` when
  the named class emits identical CSS.
- [prefer-theme-tokens](./prefer-theme-tokens) — `border-(--border)` → `border-border` when a named
  utility maps to the same theme variable.
- [prefer-scale-token](./prefer-scale-token) — `p-[10px]` → `p-2.5`, `w-[200px]` → `w-50` when the
  token is the same VALUE (report-only; the CSS differs textually).
- [enforce-negative-arbitrary-values](./enforce-negative-arbitrary-values) — `-top-[5px]` →
  `top-[-5px]`.

## Style and consistency

- [enforce-sort-order](./enforce-sort-order) — sort classes in the official Tailwind order.
- [consistent-variant-order](./consistent-variant-order) — `dark:hover:` vs `hover:dark:`.
- [enforce-consistent-important-position](./enforce-consistent-important-position) — prefix `!flex`
  vs suffix `flex!`.
- [enforce-consistent-line-wrapping](./enforce-consistent-line-wrapping) — one class per line vs all
  on one.
- [enforce-consistent-variable-syntax](./enforce-consistent-variable-syntax) — `bg-(--x)` vs
  `bg-[var(--x)]`.
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

Each rule's page covers:

- **What it does**, in one paragraph.
- **Options** with their default values and a description per option.
- **Correct / incorrect examples**.
- **When to disable it** — the use cases where this rule is the wrong fit.
- For DS-dependent rules: whether `entryPoint` is required (always yes in v1) and what happens when
  it's missing.

## Defaults reference

A quick lookup table for what each rule does when you turn it on without overriding
`meta.defaultOptions`.

### DS-dependent rules

These rules require `settings.tailwindcss.entryPoint` to be set; they emit a fatal
`designSystemUnavailable` diagnostic when it isn't.

| Rule                             | Default options                         |
| -------------------------------- | --------------------------------------- |
| `enforce-canonical`              | `{}`                                    |
| `enforce-sort-order`             | `{ mode: 'default' }`                   |
| `no-conflicting-classes`         | `{ reportRedundant: true }`             |
| `no-unknown-classes`             | `{ allowlist: [], ignorePrefixes: [] }` |
| `no-unnecessary-arbitrary-value` | `{}`                                    |
| `prefer-scale-token`             | `{}`                                    |
| `prefer-theme-tokens`            | `{}`                                    |

### DS-optional rules

These work with nothing configured — their fallback is deterministic on its own — and get more
accurate when an `entryPoint` is available. None of them can emit `designSystemUnavailable`. Each
also accepts a rule-level `entryPoint` that overrides the shared setting.

| Rule                        | Default options                        | What the design system adds                                  |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| `consistent-variant-order`  | `{}` (DS-derived order when available) | Real variant order, and what each variant's selector does    |
| `enforce-logical`           | `{ allowlist: [], direction: 'both' }` | Confirms the suggested class exists                          |
| `enforce-physical`          | `{ allowlist: [], direction: 'both' }` | Confirms the suggested class exists                          |
| `enforce-shorthand`         | `{}`                                   | Verifies each merge against the emitted CSS                  |
| `no-contradicting-variants` | `{}`                                   | What each variant's selector does                            |
| `no-dark-without-light`     | `{ variants: ['dark'] }`               | Groups the base by declared CSS property, not just by prefix |
| `no-deprecated-classes`     | `{}`                                   | Derives the rename list instead of using the built-in table  |

### DS-independent rules

| Rule                                    | Default options                 |
| --------------------------------------- | ------------------------------- |
| `enforce-consistent-important-position` | `{ position: 'suffix' }`        |
| `enforce-consistent-line-wrapping`      | `{ printWidth: 80 }`            |
| `enforce-consistent-variable-syntax`    | `{ syntax: 'shorthand' }`       |
| `enforce-negative-arbitrary-values`     | (no options)                    |
| `max-class-count`                       | `{ max: 20 }`                   |
| `no-arbitrary-value`                    | `{ allow: [] }`                 |
| `no-duplicate-classes`                  | (no options)                    |
| `no-hardcoded-colors`                   | `{ allow: [] }`                 |
| `no-restricted-classes`                 | `{ classes: [], patterns: [] }` |
| `no-unnecessary-whitespace`             | (no options)                    |
