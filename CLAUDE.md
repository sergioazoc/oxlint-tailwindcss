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

oxlint plugin with 22 Tailwind CSS v4 linting rules. Uses `@oxlint/plugins`' `createOnce` API (runs once per lint session; returned visitors run on every matching AST node).

Core sync/async bridge: `@tailwindcss/node`'s `__unstable__loadDesignSystem` is async, but `createOnce` is sync. Solved with `execFileSync` child process (`sync-loader.ts`) that pre-computes all data as JSON. Runs ONCE at plugin init, cached by path+mtime.

DS-dependent rules: `no-unknown-classes`, `no-conflicting-classes`, `no-deprecated-classes`, `enforce-canonical`, `enforce-sort-order`, `no-unnecessary-arbitrary-value`. `consistent-variant-order` optionally uses DS.

## Key Constraints

- **Lazy DS loading**: `context.settings` and `context.filename` throw in `createOnce()`. DS-dependent rules use `createLazyLoader(context)` which defers loading to the first visitor call where full context is available. Auto-detect uses `context.filename` to walk up from the linted file.
- **Options timing**: ALL options must be read lazily inside `check()` via `safeOptions()` — they're null in `createOnce()`.
- **Entry point resolution**: rule option `entryPoint` > `settings.tailwindcss.entryPoint` > auto-detect (from linted file path).
- **Graceful degradation**: If the design system can't load, DS-dependent rules silently skip (return from `check()`). Never crash.
- **`!` (important) modifier**: Tailwind supports prefix (`!flex`) and suffix (`flex!`). ALL rules that do class lookups or transformations MUST strip `!` before lookups and re-add it in the same position. Cache methods (`getOrder`, `canonicalize`, `getCssProperties`, `getNamedEquivalent`) handle `!` internally via `stripImportant()`. Rules doing direct string comparisons (e.g., against `DEPRECATED_MAP`) must strip manually.
- **Disk cache**: `sync-loader.ts` caches precomputed DS JSON in `/tmp/oxlint-tailwindcss/` keyed by `md5(path:mtime)`. Invalidates automatically when CSS changes.
- **`canonicalizeCandidates()`**: Deduplicates results — must be called one class at a time, NOT in batch.
- **`getClassList()` gaps**: Some valid classes (`grow-1`, `border-1`) are missing from the list. Arbitrary values handled by heuristic.
- **Floating point**: All rem/em/px operations go through `roundRemValue()`.
- **Hot path awareness**: Visitors run on every AST node. Compile regexes at module/createOnce level, not inside visitors. Avoid recomputing transforms — cache results from the first pass.
- **Runtime deps**: Only `@tailwindcss/node` and `tailwindcss`. No synckit, no workers.
