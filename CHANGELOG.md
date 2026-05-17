# Changelog

## 0.8.0 (2026-05-17)

- **Plugin support: `tailwindcss-animate` and `tw-animate-css`** ([#17](https://github.com/sergioazoc/oxlint-tailwindcss/pull/17), thanks @Hexoplon) — When either plugin is imported into your CSS entry point, classes like `animate-in`, `fade-in`, `zoom-in-95`, `slide-out-to-right-96`, `blur-in`, `play-state-initial`, `animate-accordion-down`, the logical (RTL-aware) `slide-{in-from,out-to}-{start,end}-*` variants, and the keyframe utilities used by Radix-style libraries are recognized across every DS-dependent rule. `no-conflicting-classes` also learns that `animate-in`/`animate-out` compose with their `fade`/`spin`/`zoom`/`blur`/`slide` modifiers via two explicit `COMPOSITION_PAIRS` entries — the heuristic can't auto-detect this because both sides set the same `--tw-enter-*`/`--tw-exit-*` custom properties.

- **`no-conflicting-classes`: same-prefix conflicts within complementary groups** ([#19](https://github.com/sergioazoc/oxlint-tailwindcss/pull/19), thanks @Hexoplon) — The complementary-group skip was too permissive: pairs like `duration-300 duration-500`, `from-red-500 from-blue-500`, `translate-x-1 translate-x-2`, `ease-in ease-out`, `delay-100 delay-200`, `scale-50 scale-75`, `rotate-45 rotate-90`, and `skew-x-1 skew-x-2` slipped through silently because both sides matched the same group regex. Each cross-prefix group regex now captures its utility prefix; `shouldSkipPair` compares the captured prefix so cross-prefix pairs still compose (`from-X to-Y`) but same-prefix pairs fall through to the overlap check and report. Variant-scoped (`hover:duration-…`), important (both `!` forms), and negative same-axis transforms (`translate-x-1` vs `-translate-x-2`) are all covered.

- **`no-conflicting-classes`: narrowing-override + mask gradient family** ([#19](https://github.com/sergioazoc/oxlint-tailwindcss/pull/19), thanks @Hexoplon) — Stops flagging six families of valid Tailwind v4 idioms as conflicts:
  - `size-N h-M` / `size-N w-M` axis overrides
  - `rounded-{side}-X rounded-{corner}-Y` shorthand → corner refinement (physical and logical)
  - `truncate text-clip` (refines the bundled `text-overflow`)
  - `mask-l-from-N mask-l-to-N` and per-axis `mask-{x,y}-*` stop pairs
  - `mask-linear-N mask-linear-from-N` and the negative-angle form, plus cross-family combinations like `mask-b-from-N mask-radial-from-N`
  - `mask-add` / `mask-subtract` / `mask-intersect` / `mask-exclude` paired with any mask gradient
    Implemented as a generic `isNarrowingOverride` heuristic (the later class's CSS properties are a strict subset of the earlier class's, so the later class refines one of the shorthand's properties — direction-sensitive, so `h-6 size-4` still flags as the wider later class clobbering the earlier override) plus a new `COMPLEMENTARY_GROUPS` entry that captures the mask-gradient `<family>` / `<family>-<role>`. Two mask composite modes (`mask-add mask-subtract`) still conflict on `mask-composite`.

- **`no-hardcoded-colors`: stop flagging `var(--…)` wrappers** ([#20](https://github.com/sergioazoc/oxlint-tailwindcss/pull/20), thanks @Hexoplon) — Values like `bg-[hsl(var(--primary))]`, `border-[rgb(var(--border))]`, `bg-[oklch(var(--bg))]`, `text-[lab(var(--fg))]`, `bg-[var(--primary,#fff)]`, and `bg-[rgb(var(--r),var(--g),var(--b))]` were previously reported as hardcoded colors because the rule matched on the color-function form without checking whether the inner value was a CSS variable. `isHardcodedColor()` now short-circuits when any `var(--…)` reference is present in the value. Documented non-change: mixed gradient values like `bg-[linear-gradient(hsl(var(--a)),#fff)]` remain valid — the bail short-circuits the whole value once any `var(--…)` is present, so a hardcoded stop nested inside a gradient is not flagged.

- **`no-unnecessary-arbitrary-value`: multi-segment utility coverage** ([#20](https://github.com/sergioazoc/oxlint-tailwindcss/pull/20), thanks @Hexoplon) — `bug_arbitrary_equivalents_prefix` resolved. The `arbitraryEquivalents` precompute derived the candidate prefix via `cls.lastIndexOf('-')`, so multi-segment utilities (`bg-red-500`, `text-blue-700`, `ring-offset-slate-200`, and every theme token in user CSS) only registered the long-prefix form and missed the short one. `bg-[var(--color-red-500)]` was therefore not recognized as equivalent to `bg-red-500`. The precompute now enumerates every dash split point (start at `indexOf('-', 1)` so negative utilities keep their leading `-`) and emits one candidate per prefix; Tailwind's `candidatesToCss` is the source of truth for which split round-trips. Heads up for users on theme-token codebases: this introduces new warnings on existing code that references default-palette colors via emitted CSS variables (`bg-[var(--color-red-500)]`, `text-[var(--color-blue-700)]`, etc.) — all with autofixes.

- **`prefer-theme-tokens` coexistence with the new `no-unnecessary-arbitrary-value`** ([#20](https://github.com/sergioazoc/oxlint-tailwindcss/pull/20)) — With theme-token codebases where `--color-X: var(--X)` (the variable is exposed directly with no wrapping color function), `border-[var(--border)]` is now CSS-equivalent to `border-border` and is owned by `no-unnecessary-arbitrary-value`. `prefer-theme-tokens`'s `getNamedEquivalent` guard correctly silences the bracket form in that case. When `--color-X` wraps the raw variable in a color function (`hsl(var(--X))`, shadcn pre-v4-native style), the bracket form is not CSS-equivalent and the opt-in `prefer-theme-tokens` rule remains the only path. The coexistence matrix in `tests/integration/prefer-theme-tokens-coexistence.test.ts` locks down both setups.

- **Fix disk cache not invalidating on `tailwindcss` upgrades** — The two-level disk cache in `sync-loader.ts` was keyed by `md5(CACHE_VERSION:path:mtime)` and `md5(CACHE_VERSION:content)`, where `CACHE_VERSION` was a hardcoded constant bumped manually. The installed `tailwindcss` version was not part of the key, so a user upgrading tailwindcss (e.g. 4.2 → 4.3) without changing their CSS would keep reading precomputed data from the old version — new utilities like `zoom-*`, `tab-*`, `scrollbar-*`, `@container-size` would be flagged as unknown by `no-unknown-classes`. `CACHE_VERSION` is replaced by a derived `CACHE_KEY = md5(PRECOMPUTE_SCRIPT).slice(0,8):${tailwindVersion}`, computed once at module load. The cache now auto-invalidates on three independent signals: CSS content changes, our precompute logic changes (script hash), or the installed `@tailwindcss/node` version changes. No more manual version bumps when touching the precompute script.

- **Dependencies updated** — tailwindcss 4.3.0, @tailwindcss/node 4.3.0, @oxlint/plugins 1.64.0, oxlint 1.64.0, oxfmt 0.49.0, tsdown 0.22.0, typescript 6.0.3, @types/node 25.7.0, @typescript/native-preview 7.0.0-dev.20260513.1, vitest 4.1.6. Adds devDeps `tailwindcss-animate` 1.0.7 and `tw-animate-css` 1.4.0 for plugin integration tests. Tailwind 4.3 adds new utilities (`zoom-*`, `tab-*`, `scrollbar-*`, `@container-size`) and refines canonicalization for arbitrary values (preserves significant `_` whitespace, keeps original units, migrates `[&:has(…)]` → `has-[…]`). All of these flow through the plugin automatically thanks to the cache invalidation fix above.

- **Internal: testability refactors** — Extracted four pure functions previously buried in module-level IIFEs or visitor closures to enable direct unit tests: `computeCacheKey` + `readTailwindVersion` in `sync-loader.ts`, `resolveCssPath` in `loader.ts` (entry-point resolution logic with injectable `autoDetect` and `lastPath`), and `shouldSkipPair` + `isCompositionViaCssVars` + `isNarrowingOverride` in `no-conflicting-classes.ts` (composition heuristics). Also moved `COMPLEMENTARY_GROUPS` and `COMPOSITION_PAIRS` regex tables from inside the `no-conflicting-classes` visitor loop to module scope (minor perf win: regexes no longer recompiled per AST node). No behavior change for users.

- 1091 tests (up from 852). Includes new unit tests for `isNarrowingOverride` (8 cases covering subset/superset/equal/disjoint/empty matrices) and regression guards for `arbitraryEquivalents` (shape invariants + acid test that `bg-[var(--color-red-500)]` resolves to `bg-red-500`).

## 0.7.1 (2026-05-07)

- **Fix `enforce-canonical` missing legacy v3 classes** ([#16](https://github.com/sergioazoc/oxlint-tailwindcss/issues/16)) — Classes that produce valid CSS in v4 but are absent from `getClassList()` (`break-words`, `order-none`, `overflow-ellipsis`, `flex-grow{,-0,-1}`, `flex-shrink{,-0,-1}`, `decoration-clone/slice`, `bg-gradient-to-*`, `start-N`, `end-N`, `-start-N`, `-end-N` including fractional values) were silently skipped by the rule, even though Tailwind's `canonicalizeCandidates()` does rewrite them (e.g. `break-words` → `wrap-break-word`, `start-1/2` → `inset-s-1/2`). The precompute step now feeds these legacy spellings explicitly: a hardcoded list for fixed renames plus dynamic derivation of `start-*`/`end-*` from the `inset-{s,e}-*` utilities present in the design system. Also adds them to the valid set so `no-unknown-classes` doesn't flag them. Disk cache version bumped 11 → 13.
- **Dependencies updated** — @oxlint/plugins 1.63.0, oxlint 1.63.0, oxfmt 0.48.0, tsdown 0.22.0, @types/node 25.6.2, @typescript/native-preview 7.0.0-dev.20260507.1.
- 852 tests (up from 834).

## 0.7.0 (2026-05-04)

- **New rule: `prefer-theme-tokens`** ([#15](https://github.com/sergioazoc/oxlint-tailwindcss/issues/15)) — Suggests named theme-token utilities like `border-border` over raw CSS variable references like `border-(--border)` or `border-[var(--border)]` when the named utility exists in the design system. Off by default — the replacement is a name-match heuristic and can change observable CSS in shadcn-style themes where `--color-X` wraps the raw `--X` (e.g. `hsl(var(--X))`). Coexistence with `enforce-canonical` and `no-unnecessary-arbitrary-value` is locked down by an integration matrix so they don't double-fire on the same input.
- **Fix pnpm strict workspaces** — The precompute child process required `@tailwindcss/node` via bare specifier from its cwd, which fails under pnpm with strict hoisting (the module lives under `node_modules/.pnpm/oxlint-tailwindcss@…/node_modules`, not on the resolution path from the consumer's project root). The plugin now resolves the absolute path from its own install location and passes it via env to the child. Includes an actionable error message and a regression test that simulates the isolated cwd.
- **Fix unfixable cycle between `no-unnecessary-whitespace` and `enforce-consistent-line-wrapping`** ([#14](https://github.com/sergioazoc/oxlint-tailwindcss/issues/14)) — When both rules were enabled with `classesPerLine`, autofix oscillated forever: line-wrapping introduced `\n` + indent between class chunks, then `no-unnecessary-whitespace` collapsed it back to a single space. The whitespace rule now collapses runs of `[ \t]+` only within each line, leaving newlines and the indentation that follows them untouched.
- **Multiline-safe class-string rebuilding across all autofix rules** — The same root cause as #14 affected ~12 other rules that did `splitClasses(value).join(' ')` to rebuild a class string after an autofix. They all collapsed multiline indentation into a single space. Introduced `splitClassesWithSeparators` + `rebuildClassString` in `class-splitter.ts`: the split captures every whitespace run between classes (plus leading/trailing); the rebuild preserves them verbatim for 1-to-1 transforms (canonical, sort, variant-order, important-position, logical/physical, var-syntax, negative-arb, no-unnecessary-arb, prefer-theme-tokens, no-deprecated, no-unknown suggestions) and degrades gracefully for length-changing rules (no-duplicate, shorthand) by joining with the first newline-bearing internal separator. The matrix test in `tests/integration/multiline-preservation.test.ts` locks per-rule behavior down.
- 834 tests (up from 742).

## 0.6.3 (2026-04-21)

- **Perf: `enforce-canonical` ~5x faster** — Lint time on an 898-file repo with 12 threads dropped from 106s to 22s. Named classes (no `[` or `(` in the utility) now resolve via the precomputed `canonicalMap` in `DesignSystemCache` instead of going through the worker thread round-trip. Only classes with arbitrary or CSS-var values (`p-[2px]`, `bg-(--c)`) still call the worker. A process-wide per-class cache keyed by `${cssPath}\0${rem}\0${class}` deduplicates the remaining worker requests.
- **Fix latent bug in the canonicalize worker** — The worker called `ds.canonicalizeCandidates(classes)` in batch, but that API deduplicates its input. Inputs containing duplicate classes produced output shorter than the input and left `dynamic[i]` undefined in `enforce-canonical`. The worker now iterates `canonicalizeCandidates([cls])` per class, preserving order and length.
- 742 tests (up from 736).

## 0.6.2 (2026-04-21)

- **Fix `MaxListenersExceededWarning` when the plugin runs in multiple oxlint worker threads** — The sort and canonicalize services registered `process.on('exit', cleanup)` on every module load. When oxlint spawns many lint workers, this exceeded Node's default `MaxListeners` (10) and emitted a warning. `worker.unref()` already lets the process exit without waiting for the worker, so the exit listener was redundant and has been removed. Regression test added in `tests/design-system/exit-listeners.test.ts`.
- **Dependencies updated** — @tailwindcss/node 4.2.4, tailwindcss 4.2.4, @oxlint/plugins 1.61.0, oxlint 1.61.0, oxfmt 0.46.0, tsdown 0.21.9, vitest 4.1.5.
- 736 tests (up from 733).

## 0.6.1 (2026-04-14)

- **Fix `consistent-variant-order` incorrect reorder for pseudo-elements** ([#12](https://github.com/sergioazoc/oxlint-tailwindcss/issues/12)) — The rule incorrectly moved pseudo-element variants (`before:`, `after:`, `placeholder:`, etc.) before element-selecting variants (arbitrary selectors `[&>svg]:`, `has-[.active]:`, `aria-expanded:`, `data-[state=open]:`, `open:`, etc.), producing broken CSS in Tailwind v4. For example, `[&>*[data-role="user"]]:after:right-0` was "fixed" to `after:[&>*[data-role="user"]]:right-0`, which generates `&::after { &>*[data-role=user] { ... } }` — pseudo-elements have no children. Pseudo-element variants are now always kept innermost (closest to the utility) in both static and design system ordering modes.
- 733 tests (up from 707).

## 0.6.0 (2026-04-13)

- **Dynamic canonicalization via `canonicalizeCandidates`** ([#11](https://github.com/sergioazoc/oxlint-tailwindcss/issues/11)) — `enforce-canonical` now calls Tailwind's `canonicalizeCandidates()` API dynamically via a persistent worker thread (same pattern as the sort service). This enables canonicalization of arbitrary user classes that couldn't be precomputed. Examples: `p-[2px]` → `p-0.5`, `max-w-[400px]` → `max-w-100`, `text-[var(--color-text)]/90` → `text-(--color-text)/90`, `[--w-padding:theme(spacing.1)]` → `[--w-padding:--spacing(1)]`. Falls back to the precomputed cache if the worker is unavailable.
- **New setting: `rootFontSize`** — `settings.tailwindcss.rootFontSize` (default: 16) controls the px→named class conversion in `enforce-canonical`. Matches the Tailwind CSS IntelliSense `rootFontSize` setting.
- 707 tests (up from 700).

## 0.5.0 (2026-04-13)

- **Suggestions API for IDE quick-fixes** — 10 rules now provide `suggest` actions in IDEs. When multiple classes have errors in the same attribute, the first gets an autofix and the rest now offer an optional quick-fix (previously they had no action). `no-unknown-classes` also offers a quick-fix to replace typos with the Levenshtein suggestion. Affected rules: `enforce-logical`, `enforce-physical`, `enforce-negative-arbitrary-values`, `enforce-consistent-important-position`, `enforce-consistent-variable-syntax`, `no-deprecated-classes`, `consistent-variant-order`, `enforce-canonical`, `no-unnecessary-arbitrary-value`, `no-unknown-classes`.
- **`entryPoint` as array for monorepos** — `settings.tailwindcss.entryPoint` now accepts `string[]` in addition to `string`. For each file, the plugin picks the entry point whose directory is closest in the filesystem tree. Example: `entryPoint: ["packages/web/src/globals.css", "packages/admin/src/styles.css"]`.
- **Debug logging** — New `settings.tailwindcss.debug: true` option (or `DEBUG=oxlint-tailwindcss` env var) to see which design system is loaded for each file. Output: `[oxlint-tailwindcss] src/App.tsx → src/globals.css`. Disabled by default — the always-on log from v0.4.1 is removed.
- **`defaultOptions` in rule meta** — 6 rules now declare their default options in the rule schema, making defaults visible to tooling. Rules: `max-class-count`, `enforce-consistent-important-position`, `enforce-consistent-variable-syntax`, `no-dark-without-light`, `no-unknown-classes`, `enforce-consistent-line-wrapping`.
- **Dependencies updated** — @oxlint/plugins 1.60.0, oxlint 1.60.0, oxfmt 0.45.0.
- 700 tests (up from 686).

## 0.4.1 (2026-04-12)

- **Fix `no-conflicting-classes` false positive with `text-*` and `tracking-*`** ([#8](https://github.com/sergioazoc/oxlint-tailwindcss/issues/8)) — When a theme defines `--text-base--letter-spacing`, `text-base` generates `letter-spacing` in its CSS output. Using `tracking-tight` alongside it to override only letter-spacing was incorrectly reported as a conflict. Added `[text-*, tracking-*]` to the composition pairs (matching the existing `[text-*, leading-*]` pair for line-height).
- **Fix `classed()` false positive with template literal first argument** ([#9](https://github.com/sergioazoc/oxlint-tailwindcss/issues/9)) — `classed(\`div\`, 'truncate')`incorrectly treated the template literal`\`div\``as a class string instead of skipping it as the element type. The skip logic now handles`TemplateLiteral`AST nodes in addition to`Literal`and`Identifier`.
- **Fix auto-detect crossing `package.json` boundaries in monorepos** ([#7](https://github.com/sergioazoc/oxlint-tailwindcss/issues/7)) — Packages without their own Tailwind CSS file could incorrectly inherit a design system from a parent or sibling package. The boundary check now correctly stops at the current package's `package.json` instead of searching the parent directory. Additionally, the `lastLoadedPath` fallback is now only set by explicit `entryPoint` calls, preventing cross-package contamination via auto-detect.
- **Log loaded design system path** — When a design system is loaded for the first time, the plugin now logs `[oxlint-tailwindcss] Loaded design system from "<path>"` to stderr. Helps diagnose which CSS entry point is being used, especially in monorepos.
- 686 tests (up from 676).

## 0.4.0 (2026-04-10)

- **Monorepo support: per-file design system resolution** ([#7](https://github.com/sergioazoc/oxlint-tailwindcss/issues/7)) — Run `oxlint` once from the workspace root and each file automatically uses the correct package-specific Tailwind config. The plugin now maintains a per-entry-point DS cache (Map) instead of a single shared instance. The lazy loader re-resolves when `context.filename` changes, and auto-detect results are cached by directory to avoid repeated filesystem walks.
- **Content-based disk cache for monorepo deduplication** ([#6](https://github.com/sergioazoc/oxlint-tailwindcss/issues/6)) — Two-level disk cache (mtime index + content hash) allows packages with identical CSS to share a single cache entry. In benchmarks, 5 packages with the same CSS: 12.3s → 45ms (99.6% reduction).
- **Configurable timeout** ([#6](https://github.com/sergioazoc/oxlint-tailwindcss/issues/6)) — New `settings.tailwindcss.timeout` option (default: 30000ms) for environments where design system loading is slow.
- **Precompute performance optimizations** — Replaced O(N²) linear scans (`indexOf`/`includes`) with Map/Set lookups in the PRECOMPUTE_SCRIPT. Cold load time reduced from 2.4s to 1.7s (27%).
- **Sort service multi-DS support** — The sort worker now tracks its current CSS path and restarts when the entry point changes, with graceful fallback to heuristic sort during restart.
- 676 tests (up from 601).

## 0.3.0 (2026-04-09)

- **Exclude defaults via `settings.tailwindcss.exclude`** ([#5](https://github.com/sergioazoc/oxlint-tailwindcss/issues/5)) — Remove specific items from the built-in defaults. For example, `exclude: { variablePatterns: ["^styles?$"] }` stops the plugin from scanning variables named `style`/`styles`. Supports `attributes`, `callees`, `tags`, and `variablePatterns`.
- **Auto-detect follows indirect `@import`** ([#4](https://github.com/sergioazoc/oxlint-tailwindcss/issues/4)) — When a candidate CSS file doesn't contain a direct Tailwind signal but has `@import` statements, the auto-detector now follows those imports one level deep to find the signal. Supports relative paths and package imports (e.g. `@import '@company/theme/tailwind.config.css'`). No recursion — maximum one level.
- 601 tests (up from 591).

## 0.2.0 (2026-04-09)

- **Custom class detection via settings** ([#1](https://github.com/sergioazoc/oxlint-tailwindcss/issues/1)) — New `settings.tailwindcss` options to extend class detection: `attributes` (additional JSX attribute names), `callees` (additional function names), `tags` (additional tagged template tags), and `variablePatterns` (additional regex patterns for variable names). All values are additive to the built-in defaults. Applies to all 22 rules at once.
- **Object-valued JSX attribute support** ([#1](https://github.com/sergioazoc/oxlint-tailwindcss/issues/1)) — Attributes like `classNames={{ root: "flex", label: "text-sm" }}` now extract class strings from object values. Supports string literals, ternaries, and logical expressions in values.
- **Built-in tw-classed support** ([#2](https://github.com/sergioazoc/oxlint-tailwindcss/issues/2)) — `classed()` calls are now detected by default. The first argument (element type or component reference) is skipped, and remaining arguments are extracted as class strings or cva-like config objects (variants, compoundVariants).
- **Fix `no-conflicting-classes` false positive with `inset-ring` and `shadow`** ([#3](https://github.com/sergioazoc/oxlint-tailwindcss/issues/3)) — Classes like `inset-ring-1` and `shadow-md` both set `box-shadow` but compose via different CSS custom properties (`--tw-inset-ring-shadow` vs `--tw-shadow`). These are no longer reported as conflicting. The fix uses a CSS custom property heuristic: if two classes both use `--tw-*` variables but none overlap, they are composing, not conflicting. This also fixes false positives for `inset-shadow` + `shadow`, `inset-ring` + `ring`, and all other composition patterns (filter, backdrop-filter, contain, font-variant-numeric, touch-action, border-spacing, mask).
- **Internal: `createExtractorVisitors` helper** — All 22 rules now use a shared visitor factory instead of duplicating 4 AST visitor callbacks each. Reduces boilerplate and ensures custom config is applied uniformly.
- **Dependencies updated** — @oxlint/plugins 1.59.0, oxlint 1.59.0, oxfmt 0.44.0.
- 591 tests (up from 571).

## 0.1.10 (2026-03-27)

- **Fix `no-conflicting-classes` false positives with plugin classes** — Classes from plugins like `@tailwindcss/typography` (`prose`) generate CSS with nested descendant selectors (`:where(.prose pre)`, `:where(.prose a)`, etc.). Previously, ALL properties from descendant selectors were treated as if they applied to the root element, causing false conflicts. Now only root-level CSS properties are used for conflict detection. Example: `prose overflow-x-auto` no longer reports a conflict because `overflow-x` only applies to `.prose pre`, not to `.prose` itself.
- **Fix `no-unknown-classes` false positive for modifier classes** — Classes like `not-prose` (from `@tailwindcss/typography`) that don't generate their own CSS but are referenced via `[class~="not-prose"]` attribute selectors in other classes' output are now recognized as valid.
- 550 tests (up from 548).

## 0.1.9 (2026-03-19)

- **Fix `enforce-sort-order` in VS Code** — The sort service worker thread failed to resolve `@tailwindcss/node` in VS Code's extension host due to a different module resolution context. The parent thread now resolves the module path via `require.resolve()` and passes it to the worker, fixing false positives that only appeared in VS Code.
- **Fix heuristic sort for null-order classes** — Marker classes like `group/name` and `peer/name` (which return `null` from `ds.getClassOrder()`) now sort first in the heuristic fallback, matching the behavior of oxfmt and prettier-plugin-tailwindcss.
- **Fix heuristic sort for dynamic numeric values** — Classes like `underline-offset-3` and `gap-13` that are valid in Tailwind v4 but missing from `getClassList()` now resolve their order via prefix lookup in `cache.getOrder()`, preventing incorrect sort positions in the heuristic fallback.
- 548 tests (up from 545).

## 0.1.8 (2026-03-18)

- **`enforce-consistent-important-position` default changed to suffix** — Tailwind v4's canonical form is `font-bold!` (suffix). The default was `prefix` (`!font-bold`), which is the deprecated v3 form. Using `"prefix"` may now conflict with `enforce-canonical`.
- **`enforce-canonical` preserves `!` position** — Canonicalization no longer forces `!` to prefix. If the user wrote `-m-0!` it now canonicalizes to `m-0!` (not `!m-0`), respecting the original modifier position.
- **`consistent-variant-order` supports `*`/`**` selectors** — Child (`\*:`) and descendant (`\*\*:`) selectors are now included in the default variant order. Fixed arbitrary variant brackets (`[...]`) no longer getting priority `-1`.
- **Dependencies updated** — tailwindcss 4.2.2, @oxlint/plugins 1.56.0, oxlint 1.56.0, oxfmt 0.41.0, tsdown 0.21.4, @typescript/native-preview 7.0.0-dev.20260318.1.
- 545 tests (up from 536).

## 0.1.7 (2026-03-16)

- **Fix sort service keeping process alive** — Add `worker.unref()` so the worker thread doesn't prevent Node.js from exiting naturally after linting completes.

## 0.1.6 (2026-03-16)

- **Add `enforce-physical` rule** — Inverse of `enforce-logical`. Converts logical properties (`ms-4`, `start-0`) to physical ones (`ml-4`, `left-0`). Autofix. 22 rules total.
- **Exact official Tailwind sort order** — `enforce-sort-order` now uses `ds.getClassOrder()` via a persistent child process (sort service) for results identical to oxfmt/prettier-plugin-tailwindcss. Falls back to improved heuristic sort on platforms without FIFO support.
- **Fix `enforce-sort-order` heuristic fallback** — Variant-prefixed classes, arbitrary values (`max-w-[200px]`), CSS function syntax (`h-(--size)`), and slash modifiers (`bg-muted/50`) now resolve correctly.
- **Fix `enforce-shorthand`** — Exclude viewport units (`dvw`, `dvh`, `svw`, `svh`, `lvw`, `lvh`) from w+h→size shorthand. Fix suggesting invalid `size-screen`.
- **Fix `no-conflicting-classes` false positives** — Transform axes, Tailwind composition patterns (shadow/ring, divide/border, gradient utilities).
- **Fix `no-unknown-classes` false positives** — Improved `candidatesToCss()` expansion, opacity modifiers (`bg-black/80`), gradient deprecations, dynamic numeric values, bare utilities.
- **Fix import resolution** — External CSS packages, group/peer detection, CSS class extraction from imports.
- **Add deprecated gradient classes** — `bg-gradient-to-{t,tr,r,br,b,bl,l,tl}` → `bg-linear-to-*` with autofix.
- Default config: `max-class-count` and `enforce-consistent-line-wrapping` default to "off".
- 536 tests (up from 484).

## 0.1.5 (2026-03-15)

- **Fix `!` (important) modifier handling across all rules** — Both prefix (`!flex`) and suffix (`flex!`) forms now work correctly in all 21 rules. Previously, classes with `!` were silently ignored by lookups in `enforce-shorthand`, `enforce-logical`, `enforce-canonical`, `enforce-sort-order`, `enforce-consistent-variable-syntax`, `enforce-negative-arbitrary-values`, `no-deprecated-classes`, `no-unnecessary-arbitrary-value`, `no-conflicting-classes`, `no-hardcoded-colors`, `no-arbitrary-value`, `no-dark-without-light`.
- **Fix `enforce-sort-order`** — Classes with `!` modifier (e.g., `!text-red-500`) were sorted incorrectly (always placed first). Now use the same sort order as their non-`!` equivalent.
- **Fix `no-deprecated-classes` autofix** — Multiple deprecated classes in the same string are now all fixed in one pass (previously only the first was fixed).
- **Fix monorepo auto-detection** — Entry point is now detected by walking up from the linted file's path, not from `process.cwd()`. Fixes auto-detection in monorepos where lint runs from the root.
- **`settings.tailwindcss.entryPoint`** — Configure the entry point once in `.oxlintrc.json` settings instead of repeating it per rule.
- **Disk cache** — Design system precomputed data is cached to disk. Subsequent loads are ~10x faster.
- **Expanded auto-detection** — 81 candidate paths (9 directories × 9 filenames).
- **Fix opacity modifier false positives** — Classes like `bg-black/80`, `text-white/90` were incorrectly reported as unknown.
- **Fix `no-conflicting-classes` false positives** — Filter out `@property` descriptors (`syntax`, `inherits`, `initial-value`) from CSS property extraction. These were incorrectly shared across unrelated utilities, causing false conflicts like `shadow-lg` vs `ease-in-out`.
- **Fix `no-unknown-classes` false positives** — Classes valid in Tailwind v4 but missing from `getClassList()` are now handled: dynamic numeric values (`w-45`, `min-h-17.5`) via prefix heuristic, bare utilities (`rounded`, `shadow`) and screen breakpoints (`max-w-screen-lg`) via precompute expansion with `candidatesToCss()`, opacity modifiers (`bg-black/80`) via slash stripping.
- Centralized `stripImportant()` in design system cache for consistent `!` handling.
- 484 tests (up from 344).

## 0.1.4 (2026-03-14)

- **Global `entryPoint` via settings** — Configure `settings.tailwindcss.entryPoint` once in `.oxlintrc.json` instead of repeating it per rule.
- **Disk cache for design system** — Precomputed data is cached to `/tmp/oxlint-tailwindcss/`. Subsequent loads are ~10x faster.
- **Expanded auto-detection** — 81 candidate paths (9 directories × 9 filenames). Adds `app/tailwind.css`, `css/`, `style/`, `assets/`, `resources/css/`, and more.
- Improved test coverage: tests now sync with source constants (`DEPRECATED_MAP`, `PHYSICAL_TO_LOGICAL`, `CANDIDATE_DIRS/NAMES`).
- Simplified README: removed redundant `entryPoint` option tables, trimmed verbose examples.

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
