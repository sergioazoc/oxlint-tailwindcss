# CLAUDE.md

## Commands

```bash
pnpm build          # Build with tsdown (ESM + CJS + types)
pnpm test           # Run all tests (vitest run)
pnpm test:watch     # Run tests in watch mode
pnpm lint           # Lint with oxlint
pnpm format         # Format with oxfmt
pnpm format:check   # Check formatting
pnpm typecheck      # Type check with tsgo (TypeScript native compiler)
```

Run a single test file: `pnpm vitest run tests/rules/no-duplicate-classes.test.ts`

## Architecture

oxlint plugin with 21 Tailwind CSS v4 linting rules. Uses `@oxlint/plugins`' `createOnce` API (runs once per lint session; returned visitors run on every matching AST node).

Core sync/async bridge: `@tailwindcss/node`'s `__unstable__loadDesignSystem` is async, but `createOnce` is sync. Solved with `execFileSync` child process (`sync-loader.ts`) that pre-computes all data as JSON. Runs ONCE at plugin init, cached by path+mtime.

DS-dependent rules: `no-unknown-classes`, `no-conflicting-classes`, `no-deprecated-classes`, `enforce-canonical`, `enforce-sort-order`, `no-unnecessary-arbitrary-value`. `consistent-variant-order` optionally uses DS.

## Key Constraints

- **Options timing**: `entryPoint` is the only option read at `createOnce()` top level. ALL other options must be read lazily inside `check()` via `safeOptions()` — they're null in `createOnce()`.
- **`safeOptions()` / `safeSettings()`**: Uses try/catch for backwards compat with oxlint <1.31.0. Always use these instead of accessing `context.options` or `context.settings` directly — both throw in `createOnce()`.
- **Entry point resolution**: rule option `entryPoint` > `settings.tailwindcss.entryPoint` > auto-detect.
- **Graceful degradation**: If the design system can't load, return `{}` from `createOnce()`. Never crash.
- **`canonicalizeCandidates()`**: Deduplicates results — must be called one class at a time, NOT in batch.
- **`getClassList()` gaps**: Some valid classes (`grow-1`, `border-1`) are missing from the list. Arbitrary values handled by heuristic.
- **Floating point**: All rem/em/px operations go through `roundRemValue()`.
- **Hot path awareness**: Visitors run on every AST node. Compile regexes at module/createOnce level, not inside visitors. Avoid recomputing transforms — cache results from the first pass.
- **Runtime deps**: Only `@tailwindcss/node` and `tailwindcss`. No synckit, no workers.
