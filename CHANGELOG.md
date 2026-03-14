# Changelog

## 0.1.3 (2026-03-14)

- Fix all autofix rules stripping leading/trailing spaces in template literals (e.g., `` `h-3 w-3 ${x}` `` → `` `size-3${x}` ``). Affected rules: `enforce-shorthand`, `enforce-sort-order`, `enforce-canonical`, `enforce-logical`, `enforce-consistent-variable-syntax`, `enforce-consistent-important-position`, `enforce-negative-arbitrary-values`, `enforce-consistent-line-wrapping`, `consistent-variant-order`, `no-duplicate-classes`, `no-deprecated-classes`, `no-unnecessary-arbitrary-value`.

## 0.1.2 (2026-03-14)

- **no-contradicting-variants**: Fix false positives for variants that target different elements — pseudo-elements (`after:`, `before:`, `file:`, `placeholder:`), child/descendant selectors (`*:`, `**:`), and arbitrary selectors (`[&>svg]:`, `[&_div]:`).
- Remove unused `tailwind-api.ts` module.

## 0.1.1 (2026-03-14)

- Renamed package from `oxlint-plugin-tailwindcss` to `oxlint-tailwindcss`.

## 0.1.0 (2026-03-13)

Initial release with 21 Tailwind CSS v4 linting rules for oxlint.

### Correctness Rules

- **no-unknown-classes** — Flags classes not defined in the Tailwind design system, with typo suggestions via Levenshtein distance.
- **no-duplicate-classes** — Detects and auto-fixes duplicate classes within class strings.
- **no-conflicting-classes** — Warns when two classes affect the same CSS properties.
- **no-deprecated-classes** — Flags deprecated Tailwind v4 classes (`flex-grow` → `grow`, etc.) with auto-fix.
- **no-unnecessary-whitespace** — Normalizes extra spaces in class strings.
- **no-dark-without-light** — Requires a base utility when using `dark:` variant on the same element.

### Style Rules

- **enforce-sort-order** — Sorts classes according to Tailwind's official order with auto-fix.
- **enforce-canonical** — Rewrites non-canonical forms to their canonical equivalents (e.g., `-m-0` → `m-0`).
- **enforce-shorthand** — Suggests shorthand classes when all axes share the same value (`mt-2 mr-2 mb-2 ml-2` → `m-2`).
- **enforce-logical** — Suggests logical properties for RTL/LTR support (`ml-4` → `ms-4`).
- **enforce-consistent-important-position** — Enforces consistent `!` position: prefix (`!font-bold`) or suffix (`font-bold!`). Auto-fix.
- **enforce-negative-arbitrary-values** — Moves negative outside brackets inside: `-top-[5px]` → `top-[-5px]`. Auto-fix.
- **enforce-consistent-variable-syntax** — Enforces v4 shorthand `bg-(--var)` or explicit `bg-[var(--var)]`. Auto-fix.
- **consistent-variant-order** — Enforces variant order: responsive before state (`hover:sm:flex` → `sm:hover:flex`). Auto-fix.
- **no-unnecessary-arbitrary-value** — Replaces arbitrary values with named equivalents when available (`h-[auto]` → `h-auto`). Auto-fix.

### Complexity Rules

- **max-class-count** — Warns when an element exceeds the class count limit (default: 20).
- **enforce-consistent-line-wrapping** — Warns when a class string exceeds the print width (default: 80).

### Restriction Rules

- **no-restricted-classes** — Blocks specific classes by name or regex pattern.
- **no-arbitrary-value** — Prohibits arbitrary values (`w-[200px]`) to enforce design system usage.
- **no-hardcoded-colors** — Flags hardcoded color values like `bg-[#ff5733]` or `text-[rgb()]`.
- **no-contradicting-variants** — Detects redundant variant classes (`flex dark:flex`).

### Features

- Synchronous design system loading via `execFileSync` — no async overhead in the lint loop.
- Auto-detection of Tailwind CSS entry point (walks up from CWD).
- Supports JSX attributes, `cn()`/`clsx()`/`cva()`/`twMerge()`/`tv()` calls, and `tw` tagged templates.

- Graceful degradation — rules that need the design system return no errors if it can't load.
