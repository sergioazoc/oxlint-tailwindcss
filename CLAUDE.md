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

## Versioning

Always use **semver** for version bumps: patch (x.y.Z) for bugfixes only, minor (x.Y.0) for new features or non-breaking additions, major (X.0.0) for breaking changes.

## Architecture

oxlint plugin with 23 Tailwind CSS v4 linting rules. Uses `@oxlint/plugins`' `createOnce` API (runs once per lint session; returned visitors run on every matching AST node).

Core sync/async bridge: `@tailwindcss/node`'s `__unstable__loadDesignSystem` is async, but `createOnce` is sync. Two strategies:

1. **Precompute** (`sync-loader.ts`): `execFileSync` child process pre-computes validity, canonical forms, CSS props, etc. as JSON. Runs ONCE per unique CSS entry point, cached on disk via two-level cache (mtime index + content hash). Content-based caching allows monorepo packages with identical CSS to share a single cache entry.
2. **Sort service** (`sort-service.ts`): Worker thread communicates via `SharedArrayBuffer` + `Atomics.wait()` for `enforce-sort-order`. Loads the DS once, then accepts sort requests synchronously with built-in timeout support. This calls `ds.getClassOrder()` dynamically with the actual classes, producing the exact official Tailwind sort order (identical to oxfmt/prettier-plugin-tailwindcss). The parent thread resolves `@tailwindcss/node` via `require.resolve()` and passes the path to the worker — this is critical for VS Code's extension host where module resolution context differs. Falls back to heuristic sort if the worker fails to initialize.
3. **Canonicalize service** (`canonicalize-service.ts`): Worker thread (same SharedArrayBuffer + Atomics pattern as sort-service) for `enforce-canonical`. Calls `ds.canonicalizeCandidates([cls], { rem })` one class at a time (the API deduplicates input, so batching loses order/length for inputs with duplicates). Enables canonicalization of arbitrary user classes (`p-[2px]` → `p-0.5`, `text-[var(--x)]/90` → `text-(--x)/90`, `theme()` functions, etc.) that can't be precomputed. `rem` comes from `settings.tailwindcss.rootFontSize` (default: 16). Has a process-wide per-class cache keyed by `${cssPath}\0${rem}\0${class}` — only cache misses cross the worker boundary. Falls back to precomputed cache if worker fails. `enforce-canonical` itself only routes classes with `[` or `(` in the utility (detected via `utilityHasDynamicValue`) to the worker; named classes resolve directly via `cache.canonicalize` (sync, sub-microsecond, already preserves `!` position), which is ~5x faster in practice.

DS-dependent rules: `no-unknown-classes`, `no-conflicting-classes`, `no-deprecated-classes`, `enforce-canonical`, `enforce-sort-order`, `no-unnecessary-arbitrary-value`, `prefer-theme-tokens`. `consistent-variant-order` optionally uses DS.

## Extraction System

`extractors.ts` is the shared class-detection layer used by all 22 rules. Every rule delegates to `createExtractorVisitors(context, check)` which generates the 4 standard AST visitors and resolves the extractor config lazily from `settings.tailwindcss`.

**Default detection targets** (extended additively via settings):

- **Attributes**: `className`, `class` (JSX)
- **Callees** (14): `cn`, `clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`, `ctl`, `twJoin`, `cc`, `clb`, `cnb`, `objstr`, `classed`
- **Tags**: `tw` (tagged template literals: `` tw`bg-red-500` ``)
- **Variable patterns**: identifiers matching `/^classNames?$/`, `/^classes$/`, `/^styles?$/`

**Custom configuration** via `settings.tailwindcss` (all additive to defaults):

- `attributes: string[]` — additional JSX attribute names (e.g. `["xyzClassName", "classNames"]`)
- `callees: string[]` — additional function names (e.g. `["myHelper"]`)
- `tags: string[]` — additional tagged template tags
- `variablePatterns: string[]` — additional regex patterns for variable names (as strings, compiled to RegExp)
- `exclude: { attributes?, callees?, tags?, variablePatterns? }` — remove specific items from defaults. For `variablePatterns`, exclusions match against `RegExp.source` (e.g. `"^styles?$"` removes `/^styles?$/`).

Config is resolved lazily by `getExtractorConfig(context)` on first visitor call (settings unavailable in `createOnce`). Cached in module-level variable; `resetExtractorConfig()` for test isolation.

**Deep extraction**: `cva()` understands `variants`, `compoundVariants`, ignores `defaultVariants`. `tv()` understands `base`, `slots`, `variants` (with slot sub-objects), `compoundVariants`, `compoundSlots`. `classed()` (tw-classed) skips first arg (element type), then extracts class strings and cva-like config from remaining args.

- **JSX object values**: `classNames={{ root: "flex", label: "text-sm" }}` extracts string values from the object (not keys). This is distinct from call-expression objects like `cn({ "bg-red-500": cond })` which extract keys.
- **Expressions**: ternaries (`cond ? "a" : "b"`), logical (`flag && "a"`), object keys (`cn({ "bg-red-500": cond })`), template literals with leading/trailing space preservation across expressions.

AST visitors: `JSXAttribute`, `CallExpression`, `TaggedTemplateExpression`, `VariableDeclarator`. All rules use `createExtractorVisitors(context, check)` to generate these visitors.

## Key Constraints

- **Lazy DS loading**: `context.settings` and `context.filename` throw in `createOnce()`. DS-dependent rules use `createLazyLoader(context)` which defers loading to the first visitor call where full context is available. The loader re-resolves when `context.filename` changes between files, supporting monorepos where different files need different design systems. Auto-detect results are cached by directory. When a fixed `entryPoint` is provided (rule option or settings), it's cached once and used for all files.
- **Options timing**: ALL options must be read lazily inside `check()` via `safeOptions()` — they're null in `createOnce()`.
- **Entry point resolution**: rule option `entryPoint` > `settings.tailwindcss.entryPoint` > auto-detect (from linted file path). `entryPoint` in settings accepts `string | string[]` — when array, the closest entry point to the linted file is chosen via longest common directory prefix (`resolveClosestEntryPoint` in `loader.ts`). Auto-detect walks up from the linted file and stops at the nearest `package.json` boundary. Follows `@import` statements one level deep if the candidate file doesn't contain a direct Tailwind signal (`resolveImport` + `hasTailwindSignalInImports` in `auto-detect.ts`). Auto-detect results are cached by directory in `autoDetectCache`. The `lastLoadedPath` fallback is only set by explicit `entryPoint` calls (rule option or settings), never by auto-detect — this prevents cross-package contamination in monorepos.
- **Multi-DS cache**: `loader.ts` uses `dsCache: Map<string, { cache, mtime }>` to store multiple design systems simultaneously. Each unique CSS entry point gets its own cache entry. `createLazyLoader` re-resolves per file when `context.filename` changes, but caches by fixed entry point when one is provided.
- **Configurable timeout**: `settings.tailwindcss.timeout` (number, default 30000ms) controls the `execFileSync` timeout for design system loading. Useful for slow CI or large monorepos.
- **Debug logging**: `settings.tailwindcss.debug: true` or `DEBUG=oxlint-tailwindcss` env var enables debug output to stderr. Shows which DS loads and which file maps to which entry point. Implemented in `debug.ts`, initialized lazily in `createLazyLoader` on first settings access. Off by default — error logs (failed DS loads) always print.
- **Graceful degradation**: If the design system can't load, DS-dependent rules silently skip (return from `check()`). Never crash.
- **`!` (important) modifier**: Tailwind supports prefix (`!flex`) and suffix (`flex!`). ALL rules that do class lookups or transformations MUST strip `!` before lookups and re-add it in the same position. Cache methods (`getOrder`, `canonicalize`, `getCssProperties`, `getNamedEquivalent`) handle `!` internally via `stripImportant()`. Rules doing direct string comparisons (e.g., against `DEPRECATED_MAP`) must strip manually.
- **Disk cache**: `sync-loader.ts` caches precomputed DS JSON in `os.tmpdir()/oxlint-tailwindcss/` via two-level cache: mtime index (`.idx`, keyed by `md5(CACHE_KEY:path:mtime)`) maps to content hash, and content cache (`.json`, keyed by `md5(CACHE_KEY:content)`) stores the precomputed data. `CACHE_KEY` (computed once at module load) is `${md5(PRECOMPUTE_SCRIPT).slice(0,8)}:${tailwindVersion}` — see `computeCacheKey` and `readTailwindVersion` in `sync-loader.ts`. This auto-invalidates the cache on three independent signals: CSS content changes (mtime/hash), our precompute logic changes (script hash), or the installed `@tailwindcss/node` version changes (e.g. 4.2 → 4.3 adding new utilities like `zoom-*`, `tab-*`, `scrollbar-*`). Content-based caching enables monorepo deduplication — packages with identical CSS share one cache entry.
- **CSS property extraction**: `extractRootCssProps()` in the PRECOMPUTE_SCRIPT parses CSS blocks with brace-depth tracking. For plugin classes with CSS nesting (e.g. `prose` from `@tailwindcss/typography`), only top-level declarations are extracted — nested descendant selectors are skipped. Falls back to extracting all properties if root selector matching fails (e.g. escaped selectors).
- **Modifier class detection**: Classes referenced via `[class~="..."]` attribute selectors in CSS output (e.g. `not-prose`) are added to `componentClasses` so `no-unknown-classes` recognizes them.
- **Animate plugin composition** (`tailwindcss-animate`, `tw-animate-css`): `animate-in`/`animate-out` initialize all `--tw-enter-*`/`--tw-exit-*` custom properties to `initial`, and modifiers (`fade-in`, `zoom-in`, `spin-in`, `slide-in-from-*`, `blur-in`) each override one of those vars. They overlap on custom properties, so `isCompositionViaCssVars` can't detect this composition. Two explicit `COMPOSITION_PAIRS` entries in `no-conflicting-classes.ts` whitelist the `animate-in`/`animate-out` ↔ modifier pairs. The `blur` branch is `tw-animate-css` only; logical slide variants (`slide-in-from-{start,end}`) are caught by the existing `^slide-in-from-` prefix.
- **`canonicalizeCandidates()`**: Deduplicates results — must be called one class at a time, NOT in batch.
- **`getClassList()` gaps**: Some valid classes (`grow-1`, `border-1`, `underline-offset-3`) are missing from the list. `cache.getOrder()` falls back to prefix lookup for dynamic numeric values. Arbitrary values handled by heuristic.
- **Legacy v3 spellings in the canonical map** (issue #16): `getClassList()` does not enumerate v3 spellings that v4 still accepts (`break-words`, `order-none`, `overflow-ellipsis`, `flex-grow{,-0,-1}`, `flex-shrink{,-0,-1}`, `decoration-clone/slice`, `bg-gradient-to-*`, `start-N`/`end-N` and their negatives), but `ds.canonicalizeCandidates()` does rewrite them (e.g. `break-words → wrap-break-word`, `flex-grow-1 → grow`, `start-1/2 → inset-s-1/2`). Without explicit handling, `enforce-canonical` would skip them. The precompute step in `sync-loader.ts` feeds a hardcoded seed list plus dynamic `start-*`/`end-*` derived from existing `inset-{s,e}-*` utilities into `canonicalizeCandidates()` and adds the diffs to the canonical map. Legacy classes are also pushed into `validClasses` so `no-unknown-classes` doesn't flag them. Arbitrary forms (`flex-grow-[2]`, `start-[10px]`) keep going through the worker, which canonicalizes both the legacy prefix and the value in one pass (`start-[10px] → inset-s-2.5`).
- **Floating point**: All rem/em/px operations go through `roundRemValue()`.
- **Pseudo-element variant ordering**: `consistent-variant-order` uses a `PSEUDO_ELEMENTS` set (`before`, `after`, `file`, `placeholder`, `selection`, `marker`, `backdrop`, `first-line`, `first-letter`, `details-content`) to ensure pseudo-elements are always the innermost variants (closest to the utility). After sorting by priority, the rule partitions into non-pseudo and pseudo variants, placing pseudo last. This applies in both static and DS ordering modes. Rationale: in Tailwind v4's left-to-right variant application, putting a pseudo-element before an element-selecting variant (e.g. `before:[&>svg]:`) produces `&::before { &>svg { ... } }` — pseudo-elements have no children, so this is broken CSS.
- **Hot path awareness**: Visitors run on every AST node. Compile regexes at module/createOnce level, not inside visitors. Avoid recomputing transforms — cache results from the first pass.
- **Multiline-safe class string rebuilding**: `enforce-consistent-line-wrapping` with `classesPerLine` introduces `\n` + indent between class chunks. To prevent every other autofixing rule from collapsing that whitespace back to single spaces (and forming an unfixable cycle), all rules that rebuild a class string use `splitClassesWithSeparators(value)` + `rebuildClassString(split, newClasses)` from `class-splitter.ts` instead of `splitClasses(value)` + `newClasses.join(' ')`. The split captures every whitespace run between classes (plus leading/trailing); the rebuild preserves them verbatim for 1-to-1 transforms (canonical, sort, variant-order, important-position, logical/physical, var-syntax, negative-arb, no-unnecessary-arb, prefer-theme-tokens, no-deprecated, no-unknown suggestions) and degrades gracefully for length-changing rules (no-duplicate, shorthand) by joining with the first newline-bearing internal separator if any. The matrix test in `tests/integration/multiline-preservation.test.ts` locks this behavior down per rule. `no-unnecessary-whitespace` itself is multiline-aware: it collapses runs of `[ \t]+` only within each line, leaving `\n` + indent untouched.
- **Sort service lifecycle**: `sort-service.ts` spawns a Worker thread on first `enforce-sort-order` use. Uses `SharedArrayBuffer` + `Atomics.wait()` with timeouts (30s init, 10s per request). Tracks `currentCssPath` and restarts the worker when the entry point changes (monorepo support). The worker uses `worker.unref()` so the process can exit without waiting — no `process.on('exit')` listener is registered (that would trip `MaxListenersExceededWarning` when the plugin runs in many oxlint worker threads). Falls back to heuristic sort in `cache.getClassOrder()` if the worker fails or during restart. Heuristic sort puts null-order classes first (matching oxfmt/prettier-plugin-tailwindcss behavior for marker classes like `group/name`, `peer/name`).
- **Suggestions API**: 10 rules provide `suggest` in `context.report()` for IDE quick-fixes. Rules with conditional fix (fix on first error, report-only on subsequent) now offer suggestions on the non-first errors. `no-unknown-classes` offers suggestion to replace typos. All use `messageId: 'suggestReplace'` with `hasSuggestions: true` in meta.
- **`defaultOptions`**: 6 rules declare defaults in `meta.defaultOptions` for tooling visibility: `max-class-count`, `enforce-consistent-important-position`, `enforce-consistent-variable-syntax`, `no-dark-without-light`, `no-unknown-classes`, `enforce-consistent-line-wrapping`. Manual `?? fallback` kept as safety net. Excluded `consistent-variant-order` (would break DS vs static order detection).
- **Runtime deps**: Only `@tailwindcss/node` and `tailwindcss`. No synckit, no external workers.
- **Arbitrary→named overlap** (`enforce-canonical` ↔ `no-unnecessary-arbitrary-value` ↔ `prefer-theme-tokens`): three rules can transform an arbitrary value into a named utility, each owning a distinct case so they don't double-fire on a given input.
  - `enforce-canonical` runs `ds.canonicalizeCandidates()` for any class with `[` or `(`. It collapses theme-token references (e.g. `bg-(--color-red-500) → bg-red-500`) and rewrites bracket→paren syntax (`bg-[var(--x)] → bg-(--x)`).
  - `no-unnecessary-arbitrary-value` fires on bracket-form classes whose CSS exactly equals a named utility (looked up via the precomputed `arbitraryEquivalents` map). It does NOT handle paren form — `enforce-canonical` owns that path.
  - `prefer-theme-tokens` (off by default) is a name-match heuristic: for `prefix-(--name)` / `prefix-[var(--name)]`, if `prefix-name` is a valid utility it suggests the replacement. It guards against double-reports by skipping cases where `cache.getNamedEquivalent(bareUtility)` already maps to the same target. Useful in themes where `--X` is a raw variable but `--color-X` wraps it in a color function (e.g. `hsl(var(--X))`) — CSS is NOT equivalent, replacement may change observable output, hence opt-in.
  - Convergence: when the theme exposes the variable directly (`--color-border: var(--border)`), `border-[var(--border)]` is CSS-equivalent to `border-border` and is owned by `no-unnecessary-arbitrary-value`; `border-(--border)` is owned by `prefer-theme-tokens`. When the theme wraps the variable in a color function (`--color-border: hsl(var(--border))`) the bracket form is NOT CSS-equivalent, and `prefer-theme-tokens` (opt-in) is needed for both forms. The coexistence matrix is locked down in `tests/integration/prefer-theme-tokens-coexistence.test.ts`.
- **`arbitraryEquivalents` precompute**: for each named utility, the precompute step in `sync-loader.ts` enumerates every dash split point and emits one candidate per prefix (e.g. `bg-card-foreground` produces both `bg-[<value>]` and `bg-card-[<value>]`). Tailwind's `candidatesToCss` is the source of truth for which split round-trips to the same CSS. Earlier versions used `lastIndexOf('-')` only, which silently dropped every multi-segment mapping (`bg-red-500`, `text-blue-700`, `ring-offset-slate-200`, and any equivalents in user themes). Bump `CACHE_VERSION` when changing this logic to invalidate the disk cache.
