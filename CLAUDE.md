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

Core sync/async bridge: `@tailwindcss/node`'s `__unstable__loadDesignSystem` is async, but `createOnce` is sync. Two strategies:

1. **Precompute** (`sync-loader.ts`): `execFileSync` child process pre-computes validity, canonical forms, CSS props, etc. as JSON. Runs ONCE at plugin init, cached by path+mtime on disk.
2. **Sort service** (`sort-service.ts`): Worker thread communicates via `SharedArrayBuffer` + `Atomics.wait()` for `enforce-sort-order`. Loads the DS once, then accepts sort requests synchronously with built-in timeout support. This calls `ds.getClassOrder()` dynamically with the actual classes, producing the exact official Tailwind sort order (identical to oxfmt/prettier-plugin-tailwindcss). Falls back to heuristic sort if the worker fails to initialize.

DS-dependent rules: `no-unknown-classes`, `no-conflicting-classes`, `no-deprecated-classes`, `enforce-canonical`, `enforce-sort-order`, `no-unnecessary-arbitrary-value`. `consistent-variant-order` optionally uses DS.

## Extraction System

`extractors.ts` is the shared class-detection layer used by all 22 rules. Every rule delegates to the same extractors via `DEFAULT_EXTRACTOR_CONFIG`:

- **Attributes**: `className`, `class` (JSX)
- **Callees** (13): `cn`, `clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`, `ctl`, `twJoin`, `cc`, `clb`, `cnb`, `objstr`
- **Tags**: `tw` (tagged template literals: `` tw`bg-red-500` ``)
- **Variable patterns**: identifiers matching `/^classNames?$/`, `/^classes$/`, `/^styles?$/`
- **Deep extraction**: `cva()` understands `variants`, `compoundVariants`, ignores `defaultVariants`. `tv()` understands `base`, `slots`, `variants` (with slot sub-objects), `compoundVariants`, `compoundSlots`.
- **Expressions**: ternaries (`cond ? "a" : "b"`), logical (`flag && "a"`), object keys (`cn({ "bg-red-500": cond })`), template literals with leading/trailing space preservation across expressions.

AST visitors: `JSXAttribute`, `CallExpression`, `TaggedTemplateExpression`, `VariableDeclarator`. All rules follow the same pattern — call `extractFrom*()`, then run rule logic on the returned `ClassLocation[]`.

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
- **Sort service lifecycle**: `sort-service.ts` spawns a Worker thread on first `enforce-sort-order` use. Uses `SharedArrayBuffer` + `Atomics.wait()` with timeouts (30s init, 10s per request). Cleaned up on `process.on('exit')`. Falls back to heuristic sort in `cache.getClassOrder()` if the worker fails.
- **Runtime deps**: Only `@tailwindcss/node` and `tailwindcss`. No synckit, no external workers.
