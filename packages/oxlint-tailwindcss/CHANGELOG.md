# Changelog

## Unreleased

### Bug fixes

- **`enforce-canonical`**: no longer rewrites a literal arbitrary value to a variable-backed named
  token, which silently corrupted the design on projects that override a theme variable in `:root`
  (the standard shadcn/ui `--radius` pattern, and likewise `--spacing`). `canonicalizeCandidates`
  matches an arbitrary literal (`rounded-[4px]` = `4px`) against the compile-time theme default, so
  it happily maps it to `rounded-lg` — but `rounded-lg` compiles to `var(--radius-lg)`, which the
  `:root` override makes resolve to a different value (e.g. 14px). The rule now only reports a
  canonicalization when the two forms emit byte-identical CSS. Value-preserving conversions still
  apply: legacy renames (`break-words` → `wrap-break-word`), variable-syntax normalization
  (`bg-[var(--x)]` → `bg-(--x)`, `rounded-[var(--radius-sm)]` → `rounded-sm`), and literal-valued
  utilities (`z-[10]` → `z-10`, `flex-grow-[2]` → `grow-2`). Literal→token conversions such as
  `p-[2px]` → `p-0.5` are no longer enforced (they are only coincidentally equal under the default
  theme). Fixes [#78](https://github.com/sergioazoc/oxlint-tailwindcss/issues/78).
- **`no-unknown-classes`**: no longer flags Tailwind v4's typed CSS-variable shorthand
  (`border-(length:--stroke)`, `bg-(color:--c)`, `text-(length:--fs)`) as an unknown class. The
  class-boundary scanners tracked `[]` bracket depth but not `()` paren depth, so the `:` type hint
  inside the parentheses was mistaken for a variant separator, mangling the utility. This also
  resolved a contradiction with `enforce-canonical`, which rewrites the `[type:var(--x)]` long form
  into exactly the shorthand `no-unknown-classes` was rejecting. Fixes
  [#76](https://github.com/sergioazoc/oxlint-tailwindcss/issues/76).
- **`no-conflicting-classes`**: no longer reports Tailwind's writer/reader composition through
  `--tw-*` custom properties as a conflict. `outline-1 outline-dashed` was flagged as both affecting
  `outline-style`, but `outline-<n>` only READS the variable
  (`outline-style: var(--tw-outline-style)`) that `outline-dashed` WRITES — the standard Tailwind
  composition pattern. A shared property is now excluded from the conflict overlap when exactly one
  of the two classes defines the matching `--tw-<property>`; two writers
  (`outline-dashed outline-solid`) and two direct declarations (`outline-1 outline-2`) still report.
  The same mechanism now also covers `outline-none`/`outline-hidden` and subsumes the hardcoded
  `border` width/style pair. Fixes the false-positive half of
  [#79](https://github.com/sergioazoc/oxlint-tailwindcss/issues/79).

### Performance

- **Monorepos with multiple entry points**: the sort/canonicalize worker services now keep one warm
  worker **per** CSS entry point (LRU-bounded) instead of a single worker that was torn down and
  reloaded whenever oxlint fed the plugin two consecutive files from different packages. Each
  respawn re-paid the full design-system warmup (~200 ms load plus a cold first canonicalize), so a
  two-package run could spend far longer than linting the packages separately. Sticky worker errors
  are now tracked per entry point as well. Fixes
  [#77](https://github.com/sergioazoc/oxlint-tailwindcss/issues/77).

### Dependencies

- Updated all dependencies to their latest stable releases. Runtime: `tailwindcss` and
  `@tailwindcss/node` `4.3.3`. Build/dev tooling: the bundled `@oxlint/plugins` `1.74.0` (re-bundled
  into the published package), `oxlint`/`oxfmt` `1.74.0`/`0.59.0`, and `tsdown` `0.22.12`.
- Type-checking now runs on the stable `typescript` (`tsc`, `7.0.2`) directly. The
  `@typescript/native-preview` (`tsgo`) dev dependency — a preview of the native compiler before it
  shipped as TypeScript 7 — has been dropped. No effect on the published package.

## 1.3.5 (2026-07-10)

### Bug fixes

- **`no-deprecated-classes`**: no longer requires `settings.tailwindcss.entryPoint`. The rule only
  consults a hardcoded map of v3→v4 renames (`flex-grow` → `grow`, `bg-gradient-to-*` →
  `bg-linear-to-*`, etc.) and never actually reads the design system, so gating it on a successful
  design-system load produced a "design system unavailable" fatal diagnostic in projects that hadn't
  configured `entryPoint` — even though the check itself needed nothing from the design system. The
  rule now runs unconditionally. Existing configs that pass `entryPoint` as a rule option keep
  working (the option is ignored).

### Dependencies

- Updated dev/build tooling to their latest stable: `oxlint` & bundled `@oxlint/plugins` 1.73.0,
  `oxfmt` 0.58.0, `vitest` 4.1.10, `@types/node` 26.1.1, `tsdown` 0.22.4,
  `@typescript/native-preview` 20260707.2, and `vitepress` 2.0.0-alpha.18 (docs). Since
  `@oxlint/plugins` is bundled into the published package, its bump ships in the build. Runtime
  dependencies (`tailwindcss`, `@tailwindcss/node`) are unchanged at 4.3.2.

## 1.3.4 (2026-06-30)

Dependency maintenance release — no rule behavior changes.

### Dependencies

- Bumped `tailwindcss` and `@tailwindcss/node` to `^4.3.2`.
- Bumped the bundled `@oxlint/plugins` to `1.72.0` (re-bundled into the published package).
- Dev tooling: `oxlint`/`oxfmt` and `@typescript/native-preview` updated to their latest releases.

Removes the need to install `@oxlint/plugins` separately
([#50](https://github.com/sergioazoc/oxlint-tailwindcss/issues/50)). The README's install step was
just `pnpm add -D oxlint-tailwindcss`, but the package declared `@oxlint/plugins` as a required peer
dependency — so under package managers that don't auto-install peers, the plugin failed to load with
an opaque module-not-found error. Thanks to [@ctjhoa](https://github.com/ctjhoa) for the report.

### Bug fixes

- **`@oxlint/plugins` is now bundled into the published package instead of being a peer
  dependency.** We only consume `definePlugin`/`defineRule` (identity no-ops) and the `ESTree` types
  from it — nothing with runtime state or coupling to the host oxlint version — so bundling them is
  safe and carries no version-skew risk. `pnpm add -D oxlint-tailwindcss` now works out of the box
  with no extra peer or runtime dependency to install. The two real runtime dependencies
  (`@tailwindcss/node`, `tailwindcss`) stay external.

## 1.3.2 (2026-06-14)

Fixes a relative `entryPoint` resolving against the current working directory instead of the config
file's location ([#39](https://github.com/sergioazoc/oxlint-tailwindcss/issues/39)). In a Pattern-B
monorepo (one `.oxlintrc.json` per package), this made the plugin work from the CLI but fail in the
editor — the same config resolved to different CSS depending on where oxlint was launched. Thanks to
[@zorrodg](https://github.com/zorrodg) for the report.

### Bug fixes

- **A relative string `entryPoint` is now anchored to its config file's directory, not the CWD.**
  oxlint doesn't expose the config path to plugins, so the plugin walks up from the linted file to
  the nearest enclosing `.oxlintrc.json` (the config oxlint itself merges) and resolves the entry
  there, falling back to the CWD if the file isn't found. The CLI (`cd packages/ui && oxlint`, CWD =
  package) and editor extensions (CWD = workspace root) now load the same package-local CSS instead
  of failing with `Could not stat CSS entry point`. Absolute `entryPoint`s and the
  `EntryPointMapping[]` (glob) shape are unchanged — globs still match relative to the working
  directory.

## 1.3.1 (2026-06-13)

Fixes `no-unknown-classes` false positives on valid Tailwind v4 utilities that `getClassList()`
doesn't enumerate ([#37](https://github.com/sergioazoc/oxlint-tailwindcss/issues/37)). The reported
case was `@container-size`; a registry-vs-`getClassList()` audit then found and closed the rest of
that family. Patch bumps to `tailwindcss` / `@tailwindcss/node` 4.3.1. Thanks to
[@zorrodg](https://github.com/zorrodg) for the report.

### Bug fixes

- **`no-unknown-classes` no longer flags valid v4 classes missing from `getClassList()`.** Validity
  is built by filtering `getClassList()` through `candidatesToCss()`, so any class Tailwind compiles
  but doesn't enumerate was reported as a typo (`@container-size` → "Did you mean `contain-size`?").
  The precompute now reconciles three kinds of gap, each validated through `candidatesToCss()` (the
  source of truth — so every addition self-prunes on a Tailwind version that doesn't emit it):
  - **Special-cased compiler utilities** absent from `getClassList()` _and_ the utility registry:
    `@container-size` (`container-type: size`), `filter-none` / `backdrop-filter-none`, and
    `max-w-screen`. Added as a curated seed, with their CSS properties captured so they participate
    in `no-conflicting-classes` like their enumerated siblings.
  - **Negative utilities** whose negative form `getClassList()` omits: `-col-N`, `-row-N`,
    `-hue-rotate-N`, `-backdrop-hue-rotate-N`. Auto-discovered by probing `-<prefix>-1` for every
    known prefix; `candidatesToCss()` rejects utilities that don't support negation (`-p-1`), so
    only genuinely negative-capable prefixes are added.
  - **v3 background/object-position spellings** reordered axis-first in v4 (`bg-left-top`,
    `object-right-bottom`, and the six others) — fed through the existing legacy-canonicalize pass.

### Behavior changes

- **`enforce-canonical` now rewrites the v3 position spellings** to their v4 form (`bg-left-top` →
  `bg-top-left`, `object-right-bottom` → `object-bottom-right`, and the six others). Autofix.
- **`no-conflicting-classes` now flags two `container-type` markers together**
  (`@container @container-size`), consistent with the already-detected
  `@container @container-normal` — `@container-size` now carries its `container-type` property like
  its siblings.

### Dependencies

- `tailwindcss` 4.3.1, `@tailwindcss/node` 4.3.1, `@types/node` 25.9.3 (all patch). The 0.8.0
  cache-invalidation note claimed `@container-size` started working after a tailwindcss upgrade — it
  never did (the `getClassList()` gap above); now it does, on any 4.x. Test suite at 1134 passing.

## 1.3.0 (2026-06-09)

A correctness, robustness, and security pass from a full project audit. Two autofixes that could
corrupt source code are fixed, the design-system cache layer is hardened against corruption and
unsafe shared-tmpdir use, and several rules get more accurate. No runtime dependency changed
(`tailwindcss` / `@tailwindcss/node` stay `^4.3.0`); the plugin API and `settings` are unchanged.

### Bug fixes

- **`enforce-negative-arbitrary-values` no longer corrupts `calc()`/`var()` values.** Tailwind v4
  negates wrapped values by emitting `calc(<value> * -1)`, so `-top-[calc(100%-4px)]` is valid; the
  old fix rewrote it to `top-[-calc(100%-4px)]` — invalid CSS that silently dropped the style. The
  fix now applies only to plain numeric dimensions.
- **`consistent-variant-order` no longer reorders variants that change the selector target.**
  `hover:[&>svg]` (`&:hover > svg`) and `[&>svg]:hover` (`& > svg:hover`) target different elements,
  so they (and `*` / `**`) are now treated as reordering barriers. Pseudo-elements still move
  innermost as before.
- **`enforce-canonical`** rounds rem/em/px floats on the worker path too, so the autofix can no
  longer write values like `2.4000000000000004rem` into source.
- **`no-unknown-classes`** suggestions now preserve the `!` modifier (`flexx!` → `flex!`) and work
  behind variants (`hover:flexx` → `hover:flex`), which previously produced no suggestion.
- **`no-dark-without-light`** no longer false-positives on the idiomatic `block dark:hidden` (and
  other display/position pairs that set the same property under different names).
- **`consistent-variant-order`** resolves the prefix and variant order per entry point, fixing
  monorepos where packages declare different `prefix(...)` or variant orders.
- **`no-conflicting-classes`** no longer claims the later class in the attribute "wins" (CSS
  precedence is decided by the generated stylesheet order, not attribute order) and no longer flags
  an exact duplicate as conflicting with itself.
- Invalid user regexes in `settings.tailwindcss.variablePatterns` and `no-restricted-classes`
  `patterns` are now skipped instead of crashing the lint with a raw `SyntaxError`.

### Behavior changes

- **`enforce-logical` / `enforce-physical` now convert negative utilities** (`-ml-2` → `-ms-2`,
  `-left-4` → `-start-4`), which they previously skipped. Projects that use negative
  physical/logical utilities may see new reports.
- **`no-hardcoded-colors` dropped its no-op `entryPoint` option.** The rule is fully static and
  never read it; configs that set it should remove it.

### Robustness & security

- **Disk cache hardening.** The precompute cache directory is now namespaced per user and created
  with mode `0o700`, and every cache read is schema-validated. A corrupt, truncated, or poisoned
  cache file is detected, removed, and recomputed instead of wedging the loader or crashing — closes
  a shared-`/tmp` cache-poisoning vector that fed autofixes.
- **Cache invalidates on `@import` changes.** The cache key now folds in locally-imported CSS, so
  editing a file pulled in via `@import "./theme.css"` no longer serves a stale design system.
- **Sticky load errors are now genuinely sticky** per entry point, so a failed design-system load is
  retried once per process instead of re-paying the init cost on every call.
- **Worker robustness.** A synchronous failure in the precompute worker (e.g. a broken
  `@tailwindcss/node`) now reports its real cause instead of a misleading timeout; the sort and
  canonicalize workers propagate load-failure causes and guard against oversized responses; stale
  precompute locks are reclaimed by exclusive rename to avoid a coordination race.

### Internal

- Updated dev tooling: oxlint/`@oxlint/plugins` 1.69.0, oxfmt 0.54.0 (no formatting changes), plus
  patch bumps to `@types/node` and `@tailwindcss/typography`.
- Shared `changesTarget` / selector-barrier helpers centralized in `class-parser`; the sort and
  canonicalize worker scripts now share a single `makeWorkerScript` builder.

## 1.2.0 (2026-06-05)

Adds support for the Tailwind v4 project prefix
([#29](https://github.com/sergioazoc/oxlint-tailwindcss/issues/29)). Previously, an entry point that
declared a prefix (`@import "tailwindcss" prefix(tw)`) made the design system precompute empty, so
`no-unknown-classes` flagged **every** class — including correctly prefixed ones (`tw:flex`) — as
invalid. Thanks to [@beckerei](https://github.com/beckerei) for the report.

### Features

- **Tailwind v4 `prefix(...)` support.** The precompute now reads `ds.theme.prefix` and validates
  the prefixed candidate against the design system (the prefix goes first: `tw:hover:underline`).
  The prefix is detected automatically from your `entryPoint` — nothing extra to configure. All
  cached structures stay prefix-free; the cache strips/re-applies the prefix at its method boundary.
- **`no-unknown-classes` is prefix-aware (strict).** Under a prefix, `tw:flex` is valid; a Tailwind
  utility written without the prefix (`flex`) is reported with a new `missingPrefix` message and a
  quick-fix that adds it (`flex` → `tw:flex`). Component classes from `@layer components` (`btn`)
  carry no prefix and stay valid.

### Bug fixes

- **`consistent-variant-order`** no longer reorders the project prefix out of first position
  (`tw:sm:hover:flex` → `tw:hover:sm:flex`, never `hover:tw:sm:flex`, which produces no CSS).
- **`enforce-sort-order` (strict mode)** now sorts prefixed groups stably instead of collapsing
  every prefixed group to the same priority.

## 1.1.0 (2026-05-29)

Extends `enforce-shorthand` with variant-aware merges and the axis-pair → full shorthand step
([#27](https://github.com/sergioazoc/oxlint-tailwindcss/issues/27),
[#28](https://github.com/sergioazoc/oxlint-tailwindcss/pull/28)). Thanks to
[@chitwitgit](https://github.com/chitwitgit) for the contribution.

### Features

- **`enforce-shorthand` is now variant-aware.** Parts that share the same variant prefix are merged
  (`sm:h-4 sm:w-4` → `sm:size-4`, `hover:mx-4 hover:my-4` → `hover:m-4`), while parts under
  different variants are left untouched (`hover:px-4 focus:py-4` does not merge). Grouping goes
  through the bracket-aware `splitUtilityAndVariant`, so stacked variants
  (`dark:sm:px-4 dark:sm:py-4`) and arbitrary variants (`[&:hover]:px-4 [&:hover]:py-4`) are handled
  too. The `!` important modifier (prefix and suffix) keeps round-tripping correctly per variant;
  mixed-importance pairs deliberately do not merge.
- **Axis pair → full shorthand.** `px-* py-*` → `p-*` and `mx-* my-*` → `m-*` are now suggested,
  matching
  [eslint-plugin-tailwindcss](https://github.com/francoismassart/eslint-plugin-tailwindcss/blob/master/docs/rules/enforces-shorthand.md).
  `VALUE_RE` was extended so `px`/`py`/`mx`/`my` utilities participate in value discovery
  (previously they were invisible to the rule).

### Behavior change

- Same-variant stacks like `hover:mt-2 hover:mr-2 hover:mb-2 hover:ml-2` now report (and fix to
  `hover:m-2`). Earlier versions documented variant stacks as intentionally skipped. Autofix still
  appends the merged shorthand when other classes are present — ordering remains
  `enforce-sort-order`'s job.

## 1.0.1 (2026-05-28)

Fixes the cold-cache `spawnSync … node ENOMEM` that collapsed linting on memory-constrained CI
runners ([#24](https://github.com/sergioazoc/oxlint-tailwindcss/issues/24)).

### Bug fixes

- **Precompute no longer forks the host process.** The design-system precompute ran via
  `execFileSync`, which `fork()`s the oxlint host (Rust + embedded Node). On memory-constrained
  Linux CI runners (e.g. GitHub `ubuntu-latest`, 2 vCPU / ~7 GB / no swap), overcommit accounting
  rejects forking a large-RSS process with `spawnSync … node ENOMEM` — even though the child
  immediately `exec`s and never touches the copied pages. The v1.0.0 content-hash lock reduced this
  from a fork _storm_ to a single fork, but a single fork was still enough to trip the limit. The
  precompute now runs in a **worker_thread** (the same mechanism `sort-service` /
  `canonicalize-service` already use), which creates a thread in-process with no address-space
  duplication and is therefore immune. The worker writes the precomputed JSON straight to the disk
  cache (atomic temp-write + rename) and signals completion over a SharedArrayBuffer; the
  cross-isolate lock and stale-lock reclaim are unchanged.
- **A single design-system load failure no longer storms into thousands of errors.**
  `getLoadedDesignSystem` / `createLazyLoader` only cached _successful_ loads, so when a load failed
  (e.g. the ENOMEM above) every DS-dependent rule re-attempted it on every AST node of every file —
  turning one environmental failure into ~18k re-spawns and 21k per-class errors. Failures are now
  memoized per `(entryPoint, mtime)` (fatal errors only, auto-invalidated when the CSS changes) plus
  a per-rule sticky error, collapsing a failure to one attempt per entry point per process — i.e.
  one `designSystemUnavailable` diagnostic per file, as documented.
- **`ENOMEM`/`EAGAIN` now get a memory-specific hint.** The precompute load error previously always
  advised "check the CSS file for syntax errors / raise `settings.tailwindcss.timeout`" — both wrong
  levers for a memory failure. The hint is now classified by the underlying error code and points at
  memory pressure / oxlint concurrency / runner memory when appropriate.

## 1.0.0 (2026-05-21)

Major release. v1.0.0 pivots `oxlint-tailwindcss` to a deterministic, explicit-config philosophy
aligned with the rest of the Tailwind ecosystem (prettier-plugin-tailwindcss, oxfmt,
better-tailwindcss). The premise: a _good_ DX is not "zero config", it's **"configure once, never
fails again"**. See the [migration guide](https://oxlint-tailwindcss.pages.dev/migration/v0-to-v1)
for the full delta.

### Highlights

- **The repo is now a pnpm monorepo.** The published npm package lives at
  `packages/oxlint-tailwindcss/`; the new `packages/docs/` package hosts the VitePress v2
  documentation site (English at the root, Spanish at `/es`). The `oxlint-tailwindcss` package on
  npm has the same shape it always did — only the source tree moved.
- **Brand-new docs site.** A single consolidated Setup page carries everything needed to get running
  (install, minimal config, recommended starter rule set, validation, monorepo + interop summaries);
  dedicated Reference pages cover the full settings, monorepo patterns, and oxfmt/Prettier interop.
  Every rule has a hand-written page — what it does, per-option descriptions, ✗/✓ examples,
  interactions with other rules, and when to disable it — in both English and Spanish (`/es`). The
  sidebar and rule pages are both derived from the published plugin's `rules` registry — a new rule
  lands in `src/index.ts` and appears in both the sidebar and its generated page with zero
  hand-editing. Deployed to Cloudflare Pages at
  [oxlint-tailwindcss.pages.dev](https://oxlint-tailwindcss.pages.dev).

### Breaking changes

- **`settings.tailwindcss.entryPoint` is required.** Two shapes are supported: a string
  (`"src/styles.css"`) for single projects, or an array of `{ files, use }` mappings for monorepos
  with one root config. The legacy `entryPoint: string[]` shape was removed — supplying it now
  throws `DeprecatedEntryPointShapeError` with the exact migration snippet in the diagnostic
  message.
- **Filesystem auto-detect is gone.** `src/design-system/auto-detect.ts` and the `lastLoadedPath`
  global fallback in `loader.ts` were both deleted. Configurations that relied on auto-detect must
  declare `entryPoint` explicitly. This is the single biggest behavior change in v1; if you didn't
  pass an `entryPoint` in v0.x, you do now.
- **Fail loud on DS failures.** All seven DS-dependent rules (`enforce-canonical`,
  `enforce-sort-order`, `no-conflicting-classes`, `no-deprecated-classes`, `no-unknown-classes`,
  `no-unnecessary-arbitrary-value`, `prefer-theme-tokens`) now route through a shared `safeGetDS`
  helper that converts any of the four new fatal-error types (`MissingEntryPointError`,
  `DeprecatedEntryPointShapeError`, `DesignSystemLoadError`, `SortServiceError`) into a single
  `designSystemUnavailable` diagnostic per file with an actionable hint embedded. No more silent
  skips. `consistent-variant-order` is the sole DS-optional rule — its static fallback is itself
  deterministic.
- **No more heuristic-sort or precomputed-canonicalize fallback.** `enforce-sort-order` used to fall
  back to a prefix-based heuristic when the sort worker timed out, and `enforce-canonical` did the
  equivalent for canonicalize. Both produced "same input, different output" across machines. v1
  surfaces the failure instead — `SortServiceError` is constructed on every failure path of the sort
  and canonicalize workers (init timeout, request timeout, spawn failure, worker death), with a
  sticky `lastError` so subsequent calls fail fast without re-paying the init cost. Default timeouts
  raised to 60 s init / 30 s per request (up from 30 s / 10 s) to keep this from biting slow CI.
- **`enforce-physical` and `enforce-logical` gained `allowlist` + `direction` options** and now
  declare matching schemas. Existing configs (`"warn"`) keep working — both options default to no-op
  behavior. The two rules share a single runtime via `createDirectionalMapper` so future option
  additions land in one place.
- **Disk cache schema simplified.** The legacy two-level cache (`.idx` mtime index → `.json` content
  cache) was replaced by a single content-hash-keyed `.json` cache. Mtime stays as an in-memory fast
  path inside the linter process. Stale `.idx` files in `os.tmpdir()/oxlint-tailwindcss/` are
  harmless but can be deleted after upgrading.
- **`meta.defaultOptions` declared on every rule that takes options.** Tooling (IDEs, doc
  generators) can now read what each rule does without running it. Rules with empty schemas
  (`enforce-shorthand`, `no-contradicting-variants`, etc.) deliberately do not declare
  `defaultOptions` — oxlint validates `defaultOptions` against the schema and `{}` is not a valid
  value for `schema: []`.
- **Extractor config is per-context.** The module-level `_cachedConfig` / `_settingsResolved`
  globals in `extractors.ts` were swapped for a `WeakMap<context, ExtractorConfig>` so parallel rule
  contexts can't race on a shared cache.

### Bug fixes

- **`tv()` / `cva()` / `cn()` array values are now scanned**
  ([#25](https://github.com/sergioazoc/oxlint-tailwindcss/issues/25)). The class extractor walked
  strings, template literals, ternaries, logical expressions, and objects — but skipped arrays. So
  the idiomatic multi-line form `tv({ base: ['flex', 'p-2'] })`, array variant/slot values, and
  `cn(['flex', 'bad-class'])` were silently ignored by every rule. `extractFromExpression` now
  recurses into each array element (skipping holes and spreads), so strings, ternaries, and nested
  arrays inside the array are all reached. `compoundVariants` / `compoundSlots` keep their existing
  array-of-objects handling.
- **Cold-cache precompute no longer exhausts memory**
  ([#24](https://github.com/sergioazoc/oxlint-tailwindcss/issues/24)). oxlint lints across parallel
  isolates; on a cold disk cache they each forked their own `execFileSync` Node child to precompute
  the design system, and a dozen simultaneous forks — each loading `@tailwindcss/node` — exhausted
  memory on constrained hosts (`spawnSync … ENOMEM`, reported on WSL). A content-hash-scoped file
  lock now serializes the fork: the first isolate computes and writes the cache, the rest busy-wait
  (Atomics-based sync sleep) for the resulting JSON instead of forking. A stale lock — older than
  the precompute timeout plus a write margin, i.e. a holder that died mid-compute — is reclaimed so
  a crash can't wedge every isolate; a non-writable cache dir degrades to an uncoordinated compute.
  Coordination is keyed by content hash, so distinct CSS files still precompute in parallel.

### Internal — new modules

- `src/utils/fatal.ts` hosts the typed error hierarchy, the `safeGetDS` / `reportFatalDsError`
  helpers (typed structurally so they accept oxlint's strict `RuleContext` without pinning to a
  version), and the exported `DS_UNAVAILABLE_MESSAGE_ID` constant. Every DS-dependent rule spreads
  the matching `DS_UNAVAILABLE_MESSAGE` entry into its `meta.messages` so the messageId can't drift
  between the rule and the reporter.
- `src/utils/context.ts` owns `safeOptions` / `safeSettings` / `safeFilename` (formerly in
  `types.ts` — that module is now import-type-only) plus `createLazyOptions(context, compile)`,
  which collapses the "lazy-init memoized options" closure every rule reinvented. Twelve rules
  consume it.
- `src/utils/report.ts` exposes
  `reportClassReplacements(context, loc, split, classes, offending, options)` — the "first-as-fix,
  rest-as-suggestion" loop that nine rules duplicated (~230 LOC). Each rule shrinks from ~40 lines
  of plumbing to a `flatMap` + one call. The autofix vs. suggestion dispatch and the
  `rebuildClassString` + `preserveSpaces` chain live in one tested place.
- `src/utils/allowlist.ts` (`compileRegexList`, `matchesAny`) is shared between `enforce-logical`
  and `enforce-physical`.
- `src/design-system/ds-worker.ts` defines `DesignSystemWorker<Req, Res>` — a generic class that
  owns the SharedArrayBuffer layout, the Atomics protocol, worker lifecycle (`worker.unref()`, error
  handler, sticky `lastError`), and the fail-loud throw. Both `sort-service.ts` and
  `canonicalize-service.ts` collapse to ~40 LOC of singleton + public signature; each just provides
  its `WORKER_SCRIPT` and a `serviceName` for error messages.
- `src/design-system/tailwind-node.ts` resolves `@tailwindcss/node`'s entry path and reads its
  version once at module load. `sync-loader.ts`, `sort-service.ts`, and `canonicalize-service.ts`
  all consume `TAILWIND_NODE_PATH` and `TAILWIND_NODE_VERSION` instead of redoing the resolve +
  walk-up dance independently.
- `src/rules/no-conflicting-classes/spec.ts` holds the `COMPLEMENTARY_GROUPS` / `COMPOSITION_PAIRS`
  regex tables paired with a `reason: string` per entry. The docs site imports the tables directly
  for its rendered explanations.
- `tests/utils/with-fixture.ts` exposes `runWithFixture` and `makeFixtureRunner` (typed via
  `Parameters<RuleTester['run']>` — no more `any` escape hatches), both of which inject
  `settings.tailwindcss.entryPoint` into rule-tester cases.

### Internal — single-home invariants

- **`!` (important) modifier** has one canonical home: `src/utils/class-parser.ts` exports
  `splitImportant(utility) → { bare, position }` and `reattachImportant(bare, position) → string`.
  Twelve sites that previously reinvented the strip/reattach pattern now consume these, including
  `enforce-canonical.preserveImportantPosition` (where the old hand-rolled `/^[a-z0-9[\]*@-]*:!/`
  regex happened to work for common arbitrary variants but was bracket-non-aware — fixed as a side
  effect).
- **Replacement reporter** centralizes the autofix-then-suggestions dispatch via
  `reportClassReplacements`. Affected rules: `enforce-canonical`,
  `enforce-consistent-important-position`, `enforce-consistent-variable-syntax`, `enforce-logical`,
  `enforce-negative-arbitrary-values`, `enforce-physical`, `no-deprecated-classes`,
  `no-unnecessary-arbitrary-value`, `prefer-theme-tokens`.
- **Directional mappers** (`enforce-logical` ↔ `enforce-physical`) share a
  `createDirectionalMapper(context, { mappings, messageId })` factory. The mapping type is now a
  neutral `AxisMapping { from, to, axis }` consumed in both directions via `invertAxisMappings()`.
- **Variant-order resolution** in `consistent-variant-order` collapses the previous 3-way
  `getConfig()` branching into a single `priorityOf: (v) => number` closure compiled once.

### Internal — hot-path optimizations

- `DesignSystemCache.findOrderByPrefix` no longer scans `orderMap` linearly. A lazy `prefixOrderMap`
  is built on first miss (every dash-bounded sub-prefix of every class maps to the first encountered
  order). Lookup goes from O(N) to O(1) — meaningful for `enforce-sort-order` over dynamic utilities
  (`bg-[#fff]`, `gap-13`, `h-(--var)`, …).
- `extractors.ts` walks AST expressions with an accumulator-passing pattern —
  `extractFromExpression(node, out)` appends to the caller's array directly, eliminating thirteen
  intermediate-array allocations per call site.
- Glob patterns in the entry-point `EntryPointMapping[]` resolver are memoized so the linter doesn't
  recompile the same `RegExp` per AST node.

Test suite at 1035 passing assertions across 50 files (down from v0.8.0's 1093 because auto-detect /
silent-fallback tests are gone; new tests cover the options matrix for
`enforce-physical`/`enforce-logical`, the fail-loud worker behavior, the `splitImportant`
round-trip, `tv`/`cva`/`cn` array extraction (#25), and the cold-cache fork lock reclaiming a stale
lock (#24)).

## 0.8.0 (2026-05-17)

- **Plugin support: `tailwindcss-animate` and `tw-animate-css`**
  ([#17](https://github.com/sergioazoc/oxlint-tailwindcss/pull/17), thanks @Hexoplon) — When either
  plugin is imported into your CSS entry point, classes like `animate-in`, `fade-in`, `zoom-in-95`,
  `slide-out-to-right-96`, `blur-in`, `play-state-initial`, `animate-accordion-down`, the logical
  (RTL-aware) `slide-{in-from,out-to}-{start,end}-*` variants, and the keyframe utilities used by
  Radix-style libraries are recognized across every DS-dependent rule. `no-conflicting-classes` also
  learns that `animate-in`/`animate-out` compose with their `fade`/`spin`/`zoom`/`blur`/`slide`
  modifiers via two explicit `COMPOSITION_PAIRS` entries — the heuristic can't auto-detect this
  because both sides set the same `--tw-enter-*`/`--tw-exit-*` custom properties.

- **`no-conflicting-classes`: same-prefix conflicts within complementary groups**
  ([#19](https://github.com/sergioazoc/oxlint-tailwindcss/pull/19), thanks @Hexoplon) — The
  complementary-group skip was too permissive: pairs like `duration-300 duration-500`,
  `from-red-500 from-blue-500`, `translate-x-1 translate-x-2`, `ease-in ease-out`,
  `delay-100 delay-200`, `scale-50 scale-75`, `rotate-45 rotate-90`, and `skew-x-1 skew-x-2` slipped
  through silently because both sides matched the same group regex. Each cross-prefix group regex
  now captures its utility prefix; `shouldSkipPair` compares the captured prefix so cross-prefix
  pairs still compose (`from-X to-Y`) but same-prefix pairs fall through to the overlap check and
  report. Variant-scoped (`hover:duration-…`), important (both `!` forms), and negative same-axis
  transforms (`translate-x-1` vs `-translate-x-2`) are all covered.

- **`no-conflicting-classes`: narrowing-override + mask gradient family**
  ([#19](https://github.com/sergioazoc/oxlint-tailwindcss/pull/19), thanks @Hexoplon) — Stops
  flagging six families of valid Tailwind v4 idioms as conflicts:
  - `size-N h-M` / `size-N w-M` axis overrides
  - `rounded-{side}-X rounded-{corner}-Y` shorthand → corner refinement (physical and logical)
  - `truncate text-clip` (refines the bundled `text-overflow`)
  - `mask-l-from-N mask-l-to-N` and per-axis `mask-{x,y}-*` stop pairs
  - `mask-linear-N mask-linear-from-N` and the negative-angle form, plus cross-family combinations
    like `mask-b-from-N mask-radial-from-N`
  - `mask-add` / `mask-subtract` / `mask-intersect` / `mask-exclude` paired with any mask gradient
    Implemented as a generic `isNarrowingOverride` heuristic (the later class's CSS properties are a
    strict subset of the earlier class's, so the later class refines one of the shorthand's
    properties — direction-sensitive, so `h-6 size-4` still flags as the wider later class
    clobbering the earlier override) plus a new `COMPLEMENTARY_GROUPS` entry that captures the
    mask-gradient `<family>` / `<family>-<role>`. Two mask composite modes
    (`mask-add mask-subtract`) still conflict on `mask-composite`.

- **`no-hardcoded-colors`: stop flagging `var(--…)` wrappers**
  ([#20](https://github.com/sergioazoc/oxlint-tailwindcss/pull/20), thanks @Hexoplon) — Values like
  `bg-[hsl(var(--primary))]`, `border-[rgb(var(--border))]`, `bg-[oklch(var(--bg))]`,
  `text-[lab(var(--fg))]`, `bg-[var(--primary,#fff)]`, and `bg-[rgb(var(--r),var(--g),var(--b))]`
  were previously reported as hardcoded colors because the rule matched on the color-function form
  without checking whether the inner value was a CSS variable. `isHardcodedColor()` now
  short-circuits when any `var(--…)` reference is present in the value. Documented non-change: mixed
  gradient values like `bg-[linear-gradient(hsl(var(--a)),#fff)]` remain valid — the bail
  short-circuits the whole value once any `var(--…)` is present, so a hardcoded stop nested inside a
  gradient is not flagged.

- **`no-unnecessary-arbitrary-value`: multi-segment utility coverage**
  ([#20](https://github.com/sergioazoc/oxlint-tailwindcss/pull/20), thanks @Hexoplon) —
  `bug_arbitrary_equivalents_prefix` resolved. The `arbitraryEquivalents` precompute derived the
  candidate prefix via `cls.lastIndexOf('-')`, so multi-segment utilities (`bg-red-500`,
  `text-blue-700`, `ring-offset-slate-200`, and every theme token in user CSS) only registered the
  long-prefix form and missed the short one. `bg-[var(--color-red-500)]` was therefore not
  recognized as equivalent to `bg-red-500`. The precompute now enumerates every dash split point
  (start at `indexOf('-', 1)` so negative utilities keep their leading `-`) and emits one candidate
  per prefix; Tailwind's `candidatesToCss` is the source of truth for which split round-trips. Heads
  up for users on theme-token codebases: this introduces new warnings on existing code that
  references default-palette colors via emitted CSS variables (`bg-[var(--color-red-500)]`,
  `text-[var(--color-blue-700)]`, etc.) — all with autofixes.

- **`prefer-theme-tokens` coexistence with the new `no-unnecessary-arbitrary-value`**
  ([#20](https://github.com/sergioazoc/oxlint-tailwindcss/pull/20)) — With theme-token codebases
  where `--color-X: var(--X)` (the variable is exposed directly with no wrapping color function),
  `border-[var(--border)]` is now CSS-equivalent to `border-border` and is owned by
  `no-unnecessary-arbitrary-value`. `prefer-theme-tokens`'s `getNamedEquivalent` guard correctly
  silences the bracket form in that case. When `--color-X` wraps the raw variable in a color
  function (`hsl(var(--X))`, shadcn pre-v4-native style), the bracket form is not CSS-equivalent and
  the opt-in `prefer-theme-tokens` rule remains the only path. The coexistence matrix in
  `tests/integration/prefer-theme-tokens-coexistence.test.ts` locks down both setups.

- **Fix disk cache not invalidating on `tailwindcss` upgrades** — The two-level disk cache in
  `sync-loader.ts` was keyed by `md5(CACHE_VERSION:path:mtime)` and `md5(CACHE_VERSION:content)`,
  where `CACHE_VERSION` was a hardcoded constant bumped manually. The installed `tailwindcss`
  version was not part of the key, so a user upgrading tailwindcss (e.g. 4.2 → 4.3) without changing
  their CSS would keep reading precomputed data from the old version — new utilities like `zoom-*`,
  `tab-*`, `scrollbar-*`, `@container-size` would be flagged as unknown by `no-unknown-classes`.
  `CACHE_VERSION` is replaced by a derived
  `CACHE_KEY = md5(PRECOMPUTE_SCRIPT).slice(0,8):${tailwindVersion}`, computed once at module load.
  The cache now auto-invalidates on three independent signals: CSS content changes, our precompute
  logic changes (script hash), or the installed `@tailwindcss/node` version changes. No more manual
  version bumps when touching the precompute script.

- **Dependencies updated** — tailwindcss 4.3.0, @tailwindcss/node 4.3.0, @oxlint/plugins 1.64.0,
  oxlint 1.64.0, oxfmt 0.49.0, tsdown 0.22.0, typescript 6.0.3, @types/node 25.7.0,
  @typescript/native-preview 7.0.0-dev.20260513.1, vitest 4.1.6. Adds devDeps `tailwindcss-animate`
  1.0.7 and `tw-animate-css` 1.4.0 for plugin integration tests. Tailwind 4.3 adds new utilities
  (`zoom-*`, `tab-*`, `scrollbar-*`, `@container-size`) and refines canonicalization for arbitrary
  values (preserves significant `_` whitespace, keeps original units, migrates `[&:has(…)]` →
  `has-[…]`). All of these flow through the plugin automatically thanks to the cache invalidation
  fix above.

- **Internal: testability refactors** — Extracted four pure functions previously buried in
  module-level IIFEs or visitor closures to enable direct unit tests: `computeCacheKey` +
  `readTailwindVersion` in `sync-loader.ts`, `resolveCssPath` in `loader.ts` (entry-point resolution
  logic with injectable `autoDetect` and `lastPath`), and `shouldSkipPair` +
  `isCompositionViaCssVars` + `isNarrowingOverride` in `no-conflicting-classes.ts` (composition
  heuristics). Also moved `COMPLEMENTARY_GROUPS` and `COMPOSITION_PAIRS` regex tables from inside
  the `no-conflicting-classes` visitor loop to module scope (minor perf win: regexes no longer
  recompiled per AST node). No behavior change for users.

- 1091 tests (up from 852). Includes new unit tests for `isNarrowingOverride` (8 cases covering
  subset/superset/equal/disjoint/empty matrices) and regression guards for `arbitraryEquivalents`
  (shape invariants + acid test that `bg-[var(--color-red-500)]` resolves to `bg-red-500`).

## 0.7.1 (2026-05-07)

- **Fix `enforce-canonical` missing legacy v3 classes**
  ([#16](https://github.com/sergioazoc/oxlint-tailwindcss/issues/16)) — Classes that produce valid
  CSS in v4 but are absent from `getClassList()` (`break-words`, `order-none`, `overflow-ellipsis`,
  `flex-grow{,-0,-1}`, `flex-shrink{,-0,-1}`, `decoration-clone/slice`, `bg-gradient-to-*`,
  `start-N`, `end-N`, `-start-N`, `-end-N` including fractional values) were silently skipped by the
  rule, even though Tailwind's `canonicalizeCandidates()` does rewrite them (e.g. `break-words` →
  `wrap-break-word`, `start-1/2` → `inset-s-1/2`). The precompute step now feeds these legacy
  spellings explicitly: a hardcoded list for fixed renames plus dynamic derivation of
  `start-*`/`end-*` from the `inset-{s,e}-*` utilities present in the design system. Also adds them
  to the valid set so `no-unknown-classes` doesn't flag them. Disk cache version bumped 11 → 13.
- **Dependencies updated** — @oxlint/plugins 1.63.0, oxlint 1.63.0, oxfmt 0.48.0, tsdown 0.22.0,
  @types/node 25.6.2, @typescript/native-preview 7.0.0-dev.20260507.1.
- 852 tests (up from 834).

## 0.7.0 (2026-05-04)

- **New rule: `prefer-theme-tokens`**
  ([#15](https://github.com/sergioazoc/oxlint-tailwindcss/issues/15)) — Suggests named theme-token
  utilities like `border-border` over raw CSS variable references like `border-(--border)` or
  `border-[var(--border)]` when the named utility exists in the design system. Off by default — the
  replacement is a name-match heuristic and can change observable CSS in shadcn-style themes where
  `--color-X` wraps the raw `--X` (e.g. `hsl(var(--X))`). Coexistence with `enforce-canonical` and
  `no-unnecessary-arbitrary-value` is locked down by an integration matrix so they don't double-fire
  on the same input.
- **Fix pnpm strict workspaces** — The precompute child process required `@tailwindcss/node` via
  bare specifier from its cwd, which fails under pnpm with strict hoisting (the module lives under
  `node_modules/.pnpm/oxlint-tailwindcss@…/node_modules`, not on the resolution path from the
  consumer's project root). The plugin now resolves the absolute path from its own install location
  and passes it via env to the child. Includes an actionable error message and a regression test
  that simulates the isolated cwd.
- **Fix unfixable cycle between `no-unnecessary-whitespace` and `enforce-consistent-line-wrapping`**
  ([#14](https://github.com/sergioazoc/oxlint-tailwindcss/issues/14)) — When both rules were enabled
  with `classesPerLine`, autofix oscillated forever: line-wrapping introduced `\n` + indent between
  class chunks, then `no-unnecessary-whitespace` collapsed it back to a single space. The whitespace
  rule now collapses runs of `[ \t]+` only within each line, leaving newlines and the indentation
  that follows them untouched.
- **Multiline-safe class-string rebuilding across all autofix rules** — The same root cause as #14
  affected ~12 other rules that did `splitClasses(value).join(' ')` to rebuild a class string after
  an autofix. They all collapsed multiline indentation into a single space. Introduced
  `splitClassesWithSeparators` + `rebuildClassString` in `class-splitter.ts`: the split captures
  every whitespace run between classes (plus leading/trailing); the rebuild preserves them verbatim
  for 1-to-1 transforms (canonical, sort, variant-order, important-position, logical/physical,
  var-syntax, negative-arb, no-unnecessary-arb, prefer-theme-tokens, no-deprecated, no-unknown
  suggestions) and degrades gracefully for length-changing rules (no-duplicate, shorthand) by
  joining with the first newline-bearing internal separator. The matrix test in
  `tests/integration/multiline-preservation.test.ts` locks per-rule behavior down.
- 834 tests (up from 742).

## 0.6.3 (2026-04-21)

- **Perf: `enforce-canonical` ~5x faster** — Lint time on an 898-file repo with 12 threads dropped
  from 106s to 22s. Named classes (no `[` or `(` in the utility) now resolve via the precomputed
  `canonicalMap` in `DesignSystemCache` instead of going through the worker thread round-trip. Only
  classes with arbitrary or CSS-var values (`p-[2px]`, `bg-(--c)`) still call the worker. A
  process-wide per-class cache keyed by `${cssPath}\0${rem}\0${class}` deduplicates the remaining
  worker requests.
- **Fix latent bug in the canonicalize worker** — The worker called
  `ds.canonicalizeCandidates(classes)` in batch, but that API deduplicates its input. Inputs
  containing duplicate classes produced output shorter than the input and left `dynamic[i]`
  undefined in `enforce-canonical`. The worker now iterates `canonicalizeCandidates([cls])` per
  class, preserving order and length.
- 742 tests (up from 736).

## 0.6.2 (2026-04-21)

- **Fix `MaxListenersExceededWarning` when the plugin runs in multiple oxlint worker threads** — The
  sort and canonicalize services registered `process.on('exit', cleanup)` on every module load. When
  oxlint spawns many lint workers, this exceeded Node's default `MaxListeners` (10) and emitted a
  warning. `worker.unref()` already lets the process exit without waiting for the worker, so the
  exit listener was redundant and has been removed. Regression test added in
  `tests/design-system/exit-listeners.test.ts`.
- **Dependencies updated** — @tailwindcss/node 4.2.4, tailwindcss 4.2.4, @oxlint/plugins 1.61.0,
  oxlint 1.61.0, oxfmt 0.46.0, tsdown 0.21.9, vitest 4.1.5.
- 736 tests (up from 733).

## 0.6.1 (2026-04-14)

- **Fix `consistent-variant-order` incorrect reorder for pseudo-elements**
  ([#12](https://github.com/sergioazoc/oxlint-tailwindcss/issues/12)) — The rule incorrectly moved
  pseudo-element variants (`before:`, `after:`, `placeholder:`, etc.) before element-selecting
  variants (arbitrary selectors `[&>svg]:`, `has-[.active]:`, `aria-expanded:`,
  `data-[state=open]:`, `open:`, etc.), producing broken CSS in Tailwind v4. For example,
  `[&>*[data-role="user"]]:after:right-0` was "fixed" to `after:[&>*[data-role="user"]]:right-0`,
  which generates `&::after { &>*[data-role=user] { ... } }` — pseudo-elements have no children.
  Pseudo-element variants are now always kept innermost (closest to the utility) in both static and
  design system ordering modes.
- 733 tests (up from 707).

## 0.6.0 (2026-04-13)

- **Dynamic canonicalization via `canonicalizeCandidates`**
  ([#11](https://github.com/sergioazoc/oxlint-tailwindcss/issues/11)) — `enforce-canonical` now
  calls Tailwind's `canonicalizeCandidates()` API dynamically via a persistent worker thread (same
  pattern as the sort service). This enables canonicalization of arbitrary user classes that
  couldn't be precomputed. Examples: `p-[2px]` → `p-0.5`, `max-w-[400px]` → `max-w-100`,
  `text-[var(--color-text)]/90` → `text-(--color-text)/90`, `[--w-padding:theme(spacing.1)]` →
  `[--w-padding:--spacing(1)]`. Falls back to the precomputed cache if the worker is unavailable.
- **New setting: `rootFontSize`** — `settings.tailwindcss.rootFontSize` (default: 16) controls the
  px→named class conversion in `enforce-canonical`. Matches the Tailwind CSS IntelliSense
  `rootFontSize` setting.
- 707 tests (up from 700).

## 0.5.0 (2026-04-13)

- **Suggestions API for IDE quick-fixes** — 10 rules now provide `suggest` actions in IDEs. When
  multiple classes have errors in the same attribute, the first gets an autofix and the rest now
  offer an optional quick-fix (previously they had no action). `no-unknown-classes` also offers a
  quick-fix to replace typos with the Levenshtein suggestion. Affected rules: `enforce-logical`,
  `enforce-physical`, `enforce-negative-arbitrary-values`, `enforce-consistent-important-position`,
  `enforce-consistent-variable-syntax`, `no-deprecated-classes`, `consistent-variant-order`,
  `enforce-canonical`, `no-unnecessary-arbitrary-value`, `no-unknown-classes`.
- **`entryPoint` as array for monorepos** — `settings.tailwindcss.entryPoint` now accepts `string[]`
  in addition to `string`. For each file, the plugin picks the entry point whose directory is
  closest in the filesystem tree. Example:
  `entryPoint: ["packages/web/src/globals.css", "packages/admin/src/styles.css"]`.
- **Debug logging** — New `settings.tailwindcss.debug: true` option (or `DEBUG=oxlint-tailwindcss`
  env var) to see which design system is loaded for each file. Output:
  `[oxlint-tailwindcss] src/App.tsx → src/globals.css`. Disabled by default — the always-on log from
  v0.4.1 is removed.
- **`defaultOptions` in rule meta** — 6 rules now declare their default options in the rule schema,
  making defaults visible to tooling. Rules: `max-class-count`,
  `enforce-consistent-important-position`, `enforce-consistent-variable-syntax`,
  `no-dark-without-light`, `no-unknown-classes`, `enforce-consistent-line-wrapping`.
- **Dependencies updated** — @oxlint/plugins 1.60.0, oxlint 1.60.0, oxfmt 0.45.0.
- 700 tests (up from 686).

## 0.4.1 (2026-04-12)

- **Fix `no-conflicting-classes` false positive with `text-*` and `tracking-*`**
  ([#8](https://github.com/sergioazoc/oxlint-tailwindcss/issues/8)) — When a theme defines
  `--text-base--letter-spacing`, `text-base` generates `letter-spacing` in its CSS output. Using
  `tracking-tight` alongside it to override only letter-spacing was incorrectly reported as a
  conflict. Added `[text-*, tracking-*]` to the composition pairs (matching the existing
  `[text-*, leading-*]` pair for line-height).
- **Fix `classed()` false positive with template literal first argument**
  ([#9](https://github.com/sergioazoc/oxlint-tailwindcss/issues/9)) — `classed(\`div\`,
  'truncate')`incorrectly treated the template literal`\`div\``as a class string instead of skipping it as the element type. The skip logic now handles`TemplateLiteral`AST nodes in addition to`Literal`and`Identifier`.
- **Fix auto-detect crossing `package.json` boundaries in monorepos**
  ([#7](https://github.com/sergioazoc/oxlint-tailwindcss/issues/7)) — Packages without their own
  Tailwind CSS file could incorrectly inherit a design system from a parent or sibling package. The
  boundary check now correctly stops at the current package's `package.json` instead of searching
  the parent directory. Additionally, the `lastLoadedPath` fallback is now only set by explicit
  `entryPoint` calls, preventing cross-package contamination via auto-detect.
- **Log loaded design system path** — When a design system is loaded for the first time, the plugin
  now logs `[oxlint-tailwindcss] Loaded design system from "<path>"` to stderr. Helps diagnose which
  CSS entry point is being used, especially in monorepos.
- 686 tests (up from 676).

## 0.4.0 (2026-04-10)

- **Monorepo support: per-file design system resolution**
  ([#7](https://github.com/sergioazoc/oxlint-tailwindcss/issues/7)) — Run `oxlint` once from the
  workspace root and each file automatically uses the correct package-specific Tailwind config. The
  plugin now maintains a per-entry-point DS cache (Map) instead of a single shared instance. The
  lazy loader re-resolves when `context.filename` changes, and auto-detect results are cached by
  directory to avoid repeated filesystem walks.
- **Content-based disk cache for monorepo deduplication**
  ([#6](https://github.com/sergioazoc/oxlint-tailwindcss/issues/6)) — Two-level disk cache (mtime
  index + content hash) allows packages with identical CSS to share a single cache entry. In
  benchmarks, 5 packages with the same CSS: 12.3s → 45ms (99.6% reduction).
- **Configurable timeout** ([#6](https://github.com/sergioazoc/oxlint-tailwindcss/issues/6)) — New
  `settings.tailwindcss.timeout` option (default: 30000ms) for environments where design system
  loading is slow.
- **Precompute performance optimizations** — Replaced O(N²) linear scans (`indexOf`/`includes`) with
  Map/Set lookups in the PRECOMPUTE_SCRIPT. Cold load time reduced from 2.4s to 1.7s (27%).
- **Sort service multi-DS support** — The sort worker now tracks its current CSS path and restarts
  when the entry point changes, with graceful fallback to heuristic sort during restart.
- 676 tests (up from 601).

## 0.3.0 (2026-04-09)

- **Exclude defaults via `settings.tailwindcss.exclude`**
  ([#5](https://github.com/sergioazoc/oxlint-tailwindcss/issues/5)) — Remove specific items from the
  built-in defaults. For example, `exclude: { variablePatterns: ["^styles?$"] }` stops the plugin
  from scanning variables named `style`/`styles`. Supports `attributes`, `callees`, `tags`, and
  `variablePatterns`.
- **Auto-detect follows indirect `@import`**
  ([#4](https://github.com/sergioazoc/oxlint-tailwindcss/issues/4)) — When a candidate CSS file
  doesn't contain a direct Tailwind signal but has `@import` statements, the auto-detector now
  follows those imports one level deep to find the signal. Supports relative paths and package
  imports (e.g. `@import '@company/theme/tailwind.config.css'`). No recursion — maximum one level.
- 601 tests (up from 591).

## 0.2.0 (2026-04-09)

- **Custom class detection via settings**
  ([#1](https://github.com/sergioazoc/oxlint-tailwindcss/issues/1)) — New `settings.tailwindcss`
  options to extend class detection: `attributes` (additional JSX attribute names), `callees`
  (additional function names), `tags` (additional tagged template tags), and `variablePatterns`
  (additional regex patterns for variable names). All values are additive to the built-in defaults.
  Applies to all 22 rules at once.
- **Object-valued JSX attribute support**
  ([#1](https://github.com/sergioazoc/oxlint-tailwindcss/issues/1)) — Attributes like
  `classNames={{ root: "flex", label: "text-sm" }}` now extract class strings from object values.
  Supports string literals, ternaries, and logical expressions in values.
- **Built-in tw-classed support** ([#2](https://github.com/sergioazoc/oxlint-tailwindcss/issues/2))
  — `classed()` calls are now detected by default. The first argument (element type or component
  reference) is skipped, and remaining arguments are extracted as class strings or cva-like config
  objects (variants, compoundVariants).
- **Fix `no-conflicting-classes` false positive with `inset-ring` and `shadow`**
  ([#3](https://github.com/sergioazoc/oxlint-tailwindcss/issues/3)) — Classes like `inset-ring-1`
  and `shadow-md` both set `box-shadow` but compose via different CSS custom properties
  (`--tw-inset-ring-shadow` vs `--tw-shadow`). These are no longer reported as conflicting. The fix
  uses a CSS custom property heuristic: if two classes both use `--tw-*` variables but none overlap,
  they are composing, not conflicting. This also fixes false positives for `inset-shadow` +
  `shadow`, `inset-ring` + `ring`, and all other composition patterns (filter, backdrop-filter,
  contain, font-variant-numeric, touch-action, border-spacing, mask).
- **Internal: `createExtractorVisitors` helper** — All 22 rules now use a shared visitor factory
  instead of duplicating 4 AST visitor callbacks each. Reduces boilerplate and ensures custom config
  is applied uniformly.
- **Dependencies updated** — @oxlint/plugins 1.59.0, oxlint 1.59.0, oxfmt 0.44.0.
- 591 tests (up from 571).

## 0.1.10 (2026-03-27)

- **Fix `no-conflicting-classes` false positives with plugin classes** — Classes from plugins like
  `@tailwindcss/typography` (`prose`) generate CSS with nested descendant selectors
  (`:where(.prose pre)`, `:where(.prose a)`, etc.). Previously, ALL properties from descendant
  selectors were treated as if they applied to the root element, causing false conflicts. Now only
  root-level CSS properties are used for conflict detection. Example: `prose overflow-x-auto` no
  longer reports a conflict because `overflow-x` only applies to `.prose pre`, not to `.prose`
  itself.
- **Fix `no-unknown-classes` false positive for modifier classes** — Classes like `not-prose` (from
  `@tailwindcss/typography`) that don't generate their own CSS but are referenced via
  `[class~="not-prose"]` attribute selectors in other classes' output are now recognized as valid.
- 550 tests (up from 548).

## 0.1.9 (2026-03-19)

- **Fix `enforce-sort-order` in VS Code** — The sort service worker thread failed to resolve
  `@tailwindcss/node` in VS Code's extension host due to a different module resolution context. The
  parent thread now resolves the module path via `require.resolve()` and passes it to the worker,
  fixing false positives that only appeared in VS Code.
- **Fix heuristic sort for null-order classes** — Marker classes like `group/name` and `peer/name`
  (which return `null` from `ds.getClassOrder()`) now sort first in the heuristic fallback, matching
  the behavior of oxfmt and prettier-plugin-tailwindcss.
- **Fix heuristic sort for dynamic numeric values** — Classes like `underline-offset-3` and `gap-13`
  that are valid in Tailwind v4 but missing from `getClassList()` now resolve their order via prefix
  lookup in `cache.getOrder()`, preventing incorrect sort positions in the heuristic fallback.
- 548 tests (up from 545).

## 0.1.8 (2026-03-18)

- **`enforce-consistent-important-position` default changed to suffix** — Tailwind v4's canonical
  form is `font-bold!` (suffix). The default was `prefix` (`!font-bold`), which is the deprecated v3
  form. Using `"prefix"` may now conflict with `enforce-canonical`.
- **`enforce-canonical` preserves `!` position** — Canonicalization no longer forces `!` to prefix.
  If the user wrote `-m-0!` it now canonicalizes to `m-0!` (not `!m-0`), respecting the original
  modifier position.
- **`consistent-variant-order` supports `*`/`**` selectors** — Child (`\*:`) and descendant
  (`\*\*:`) selectors are now included in the default variant order. Fixed arbitrary variant
  brackets (`[...]`) no longer getting priority `-1`.
- **Dependencies updated** — tailwindcss 4.2.2, @oxlint/plugins 1.56.0, oxlint 1.56.0, oxfmt 0.41.0,
  tsdown 0.21.4, @typescript/native-preview 7.0.0-dev.20260318.1.
- 545 tests (up from 536).

## 0.1.7 (2026-03-16)

- **Fix sort service keeping process alive** — Add `worker.unref()` so the worker thread doesn't
  prevent Node.js from exiting naturally after linting completes.

## 0.1.6 (2026-03-16)

- **Add `enforce-physical` rule** — Inverse of `enforce-logical`. Converts logical properties
  (`ms-4`, `start-0`) to physical ones (`ml-4`, `left-0`). Autofix. 22 rules total.
- **Exact official Tailwind sort order** — `enforce-sort-order` now uses `ds.getClassOrder()` via a
  persistent child process (sort service) for results identical to
  oxfmt/prettier-plugin-tailwindcss. Falls back to improved heuristic sort on platforms without FIFO
  support.
- **Fix `enforce-sort-order` heuristic fallback** — Variant-prefixed classes, arbitrary values
  (`max-w-[200px]`), CSS function syntax (`h-(--size)`), and slash modifiers (`bg-muted/50`) now
  resolve correctly.
- **Fix `enforce-shorthand`** — Exclude viewport units (`dvw`, `dvh`, `svw`, `svh`, `lvw`, `lvh`)
  from w+h→size shorthand. Fix suggesting invalid `size-screen`.
- **Fix `no-conflicting-classes` false positives** — Transform axes, Tailwind composition patterns
  (shadow/ring, divide/border, gradient utilities).
- **Fix `no-unknown-classes` false positives** — Improved `candidatesToCss()` expansion, opacity
  modifiers (`bg-black/80`), gradient deprecations, dynamic numeric values, bare utilities.
- **Fix import resolution** — External CSS packages, group/peer detection, CSS class extraction from
  imports.
- **Add deprecated gradient classes** — `bg-gradient-to-{t,tr,r,br,b,bl,l,tl}` → `bg-linear-to-*`
  with autofix.
- Default config: `max-class-count` and `enforce-consistent-line-wrapping` default to "off".
- 536 tests (up from 484).

## 0.1.5 (2026-03-15)

- **Fix `!` (important) modifier handling across all rules** — Both prefix (`!flex`) and suffix
  (`flex!`) forms now work correctly in all 21 rules. Previously, classes with `!` were silently
  ignored by lookups in `enforce-shorthand`, `enforce-logical`, `enforce-canonical`,
  `enforce-sort-order`, `enforce-consistent-variable-syntax`, `enforce-negative-arbitrary-values`,
  `no-deprecated-classes`, `no-unnecessary-arbitrary-value`, `no-conflicting-classes`,
  `no-hardcoded-colors`, `no-arbitrary-value`, `no-dark-without-light`.
- **Fix `enforce-sort-order`** — Classes with `!` modifier (e.g., `!text-red-500`) were sorted
  incorrectly (always placed first). Now use the same sort order as their non-`!` equivalent.
- **Fix `no-deprecated-classes` autofix** — Multiple deprecated classes in the same string are now
  all fixed in one pass (previously only the first was fixed).
- **Fix monorepo auto-detection** — Entry point is now detected by walking up from the linted file's
  path, not from `process.cwd()`. Fixes auto-detection in monorepos where lint runs from the root.
- **`settings.tailwindcss.entryPoint`** — Configure the entry point once in `.oxlintrc.json`
  settings instead of repeating it per rule.
- **Disk cache** — Design system precomputed data is cached to disk. Subsequent loads are ~10x
  faster.
- **Expanded auto-detection** — 81 candidate paths (9 directories × 9 filenames).
- **Fix opacity modifier false positives** — Classes like `bg-black/80`, `text-white/90` were
  incorrectly reported as unknown.
- **Fix `no-conflicting-classes` false positives** — Filter out `@property` descriptors (`syntax`,
  `inherits`, `initial-value`) from CSS property extraction. These were incorrectly shared across
  unrelated utilities, causing false conflicts like `shadow-lg` vs `ease-in-out`.
- **Fix `no-unknown-classes` false positives** — Classes valid in Tailwind v4 but missing from
  `getClassList()` are now handled: dynamic numeric values (`w-45`, `min-h-17.5`) via prefix
  heuristic, bare utilities (`rounded`, `shadow`) and screen breakpoints (`max-w-screen-lg`) via
  precompute expansion with `candidatesToCss()`, opacity modifiers (`bg-black/80`) via slash
  stripping.
- Centralized `stripImportant()` in design system cache for consistent `!` handling.
- 484 tests (up from 344).

## 0.1.4 (2026-03-14)

- **Global `entryPoint` via settings** — Configure `settings.tailwindcss.entryPoint` once in
  `.oxlintrc.json` instead of repeating it per rule.
- **Disk cache for design system** — Precomputed data is cached to `/tmp/oxlint-tailwindcss/`.
  Subsequent loads are ~10x faster.
- **Expanded auto-detection** — 81 candidate paths (9 directories × 9 filenames). Adds
  `app/tailwind.css`, `css/`, `style/`, `assets/`, `resources/css/`, and more.
- Improved test coverage: tests now sync with source constants (`DEPRECATED_MAP`,
  `PHYSICAL_TO_LOGICAL`, `CANDIDATE_DIRS/NAMES`).
- Simplified README: removed redundant `entryPoint` option tables, trimmed verbose examples.

## 0.1.3 (2026-03-14)

- Fix all autofix rules stripping leading/trailing spaces in template literals (e.g.,
  `` `h-3 w-3 ${x}` `` → `` `size-3${x}` ``). Affected rules: `enforce-shorthand`,
  `enforce-sort-order`, `enforce-canonical`, `enforce-logical`,
  `enforce-consistent-variable-syntax`, `enforce-consistent-important-position`,
  `enforce-negative-arbitrary-values`, `enforce-consistent-line-wrapping`,
  `consistent-variant-order`, `no-duplicate-classes`, `no-deprecated-classes`,
  `no-unnecessary-arbitrary-value`.

## 0.1.2 (2026-03-14)

- **no-contradicting-variants**: Fix false positives for variants that target different elements —
  pseudo-elements (`after:`, `before:`, `file:`, `placeholder:`), child/descendant selectors (`*:`,
  `**:`), and arbitrary selectors (`[&>svg]:`, `[&_div]:`).
- Remove unused `tailwind-api.ts` module.

## 0.1.1 (2026-03-14)

- Renamed package from `oxlint-plugin-tailwindcss` to `oxlint-tailwindcss`.

## 0.1.0 (2026-03-13)

Initial release with 21 Tailwind CSS v4 linting rules for oxlint.

### Correctness Rules

- **no-unknown-classes** — Flags classes not defined in the Tailwind design system, with typo
  suggestions via Levenshtein distance.
- **no-duplicate-classes** — Detects and auto-fixes duplicate classes within class strings.
- **no-conflicting-classes** — Warns when two classes affect the same CSS properties.
- **no-deprecated-classes** — Flags deprecated Tailwind v4 classes (`flex-grow` → `grow`, etc.) with
  auto-fix.
- **no-unnecessary-whitespace** — Normalizes extra spaces in class strings.
- **no-dark-without-light** — Requires a base utility when using `dark:` variant on the same
  element.

### Style Rules

- **enforce-sort-order** — Sorts classes according to Tailwind's official order with auto-fix.
- **enforce-canonical** — Rewrites non-canonical forms to their canonical equivalents (e.g., `-m-0`
  → `m-0`).
- **enforce-shorthand** — Suggests shorthand classes when all axes share the same value
  (`mt-2 mr-2 mb-2 ml-2` → `m-2`).
- **enforce-logical** — Suggests logical properties for RTL/LTR support (`ml-4` → `ms-4`).
- **enforce-consistent-important-position** — Enforces consistent `!` position: prefix
  (`!font-bold`) or suffix (`font-bold!`). Auto-fix.
- **enforce-negative-arbitrary-values** — Moves negative outside brackets inside: `-top-[5px]` →
  `top-[-5px]`. Auto-fix.
- **enforce-consistent-variable-syntax** — Enforces v4 shorthand `bg-(--var)` or explicit
  `bg-[var(--var)]`. Auto-fix.
- **consistent-variant-order** — Enforces variant order: responsive before state (`hover:sm:flex` →
  `sm:hover:flex`). Auto-fix.
- **no-unnecessary-arbitrary-value** — Replaces arbitrary values with named equivalents when
  available (`h-[auto]` → `h-auto`). Auto-fix.

### Complexity Rules

- **max-class-count** — Warns when an element exceeds the class count limit (default: 20).
- **enforce-consistent-line-wrapping** — Warns when a class string exceeds the print width (default:
  80).

### Restriction Rules

- **no-restricted-classes** — Blocks specific classes by name or regex pattern.
- **no-arbitrary-value** — Prohibits arbitrary values (`w-[200px]`) to enforce design system usage.
- **no-hardcoded-colors** — Flags hardcoded color values like `bg-[#ff5733]` or `text-[rgb()]`.
- **no-contradicting-variants** — Detects redundant variant classes (`flex dark:flex`).

### Features

- Synchronous design system loading via `execFileSync` — no async overhead in the lint loop.
- Auto-detection of Tailwind CSS entry point (walks up from CWD).
- Supports JSX attributes, `cn()`/`clsx()`/`cva()`/`twMerge()`/`tv()` calls, and `tw` tagged
  templates.

- Graceful degradation — rules that need the design system return no errors if it can't load.
