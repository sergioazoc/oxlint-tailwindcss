# CLAUDE.md

## Monorepo layout

This repository is a pnpm workspace with two packages:

- **`packages/oxlint-tailwindcss/`** — the published npm package. The library implementing the Tailwind CSS linting rules.
- **`packages/docs/`** — the VitePress v2 documentation site (English default, Spanish at `/es`).

All top-level scripts (`pnpm build`, `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm typecheck`) pass through to `packages/oxlint-tailwindcss/`. Targets in the docs site use `pnpm -C packages/docs <script>` explicitly.

## Commands

From the workspace root:

```bash
pnpm install          # install all workspaces
pnpm build            # build the plugin (delegates to packages/oxlint-tailwindcss)
pnpm test             # run plugin test suite (vitest run, excluding benchmarks)
pnpm test:watch       # watch mode
pnpm lint             # oxlint over the plugin sources
pnpm format           # oxfmt --write
pnpm format:check     # oxfmt . (no write)
pnpm typecheck        # tsgo --noEmit
pnpm -C packages/docs dev   # local docs site
```

Run a single test file: `pnpm -C packages/oxlint-tailwindcss exec vitest run tests/rules/no-duplicate-classes.test.ts`

## Versioning

Always use **semver** for version bumps: patch (x.y.Z) for bugfixes only, minor (x.Y.0) for new features or non-breaking additions, major (X.0.0) for breaking changes. `packages/oxlint-tailwindcss/package.json` carries the published version; the root `package.json` is `private` and stays at `0.0.0`.

## Architecture

oxlint plugin with 23 Tailwind CSS v4 linting rules. Uses `@oxlint/plugins`' `createOnce` API (runs once per lint session; returned visitors run on every matching AST node).

**v1.0.0 philosophy — deterministic, explicit, fail-loud.** The plugin used to auto-detect the CSS entry point, fall back to a module-level `lastLoadedPath`, and silently skip rules when the design system could not be loaded. v1.0.0 removed all of that: `settings.tailwindcss.entryPoint` is mandatory; failures surface as a fatal `designSystemUnavailable` diagnostic; mtime is in-memory only (content hash is the disk-cache key). The trade-off — one extra config line for every project, in exchange for "configure once, never fails" — was an intentional alignment with prettier-plugin-tailwindcss / oxfmt / better-tailwindcss.

Core sync/async bridge: `@tailwindcss/node`'s `__unstable__loadDesignSystem` is async, but `createOnce` is sync. Two strategies:

1. **Precompute** (`sync-loader.ts`): `execFileSync` child process pre-computes validity, canonical forms, CSS props, etc. as JSON. Runs ONCE per unique CSS entry point, cached on disk by content hash (single-level cache in v1). Throws `DesignSystemLoadError` on any failure — never returns null. Content-based caching allows monorepo packages with identical CSS to share a single cache entry.
2. **Sort service** (`sort-service.ts`): Worker thread communicates via `SharedArrayBuffer` + `Atomics.wait()` for `enforce-sort-order`. Loads the DS once, then accepts sort requests synchronously with built-in timeout support (60 s init, 30 s per request). Calls `ds.getClassOrder()` dynamically with the actual classes — produces the exact official Tailwind sort order. The parent thread resolves `@tailwindcss/node` via `require.resolve()` and passes the path to the worker. v1 removed the heuristic-sort fallback: when the worker fails, the rule emits the fatal diagnostic and the file's sort check is skipped.
3. **Canonicalize service** (`canonicalize-service.ts`): same SharedArrayBuffer + Atomics pattern for `enforce-canonical`. Calls `ds.canonicalizeCandidates([cls], { rem })` one class at a time. Process-wide per-class cache keyed by `${cssPath}\0${rem}\0${class}`.

DS-dependent rules: `no-unknown-classes`, `no-conflicting-classes`, `no-deprecated-classes`, `enforce-canonical`, `enforce-sort-order`, `no-unnecessary-arbitrary-value`, `prefer-theme-tokens`. `consistent-variant-order` is the sole DS-optional rule — its static-order fallback is itself deterministic, so a missing entryPoint is tolerated silently there.

## Extraction System

`extractors.ts` is the shared class-detection layer used by all rules. Every rule delegates to `createExtractorVisitors(context, check)` which generates the 4 standard AST visitors and resolves the extractor config lazily from `settings.tailwindcss`.

**Default detection targets** (extended additively via settings):

- **Attributes**: `className`, `class` (JSX)
- **Callees** (14): `cn`, `clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`, `ctl`, `twJoin`, `cc`, `clb`, `cnb`, `objstr`, `classed`
- **Tags**: `tw` (tagged template literals: `` tw`bg-red-500` ``)
- **Variable patterns**: identifiers matching `/^classNames?$/`, `/^classes$/`, `/^styles?$/`

**Custom configuration** via `settings.tailwindcss` (all additive to defaults):

- `attributes: string[]` — additional JSX attribute names
- `callees: string[]` — additional function names
- `tags: string[]` — additional tagged template tags
- `variablePatterns: string[]` — additional regex patterns for variable names (as strings, compiled to RegExp)
- `exclude: { attributes?, callees?, tags?, variablePatterns? }` — remove specific items from defaults. For `variablePatterns`, exclusions match against `RegExp.source`.

Config is resolved lazily by `getExtractorConfig(context)` on first visitor call. **v1 cache: per-context `WeakMap`** — module-level state is gone. Two parallel rule contexts no longer race on a global. `resetExtractorConfig(context?)` survives for test isolation but is now mostly a no-op (the WeakMap drops entries automatically when the context goes out of scope).

**Deep extraction**: `cva()` understands `variants`, `compoundVariants`, ignores `defaultVariants`. `tv()` understands `base`, `slots`, `variants` (with slot sub-objects), `compoundVariants`, `compoundSlots`. `classed()` (tw-classed) skips first arg (element type), then extracts class strings and cva-like config from remaining args.

- **JSX object values**: `classNames={{ root: "flex", label: "text-sm" }}` extracts string values from the object (not keys). This is distinct from call-expression objects like `cn({ "bg-red-500": cond })` which extract keys.
- **Expressions**: ternaries (`cond ? "a" : "b"`), logical (`flag && "a"`), object keys (`cn({ "bg-red-500": cond })`), template literals with leading/trailing space preservation across expressions.

AST visitors: `JSXAttribute`, `CallExpression`, `TaggedTemplateExpression`, `VariableDeclarator`.

## Key Constraints

- **Lazy DS loading**: `context.settings` and `context.filename` throw in `createOnce()`. DS-dependent rules use `createLazyLoader(context)` which defers loading to the first visitor call. When the resolved entry-point changes between files (monorepo with mapping array), the loader picks up the new entry. There is no `lastLoadedPath` fallback — the loader always re-resolves from settings.
- **Options timing**: ALL options must be read lazily inside `check()` via `safeOptions()` — they're null in `createOnce()`.
- **Entry point resolution** (v1, deterministic): rule option `entryPoint` (a string) > `settings.tailwindcss.entryPoint`. The settings value is either:
  - `string` — a single CSS path for the whole project, or
  - `EntryPointMapping[]` (`{ files: glob | glob[], use: path }[]`) — first matching glob wins, evaluated against the linted file's path relative to `process.cwd()`.
  The legacy `string[]` shape is removed; supplying it throws `DeprecatedEntryPointShapeError` with the migration snippet inline. If nothing resolves, `MissingEntryPointError` is thrown and the rule emits a `designSystemUnavailable` diagnostic.
- **Multi-DS cache**: `loader.ts` uses `dsCache: Map<string, { cache, mtime }>` to store multiple design systems simultaneously. Each unique resolved CSS gets its own entry. In monorepos with the mapping shape, distinct globs can map to distinct CSS files in the same lint run.
- **Configurable timeout**: `settings.tailwindcss.timeout` (number, default 60_000 ms in v1). Worker init and request timeouts default to 60 s and 30 s respectively.
- **Debug logging**: `settings.tailwindcss.debug: true` or `DEBUG=oxlint-tailwindcss` env var. Off by default — fatal errors always surface as rule diagnostics, not console output.
- **Fail-loud (v1)**: If the DS can't load, DS-dependent rules emit a single `designSystemUnavailable` diagnostic via the shared `safeGetDS` helper in `src/utils/fatal.ts`. There is no silent fallback. The dedicated error types — `MissingEntryPointError`, `DeprecatedEntryPointShapeError`, `DesignSystemLoadError`, `SortServiceError` — all extend `OxlintTailwindError` and carry an optional `hint` field that renders alongside the message. The one legitimate exception is `consistent-variant-order`, whose static fallback is itself deterministic and can stand in for the DS.
- **`!` (important) modifier**: Tailwind supports prefix (`!flex`) and suffix (`flex!`). ALL rules that do class lookups or transformations MUST strip `!` before lookups and re-add it in the same position. Cache methods (`getOrder`, `canonicalize`, `getCssProperties`, `getNamedEquivalent`) handle `!` internally via `stripImportant()`. Rules doing direct string comparisons must strip manually.
- **Disk cache (v1)**: `sync-loader.ts` caches precomputed DS JSON in `os.tmpdir()/oxlint-tailwindcss/` keyed **only** by content hash. The legacy two-level mtime-index + content-cache scheme is gone; mtime is tracked in memory inside `loader.ts` for the per-process fast path. `CACHE_KEY` (computed once at module load) is `${md5(PRECOMPUTE_SCRIPT).slice(0,8)}:${tailwindVersion}` — invalidates the cache on CSS content changes, precompute-script changes, or `@tailwindcss/node` version changes. Content-based caching enables monorepo deduplication.
- **CSS property extraction**: `extractRootCssProps()` in PRECOMPUTE_SCRIPT parses CSS blocks with brace-depth tracking. For plugin classes with nesting (e.g. `prose`), only top-level declarations are extracted.
- **Modifier class detection**: Classes referenced via `[class~="..."]` attribute selectors in CSS output (e.g. `not-prose`) are added to `componentClasses` so `no-unknown-classes` recognizes them.
- **Animate plugin composition** (`tailwindcss-animate`, `tw-animate-css`): `animate-in`/`animate-out` initialize all `--tw-enter-*`/`--tw-exit-*` custom properties to `initial`, and modifiers each override one of those vars. Two explicit `COMPOSITION_PAIRS` entries in `no-conflicting-classes.ts` whitelist the `animate-in`/`animate-out` ↔ modifier pairs.
- **`canonicalizeCandidates()`**: Deduplicates results — must be called one class at a time, NOT in batch.
- **`getClassList()` gaps**: Some valid classes (`grow-1`, `border-1`, `underline-offset-3`) are missing from the list. `cache.getOrder()` falls back to prefix lookup for dynamic numeric values. Arbitrary values handled by heuristic.
- **Legacy v3 spellings in the canonical map** (issue #16): the precompute step in `sync-loader.ts` feeds a hardcoded seed list plus dynamic `start-*`/`end-*` derived from existing `inset-{s,e}-*` utilities into `canonicalizeCandidates()` and adds the diffs to the canonical map. Legacy classes are also pushed into `validClasses` so `no-unknown-classes` doesn't flag them.
- **Floating point**: All rem/em/px operations go through `roundRemValue()`.
- **Pseudo-element variant ordering**: `consistent-variant-order` partitions variants so pseudo-elements stay innermost (closest to the utility).
- **Hot path awareness**: Visitors run on every AST node. Compile regexes at module/createOnce level, not inside visitors.
- **Multiline-safe class string rebuilding**: rules use `splitClassesWithSeparators` + `rebuildClassString` from `class-splitter.ts` to preserve `\n` + indent introduced by `enforce-consistent-line-wrapping`. The matrix test in `tests/integration/multiline-preservation.test.ts` locks behavior down per rule.
- **Sort service lifecycle**: `sort-service.ts` spawns a Worker thread on first `enforce-sort-order` use. `worker.unref()` so the process can exit. Restarts on entry-point change. In v1 a worker failure throws `SortServiceError` instead of silently degrading to the heuristic sort.
- **Suggestions API**: 10 rules provide `suggest` in `context.report()` for IDE quick-fixes. All use `messageId: 'suggestReplace'` with `hasSuggestions: true` in meta.
- **`defaultOptions`**: every rule with options declares `meta.defaultOptions`. Rules with `schema: []` (no options) deliberately do NOT declare it — oxlint's schema validator rejects `{}` against an empty schema. `consistent-variant-order` declares `defaultOptions: [{}]` (no `order`) so that leaving `order` undefined still triggers the DS-vs-static fallback detection.
- **Runtime deps**: only `@tailwindcss/node` and `tailwindcss`. No synckit, no external workers.
- **Arbitrary→named overlap** (`enforce-canonical` ↔ `no-unnecessary-arbitrary-value` ↔ `prefer-theme-tokens`): three rules can transform an arbitrary value into a named utility, each owning a distinct case so they don't double-fire on the same input. Coexistence matrix locked down in `tests/integration/prefer-theme-tokens-coexistence.test.ts`.
- **`arbitraryEquivalents` precompute**: for each named utility, the precompute step enumerates every dash split point and emits one candidate per prefix (e.g. `bg-card-foreground` produces both `bg-[<value>]` and `bg-card-[<value>]`). Loop starts at `cls.indexOf('-', 1)` so negative utilities (`-translate-x-1`) keep their leading `-`. Tailwind's `candidatesToCss` is the source of truth.

## Tests

Two helpers live in `tests/utils/with-fixture.ts`:

- `withFixture(cases, entryPoint)` — maps a list of `RuleTester` cases, injecting `settings.tailwindcss.entryPoint`.
- `runWithFixture(tester, name, rule, entryPoint, cases)` — wrapper around `RuleTester.run` that pre-applies `withFixture` to both `valid` and `invalid` arrays.
- `makeFixtureRunner(entryPoint)` — returns a one-shot `run(name, rule, cases)` bound to a fixture, useful when a test file has many small `new RuleTester().run(...)` blocks sharing the same DS.

Every DS-dependent rule test in v1 declares its `entryPoint` via one of these helpers — there is no shared in-memory fallback the suite can rely on accidentally.
