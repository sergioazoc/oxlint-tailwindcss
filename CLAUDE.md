# CLAUDE.md

## Monorepo layout

This repository is a pnpm workspace with two packages:

- **`packages/oxlint-tailwindcss/`** — the published npm package. The library implementing the
  Tailwind CSS linting rules.
- **`packages/docs/`** — the VitePress v2 documentation site (English default, Spanish at `/es`).

`lint` and `format` are **centralized at the root** — oxlint/oxfmt run from the root over the whole
monorepo (a single root `.oxlintrc.json` / `.oxfmtrc.json`; the packages have none). `build`,
`test`, and `typecheck` delegate to `packages/oxlint-tailwindcss/`. Docs targets use
`pnpm -C packages/docs <script>` explicitly.

Markdown is formatted by oxfmt too (`proseWrap: always`; fenced code left untouched via
`embeddedLanguageFormatting: off`). `.claude/**` is ignored. The docs `generate` step formats the
rule pages it emits, so `generate` output and `format:check` agree.

## Commands

From the workspace root:

```bash
pnpm install          # install all workspaces (pnpm version pinned by the root `packageManager`)
pnpm build            # build the plugin (delegates to packages/oxlint-tailwindcss)
pnpm test             # run plugin test suite (vitest run, excluding benchmarks)
pnpm test:watch       # watch mode
pnpm lint             # oxlint over the whole monorepo (root config)
pnpm lint:types       # type-aware lint (tsgolint) over packages/oxlint-tailwindcss/src
pnpm format           # oxfmt --write over the whole monorepo
pnpm format:check     # oxfmt --check (verify only, no write)
pnpm typecheck        # tsc --noEmit
pnpm -C packages/docs dev   # local docs site
```

## Type-aware linting (`lint:types`)

oxlint exposes type-aware rules via the optional `oxlint-tsgolint` engine (a root devDependency;
ships a per-platform binary through optionalDependencies, so CI on `ubuntu-latest` resolves the
linux build automatically). It needs TypeScript type information, which this repo satisfies for free
— `typescript@7` (tsgo), `moduleResolution: "bundler"`, no `baseUrl`. `pnpm lint:types` runs
`oxlint --type-aware` scoped to `packages/oxlint-tailwindcss/src`, where tsgolint discovers the
plugin's `tsconfig.json` on its own (there is deliberately no root `tsconfig.json`).

- **Curated rule set** (root `.oxlintrc.json`, under an `overrides` block matching
  `packages/oxlint-tailwindcss/src/**/*.ts` so type-aware rules NEVER reach `tests/` — excluded from
  the plugin tsconfig — or `packages/docs`): `typescript/no-floating-promises`,
  `no-misused-promises`, `await-thenable`, `no-for-in-array`, all `error`. They guard the sync/async
  worker bridge (`worker_threads` + `SharedArrayBuffer` + `Atomics`), which is the codebase's most
  error-prone surface.
- **Inert without the flag**: type-aware rules only run under `--type-aware`, so the
  release-blocking `pnpm lint` (whole monorepo, no flag) is unaffected. `lint:types` is a separate
  script that `ci.yml` runs on PRs and pushes to `main`; it is deliberately NOT in `release.yml`, so
  releases stay decoupled from this gate.
- **Two deliberate exceptions**: `void worker.terminate()` (fire-and-forget teardown, for
  `no-floating-promises`) and the inline `no-implied-eval` suppression on the
  `new Function(PRECOMPUTE_SCRIPT)` parse-probe in `sync-loader.ts` (syntax validation, not code
  execution). Both carry inline justifications; keep them.
- **Deferred**: `typescript/no-unnecessary-condition` is intentionally OFF — it surfaced ~25
  warnings (a mix of intentional defensive checks and simplifiable optional chains). It's a separate
  incremental cleanup, not part of enabling type-aware linting.

Run a single test file:
`pnpm -C packages/oxlint-tailwindcss exec vitest run tests/rules/no-duplicate-classes.test.ts`

## Versioning

Always use **semver** for version bumps: patch (x.y.Z) for bugfixes only, minor (x.Y.0) for new
features or non-breaking additions, major (X.0.0) for breaking changes.
`packages/oxlint-tailwindcss/package.json` carries the published version; the root `package.json` is
`private` and stays at `0.0.0`.

## Releases

`release.yml` runs on **push to the `release` branch** and does everything: lint/format/typecheck/
build/test, deploy docs to Cloudflare Pages, publish to npm (idempotent — `npm view` skips the
publish when the version already exists, so a docs-only release is fine), and create the GitHub
Release. `main` is the dev branch; nothing publishes on a push to `main` (CI only).

**To cut a release:**

1. Land the version bump (`packages/oxlint-tailwindcss/package.json`) + `CHANGELOG.md` entry on
   `main` via a normal PR (squash-merge is fine).
2. `git push origin main:release`

That's it — the push fast-forwards `release` to `main` and `release.yml` takes over.

> **⚠️ Invariant: `release` is a pure fast-forward mirror of `main`. NEVER put a commit on `release`
> that isn't on `main`** — no direct commits, no merges _into_ `release`, no cherry-picks, no
> squash. The branch is only ever advanced by `git push origin main:release`. The moment `release`
> gets a commit `main` doesn't have, the two diverge, `git push origin main:release` stops
> fast-forwarding (non-fast-forward rejection), and — because `release` is a **protected branch with
> `allow_force_pushes: false` and `enforce_admins: true`** — you can't just force it back.
> Recovering then requires temporarily flipping `allow_force_pushes` to reset `release = main`, or a
> conflict-resolving merge commit. Keep `release` clean and the one-liner keeps working.

## Architecture

oxlint plugin with 25 Tailwind CSS v4 linting rules. Uses `@oxlint/plugins`' `createOnce` API (runs
once per lint session; returned visitors run on every matching AST node). This document covers the
error-prone subsystems, not every rule; the canonical per-rule reference (all 25, with options and
defaults) is `packages/docs/rules/index.md`.

**Design principle — deterministic, explicit, fail-loud.** `settings.tailwindcss.entryPoint` is
mandatory: the plugin never auto-detects the CSS entry point and never falls back to a previously
loaded design system. A DS-dependent rule never silently skips when the design system can't load —
it reports a fatal `designSystemUnavailable` diagnostic (the DS-optional rules below fall back to a
deterministic static path instead). mtime is in-memory only (content hash is the disk-cache key).
The trade-off — one extra config line for every project, in exchange for "configure once, never
fails" — is an intentional alignment with prettier-plugin-tailwindcss / oxfmt / better-tailwindcss.

Core sync/async bridge: `@tailwindcss/node`'s `__unstable__loadDesignSystem` is async, but
`createOnce` is sync. Two strategies:

1. **Precompute** (`sync-loader.ts`): a **worker_thread** (`runPrecomputeViaWorker`) pre-computes
   validity, canonical forms, CSS props, etc. and writes the JSON straight to the disk cache; the
   main thread blocks on `Atomics.wait` for a SharedArrayBuffer ready signal, then reads the file
   back. Runs ONCE per unique CSS entry point, cached on disk by content hash (single-level cache in
   v1). Throws `DesignSystemLoadError` on any failure — never returns null. Content-based caching
   allows monorepo packages with identical CSS to share a single cache entry. Across parallel oxlint
   isolates a content-hash-scoped file lock (`computeWithLock`) serializes the cold-cache compute —
   only one worker runs per hash, the rest busy-wait (Atomics) for the cache file. **Why a
   worker_thread, not a child process (#24):** `execFileSync` `fork()`s the oxlint host (Rust +
   embedded Node); under Linux overcommit accounting on memory-constrained CI runners (GitHub
   `ubuntu-latest`), forking a large-RSS process is rejected with `spawnSync … ENOMEM` even though
   the child immediately `exec`s. A worker_thread creates a thread in-process — no address-space
   duplication — so it is immune. The disk cache is the worker→main payload channel (the 4 MB
   SharedArrayBuffer in `ds-worker.ts` is too small for the multi-MB precompute JSON), written
   atomically (tmp + `renameSync`).
2. **Worker services** (`sort-service.ts`, `canonicalize-service.ts`, `declaration-service.ts`): all
   three wrap the shared `DesignSystemWorker<Req, Res>` class in `design-system/ds-worker.ts`. The
   class owns the SharedArrayBuffer layout, the Atomics protocol, worker lifecycle
   (`worker.unref()`, error handler, one warm worker per `cssPath`), and the sticky errors (see
   "Worker services lifecycle" under Key Constraints). The worker script itself is built by the
   shared `makeWorkerScript(handlerExpr, preamble = '')` factory (also in `ds-worker.ts`) — each
   service passes its handler expression (`ds.getClassOrder` for sort, `ds.canonicalizeCandidates`
   for canonicalize, `ds.candidatesToCss` for declarations) and optionally a preamble
   (declaration-service injects `DECL_EXTRACTOR_SOURCE`); the factory owns the buffer offsets, DS
   load (with error-cause propagation), ready signal, and request loop, so the services don't
   duplicate the protocol. Each loads the DS once per entry point and accepts sync requests with a
   fixed 60 s init timeout and a 30 s default per-request timeout that only the
   `OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT` env var can override (#145) — neither is governed by
   `settings.tailwindcss.timeout`, which only affects the precompute loader. Failures throw
   `SortServiceError`: DS-dependent rules surface it as `designSystemUnavailable` (via `safeGetDS`,
   or `reportFatalDsError` directly in `no-unknown-classes`), while the DS-optional caller of the
   declaration service (`no-dark-without-light`) catches it with `isFatalError` and degrades to
   prefix-only grouping for the classes it could not resolve. `canonicalize-service` adds a
   process-wide per-class cache keyed by `${cssPath}\0${rem}\0${class}`, rounding rem/em/px floats
   (`roundRemValue`) before storing so the worker path matches the precomputed map.
3. **`@tailwindcss/node` engine resolution** lives in `design-system/tailwind-node.ts`, two layers
   (issue #114). (a) **Bundled fallback** — `TAILWIND_NODE_PATH` / `TAILWIND_NODE_VERSION`, resolved
   ONCE at module load from the plugin's own copy: the path is the last-resort engine (and the
   specifier workers resolve from a tmp-dir `eval` context), and `TAILWIND_NODE_VERSION` is the
   "tested ceiling" the engine guard grades against. (b) **Per-entry-point resolution** —
   `resolveTailwindNodeFor(cssPath)` resolves the CONSUMER's engine from the `node_modules` around
   the resolved CSS entry point (CSS dir first, then via the build tool `@tailwindcss/postcss` /
   `vite` / `cli` following pnpm symlinks with `realpathSync`, finally the bundled copy; prefers the
   candidate whose version equals the build's `tailwindcss`). Returns
   `{ nodePath, nodeVersion (E), buildVersion (B), usedBundled }`, memoized per CSS directory
   (`resolutionCache`, cleared by `resetTailwindNode`). It's a pure function of the on-disk module
   topology, so `sync-loader`, `ds-worker` (behind the sort/canonicalize/declaration services), the
   disk-cache key, and the engine guard all independently agree on ONE engine per `cssPath` — no
   threading. In a monorepo, packages pinned to different Tailwind versions each get their own
   engine.

DS-dependent rules (the 7 users of `safeGetDS`, which reports `designSystemUnavailable`):
`no-unknown-classes`, `no-conflicting-classes`, `enforce-canonical`, `enforce-sort-order`,
`no-unnecessary-arbitrary-value`, `prefer-scale-token`, `prefer-theme-tokens`. The **DS-optional**
rules use `softGetDS` instead — they consult the DS when an entryPoint is configured but fall back
to a deterministic static path when it isn't, so a missing entryPoint is tolerated silently and none
may ever emit `designSystemUnavailable`. There are 10: `consistent-variant-order`,
`no-contradicting-variants`, `enforce-consistent-line-wrapping`, `no-dark-without-light`,
`enforce-shorthand`, `enforce-logical`, `enforce-physical` (these last two reach `softGetDS` through
the shared directional mapper in `enforce-logical.ts`), `no-deprecated-classes`, and
`no-arbitrary-value` — which touches the DS only under `allowVariables: 'runtime'`, lazily, on the
first pure `var()` reference (`definesVar` tells a runtime variable from one the stylesheet defines;
without a DS the reference is reported, the safe side for a restriction rule), and
`no-dynamic-classes` — the project's utilities and variants join Tailwind's as roots with a DS;
without one, `STATIC_UTILITY_ROOTS` / `STATIC_VARIANTS`, which a test pins to Tailwind's own lists.
`no-dark-without-light` checks only variant classes that set a **colour** (R3): with the DS,
`colorPropertyOf` reads the class's declarations (a `*-color` / `fill` / `stroke` /
`--tw-gradient-*` property, a `--color-*` read, or a colour literal outside `var()` fallbacks — so
`shadow-lg`'s fallback `rgb()` doesn't count); without it, `isNeverColorStatic` skips the families
that never are (filters, opacity, display, visibility, position, `sr-only`, border/outline/ring
widths) and everything else is still checked. Prefix grouping of the base is unchanged, so
`border dark:border-gray-700` and `shadow-sm dark:shadow-white/10` stay valid.
`consistent-variant-order`, `no-contradicting-variants`, and `enforce-consistent-line-wrapping` have
static fallbacks (the pseudo-element/barrier name lists; the same lists plus the
`display`/`visibility` property groups; and prefix-unaware variant-run grouping respectively) that
are themselves deterministic. `consistent-variant-order`'s order is `CANONICAL_ORDER` in both paths
— outermost first, as Tailwind's docs and shadcn/ui write chains — and the DS only says what a
project variant is (a pseudo-element, a barrier, or a `--breakpoint-*`); a variant with no rank
splits segments like a barrier, so a project's `@custom-variant` is never moved.
`no-contradicting-variants` also runs a **responsive-reset guard (#150)**: before flagging `V:util`
redundant against an unconditional base `util`, it suppresses the report when a sibling with a
DIFFERENT utility writes an overlapping CSS property (`md:hidden` overriding `display` between
`block` and `lg:block`) — that variant is load-bearing, not redundant. Property source is
`cache.getCssProperties` with an entryPoint, else the static `display`/`visibility` groups; sibling
scan skips `changesTarget` variants (other box) and same-utility siblings (same value). Strictly
report-reducing, so it can never introduce a new false positive. `enforce-consistent-line-wrapping`
consults the DS ONLY for the project prefix (so `wrapLines: 'all'` grouping treats `tw:` as
transparent, matching the prefix invariant); everything else it does is DS-free.
`no-deprecated-classes` is DS-optional, not DS-independent (#69 removed the hard DS requirement, not
DS use itself): with an entryPoint it prefers the richer rename map the precompute derives from
`canonicalizeCandidates`, and falls back to the hardcoded `DEPRECATED_MAP` when none is configured.
Because it goes through `softGetDS` it never emits `designSystemUnavailable`.

## Extraction System

`extractors.ts` is the shared class-detection layer used by all rules. Every rule delegates to
`createExtractorVisitors(context, check)` which generates the 4 standard AST visitors and resolves
the extractor config lazily from `settings.tailwindcss`.

**What oxlint hands the extractor in framework files.** In `.vue`, `.svelte` and `.astro`, oxlint's
partial loaders pass JS plugins only the script sections — every Vue `<script>`/`<script setup>`
(incl. `lang="tsx"`), Svelte's `<script module>` and instance script, Astro's frontmatter and
`<script>` tags — each as its own program, with diagnostics and fixes mapped back to file positions
(byte offsets). Templates and markup are never visible, and `.html` is not linted. So the 4 visitors
never see a template `class="…"`. `tests/e2e/framework-files.test.ts` locks this with the real
binary and has canaries that fail on purpose when oxlint changes it (languagePlugins,
oxc#24597/#23207/#20501; multi-line `<script`, oxc#26289); update `packages/docs/frameworks.md`,
`setup.md` (EN+ES) and both READMEs first when one flips.

**Default detection targets** (extended additively via settings):

- **Attributes**: `className`, `class` (JSX)
- **Callees** (14): `cn`, `clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`, `ctl`, `twJoin`, `cc`,
  `clb`, `cnb`, `objstr`, `classed`
- **Tags**: `tw` (tagged template literals: `` tw`bg-red-500` ``)
- **Variable patterns**: identifiers matching `/^classNames?$/`, `/^classes$/`, `/^styles?$/`

**Custom configuration** via `settings.tailwindcss` (all additive to defaults):

- `attributes: string[]` — additional JSX attribute names
- `callees: string[]` — additional function names
- `tags: string[]` — additional tagged template tags
- `variablePatterns: string[]` — additional regex patterns for variable names (as strings, compiled
  to RegExp)
- `attributePatterns: string[]` — regex patterns matched against JSX attribute NAMES (as strings,
  compiled to RegExp; default `[]`, #134). Distinct from `variablePatterns`, which matches variable
  names. Additive; not covered by `exclude`.
- `calleeExtractors: Record<string, 'tv' | 'cva' | 'classed' | 'flat'>` — routes a custom callee
  through a known structured extractor (#155). Lets a wrapper re-exported under another name
  (`defineStyles = createTV(config)`) get the same deep extraction as `tv()` without renaming
  imports. Dispatch lives after the three hardcoded `cva`/`tv`/`classed` checks in
  `extractFromCallExpression`, so the **reserved names win** (can't be remapped); `'flat'` is the
  generic cn-style walk. Keys are **auto-registered** into `callees` inside `getExtractorConfig`
  (else the `config.callees.includes` guard would make them dead code), and dropped when they also
  appear in `exclude.callees` (so exclusion wins). Validation mirrors `compileRegexList`: an
  unrecognized value or a non-object map is skipped, never thrown. Empty by default → byte-identical
  behavior. All locations stay `origin: 'callee'` (fragment), so relational rules (#117) gain no
  false positives.
- `exclude: { attributes?, callees?, tags?, variablePatterns? }` — remove specific items from
  defaults. For `variablePatterns`, exclusions match against `RegExp.source`.

Config is resolved by `getExtractorConfig(context)` **per file**: a `WeakMap` keyed by the file's
settings object (oxlint builds one per file) is the fast path for every visitor call in that file,
and a bounded (32) memo keyed by the `tailwindcss` block's JSON shares one compiled config across
all files with equal settings. Never key it by the context — one context serves every file of a
worker (see "Per-file options and settings"). `resetExtractorConfig()` drops both caches (tests).

**Deep extraction**: `cva()` understands `variants`, `compoundVariants`, ignores `defaultVariants`.
`tv()` understands `base`, `slots`, `variants` (with slot sub-objects), `compoundVariants`,
`compoundSlots`. `classed()` (tw-classed) skips first arg (element type), then extracts class
strings and cva-like config from remaining args.

- **JSX object values**: an object-valued matched attribute extracts string values from the object
  (not keys) — e.g. `classNames={{ root: "flex", label: "text-sm" }}`, once `classNames` is added
  via `settings.tailwindcss.attributes` (it is not a default attribute). This is distinct from
  call-expression objects like `cn({ "bg-red-500": cond })` which extract keys.
- **Expressions**: ternaries (`cond ? "a" : "b"`), logical (`flag && "a"`), object keys
  (`cn({ "bg-red-500": cond })`), arrays (`cn(['a', 'b'])`, `tv({ base: ['a', 'b'] })` — the
  idiomatic multi-line form; `extractFromExpression` recurses into elements, skipping holes and
  spreads), template literals with leading/trailing space preservation across expressions.
- **Glued template fragments are cut before rules see them.** In `` `bg-${c}-500 p-4` `` the text
  touching a `${}` (`bg-`, `-500`) is a fragment of one runtime class. `createExtractorVisitors`
  runs `narrowGluedFragments` on every batch: a quasi whose `preserveLeadingSpace` /
  `preserveTrailingSpace` edge is not whitespace loses that glued token from `value` and `range`,
  and a quasi that is nothing but fragments is dropped. So fixers only rewrite self-contained
  classes and the `${}` boundary is never re-spaced (it used to split the class: `bg-${c} -500`).
  Rules that reason about the raw text — `no-unnecessary-whitespace`,
  `enforce-consistent-line-wrapping`, `max-class-count`, and `no-dynamic-classes` (whose subject IS
  the glued fragments) — pass `{ raw: true }` as the third argument. A new rule gets the narrowed
  view by default; `tests/integration/template-fragments.test.ts` runs every fixer and suggester
  over glued templates, so add a new one there.

AST visitors: `JSXAttribute`, `CallExpression`, `TaggedTemplateExpression`, `VariableDeclarator`.

## Shared helpers (canonical homes for repeated patterns)

- **`utils/context.ts`** — `safeOptions(context)`, `safeSettings(context)`, `safeFilename(context)`
  absorb the "context field throws inside `createOnce`" oxlint quirk. Plus
  `createLazyOptions(context, compile)` for the memoized-options pattern that every rule with
  rule-specific options consumes (rules whose only option is `entryPoint` read it through
  `createLazyLoader` → `safeOptions` instead) —
  `const getX = createLazyOptions<Options, T>(context, (o) => compile(o))` — and
  `createLazySettings(context, compile)` for anything derived from settings (`rootFontSize` in
  `enforce-canonical` / `prefer-scale-token`). Both are per file; see "Per-file options and
  settings". Lives in `utils/`, not `types.ts` (which is import-type-only).
- **`utils/rule-docs.ts`** —
  `ruleDocs(name, { description, category, recommended, designSystem, formatterOverlap? })` is every
  rule's `meta.docs` (it adds the docs `url`). It is the single source of the rule list by category
  (root README), both recommended configs (package README: every rule, `"off"` when not recommended;
  `/setup`: only the recommended ones) — written between `<!-- generated:… -->` markers by
  `pnpm -C packages/docs generate` — and of the groups on `rules/index.md`.
  `tests/docs/docs-sync.test.ts` checks `designSystem` against what the rule does (declares
  `designSystemUnavailable` → `required`; reaches `createLazyLoader` → `optional`).
- **`utils/measure.ts`** — lengths against the scale: `measure` / `sameMeasure` / `isOnStep` /
  `formatStep` (`prefer-scale-token`: is this value EQUAL to a step or token?) and `closestOnScale`
  (`no-arbitrary-value`'s message: the exact match alone, else the nearest candidate below and above
  among the prefix's tokens and the two surrounding scale steps).
- **`utils/class-parser.ts`** — `splitImportant(utility) → { bare, position }` +
  `reattachImportant(bare, position) → string` are the canonical homes for the `!`
  strip-and-reattach invariant. Every rule that does class lookups MUST round-trip through them; the
  precompute cache (`cache.ts`) does the same on its inputs.
- **`utils/report.ts`** — `reportClassReplacements(context, loc, split, classes, offending, opts)`
  owns the "autofix-then-suggestions" dispatch. Rules build a `{ cls, replacement }[]` and call
  once. Default `opts.replacementKey = 'replacement'`; `enforce-canonical` passes `'canonical'` to
  match its message template.
- **`utils/fatal.ts`** — `safeGetDS(getDS, context, node)` (generic structurally typed so callers
  retain oxlint's strict `RuleContext`) catches plugin-fatal errors and reports
  `designSystemUnavailable`. `DS_UNAVAILABLE_MESSAGE` (keyed by the `DS_UNAVAILABLE_MESSAGE_ID`
  constant) is spread into each DS-dependent rule's `meta.messages`, and `reportFatalDsError`
  reports with that same ID, so the messageId can't drift between rule and reporter.
  `softGetDS(getDS)` is the quiet sibling: it returns the DS or `null`, swallowing the fatal instead
  of reporting it — the mechanism every DS-optional rule uses to fall back to its static path (so
  those rules never emit `designSystemUnavailable`).
- **`utils/allowlist.ts`** — `compileRegexList(patterns)` + `matchesAny(value, list)`, shared by the
  directional rules' `allowlist`, `no-conflicting-classes`' `allow` option, and (`compileRegexList`
  only) the extractor's `attributePatterns` / `variablePatterns` settings.

## Key Constraints

- **Lazy DS loading**: `context.settings` and `context.filename` throw in `createOnce()`.
  DS-dependent rules use `createLazyLoader(context)` which defers loading to the first visitor call.
  When the resolved entry-point changes between files (monorepo with mapping array), the loader
  picks up the new entry. There is no `lastLoadedPath` fallback — the loader always re-resolves from
  settings.
- **Options timing**: ALL options must be read lazily inside `check()` via `createLazyOptions` —
  they're null in `createOnce()`.
- **Per-file options and settings.** `createOnce` runs once per worker and its context then serves
  every file that worker lints, but options and settings belong to each file: `overrides` and nested
  `.oxlintrc.json` change options, nested configs change settings (`overrides` reject `settings`).
  Measured on oxlint 1.85: every file of one effective config gets the SAME `context.options` array
  object; `context.settings` is a FRESH object per file. So `createLazyOptions` memoizes by options
  identity (a `WeakMap`, steady state = one `===`), and `createLazySettings` / `getExtractorConfig`
  take the settings object as a per-file fast path plus a bounded memo by JSON content. **Never read
  `safeOptions` / `safeSettings` / `context.options` / `context.settings` into a closure variable in
  a rule** — the first file would win for the whole run (the old `_rem`). RuleTester can't catch it
  (it re-runs `createOnce` per case); `tests/integration/per-file-config.test.ts` bans direct reads
  in `src/rules/`, and `tests/e2e/per-file-config.test.ts` drives the real binary with `overrides`,
  nested configs and `extends` under `--threads=1`. The debug flag is re-evaluated per file too.
- **Entry point resolution** (v1, deterministic): rule option `entryPoint` (a string) >
  `settings.tailwindcss.entryPoint`. The settings value is either:
  - `string` — a single CSS path for the whole project, or
  - `EntryPointMapping[]` (`{ files: glob | glob[], use: path }[]`) — first matching glob wins,
    evaluated against the linted file's path relative to the linter CWD (`context.cwd` via
    `safeCwd`, falling back to `process.cwd()`); `use` paths resolve against that same base. The
    legacy `string[]` shape is removed; supplying it throws `DeprecatedEntryPointShapeError` with
    the migration snippet inline. If nothing resolves, `MissingEntryPointError` is thrown and the
    rule emits a `designSystemUnavailable` diagnostic.
- **Relative string `entryPoint` anchoring (#39)**: a relative **string** entry (rule option or
  settings string — NOT the mapping shape) is resolved by `resolveStringEntryPoint` in `loader.ts`,
  NOT against `process.cwd()`. oxlint doesn't expose the config path to plugins, so the loader walks
  up from the linted file to the nearest enclosing `.oxlintrc.json` (`nearestConfigDir`, early-exit,
  memoized in `nearestConfigDirCache`) — the config oxlint applies under nested discovery — and
  anchors there. Deterministic **two-step** `[nearest config dir → CWD]`: use the config-dir
  candidate if it exists on disk, else the CWD candidate, else resolve against the nearest config
  dir so the `Could not stat` error names the package-local path (fail-loud, never silently reach
  past the nearest config into an unrelated ancestor — that masked-typo non-determinism is exactly
  why the legacy `string[]` heuristic was removed). Absolute entries pass through `resolve()`
  untouched; mapping arrays stay CWD-relative. This makes editor (CWD = workspace root) and CLI (CWD
  = package) runs agree in Pattern-B monorepos. Limitation: under `oxlint -c <config>` /
  `--disable-nested-config` oxlint suppresses nested discovery but the plugin still walks the FS, so
  the nearest `.oxlintrc.json` may diverge from the config oxlint used — docs steer those setups to
  absolute paths.
- **Multi-DS cache**: `loader.ts` uses `dsCache: Map<string, { cache, mtime }>` to store multiple
  design systems simultaneously. Each unique resolved CSS gets its own entry. In monorepos with the
  mapping shape, distinct globs can map to distinct CSS files in the same lint run.
- **Configurable timeout**: `settings.tailwindcss.timeout` (number, default 60_000 ms in v1) governs
  the **precompute loader** (`sync-loader.ts`) only. The worker services (sort, canonicalize, and
  declaration, all on `DesignSystemWorker`) use a fixed 60 s init timeout and a 30 s per-request
  default that only the `OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT` env var can override (#145).
  They never read this setting: the request-timeout hint points at that env var, and the
  init-timeout hint names neither knob, since nothing configurable moves it.
- **Debug logging**: `settings.tailwindcss.debug: true` or `DEBUG=oxlint-tailwindcss` env var. Off
  by default — fatal errors always surface as rule diagnostics, not console output. The
  `file → entry point` line is printed once per file (module-level `lastLoggedFile` in `loader.ts`),
  not once per DS-dependent rule; there is no cache-hit log line. `/settings` lists the env vars and
  `tests/e2e/cache-dir.test.ts` holds what `/ci` promises about `OXLINT_TAILWINDCSS_CACHE_DIR`.
- **Fail-loud (v1)**: If the DS can't load, DS-dependent rules emit a single
  `designSystemUnavailable` diagnostic via the shared `safeGetDS` helper in `src/utils/fatal.ts`.
  There is no silent fallback; the exceptions are the 10 DS-optional rules listed under
  Architecture, which go through `softGetDS`, fall back to a deterministic static path, and never
  emit `designSystemUnavailable`. The dedicated error types — `MissingEntryPointError`,
  `DeprecatedEntryPointShapeError`, `DesignSystemLoadError`, `SortServiceError`,
  `UnsupportedEngineError` — all extend `OxlintTailwindError` and carry an optional `hint` field
  that renders alongside the message. `UnsupportedEngineError` (from the engine guard, #114) routes
  through the same `designSystemUnavailable` messageId, so no rule declares an engine-specific
  messageId (locked by `fatal-errors.test.ts`).
- **Engine version guard (#114, `design-system/engine-guard.ts`)**: after `resolveTailwindNodeFor`
  picks the consumer's engine, `guardEngine` — called once per entry point from
  `getLoadedDesignSystem`, INSIDE the `dsFailureCache` try so a fatal verdict is memoized by
  `(path, mtime)` like a load failure — grades
  `(E = resolved @tailwindcss/node version, B = consumer's tailwindcss version)` against the tested
  ceiling `TAILWIND_NODE_VERSION` and the supported floor `MIN_ENGINE = 4.1.15` (**4.0.x and
  4.1.0–4.1.14 lack `ds.canonicalizeCandidates`**, so v4.1.15 is the hard floor;
  `engine-smoke.mjs 4.1.14 --expect-fatal` in CI proves the guard, not a raw TypeError, rejects
  them). Insiders builds (`0.0.0-insiders.*`, `isInsidersVersion`) are ahead of the latest release,
  not v0: they warn (`engine-insiders`) and run, and an insiders `B` skips the drift checks.
  Verdicts: older than v4.1.15 → fatal always (the flag never rescues it); a future major (v5+) or a
  major-level build drift → fatal unless `settings.tailwindcss.allowUntestedEngine: true` downgrades
  it to a warn; any v4 engine newer than the tested ceiling (a patch bump counts; the verdict kind
  is still named `engine-newer-minor`) or a minor-level build drift → one-time stderr warning
  (patch-only build drift stays silent; deduped in `warnedEngineKeys`, reset via
  `resetEngineGuard`); in-range + aligned → silent. A fatal throws `UnsupportedEngineError`. The
  comparator is a hand-rolled semver subset (`parseVersion`/`compareVersions`) — no `semver` dep;
  `allowUntestedEngineFromSettings` reads the flag. `getLoadedDesignSystem` accepts an `engineInfo?`
  test seam to inject `(E, B)` without a second Tailwind install.
- **`!` (important) modifier**: Tailwind supports prefix (`!flex`) and suffix (`flex!`). ALL rules
  that do class lookups or transformations MUST round-trip through `splitImportant` +
  `reattachImportant` from `utils/class-parser.ts`. Cache methods (`getOrder`, `canonicalize`,
  `getCssProperties`, `getNamedEquivalent`) handle `!` internally. Hand-rolled regexes here are a
  smell — they were removed in v1 (the old `/^[a-z0-9[\]*@-]*:!/` in `enforce-canonical` was
  bracket-non-aware).
- **Tailwind v4 project prefix (`prefix(...)`, #29)**: when the entry point declares a prefix
  (`@import "tailwindcss" prefix(tw)`), `getClassList()` still returns names WITHOUT the prefix, but
  `candidatesToCss`/`getClassOrder`/`canonicalizeCandidates` only resolve the PREFIXED form
  (`tw:flex`) — and the prefix goes FIRST in the chain (`tw:hover:underline`, never
  `hover:tw:underline`). Invariant: the precompute applies the prefix ONLY when calling DS APIs and
  strips it back off before storing — every `PrecomputedData` structure stays prefix-free; the new
  scalar `PrecomputedData.prefix` is the single source of truth. `DesignSystemCache` holds `_prefix`
  and strips/re-applies it at the method boundary (`getOrder` strips it so variant synthesis isn't
  skewed; `canonicalize` already reconstructs it via `extractUtility`). `cache.isValid` stays
  TOLERANT (other rules — e.g. `prefer-theme-tokens` — call it with prefix-free candidates); the
  STRICT prefix check lives in `cache.classValidity` (`valid`/`missing-prefix`/`unknown`), used only
  by `no-unknown-classes`, which distinguishes Tailwind utilities (prefix required) from component
  classes (`componentSet`, prefix optional). `consistent-variant-order` and `enforce-sort-order`
  (strict) split the prefix off before reordering/grouping so it never moves out of first position.
  The sort/canonicalize services pass the full class to the DS unchanged, and the DS understands the
  prefix natively. The declaration-service worker is the exception: the host sends it prefix-free
  names, so it re-applies `ds.theme.prefix` before asking the DS and keys results prefix-free. All
  prefix-handling is gated on `_prefix !== ''`, so no-prefix projects are unaffected.
- **Disk cache (v1)**: `sync-loader.ts` caches precomputed DS JSON in a **per-user** dir
  `os.tmpdir()/oxlint-tailwindcss-<uid>/` (namespaced by uid, created `mode 0o700`), keyed **only**
  by content hash. Per-user + `0700` closes the shared-`/tmp` cache-poisoning vector (a predictably
  named, world-writable cache fed autofixes). mtime is tracked only in memory inside `loader.ts`,
  for the per-process fast path. There is no module-level cache key (#114):
  `SCRIPT_HASH = md5(PRECOMPUTE_SCRIPT).slice(0,8)` carries no version, and the engine version is
  folded in **per entry point** via `computeContentHash(content, engineVersion)` =
  `md5(${SCRIPT_HASH}:${engineVersion}:${content})`, where `engineVersion` comes from
  `engineCacheKey(resolveTailwindNodeFor(css))` — the resolved `@tailwindcss/node` version,
  tiebroken on `nodePath` when it reads `'unknown'`. The format is byte-identical for the common
  single-engine case (existing on-disk caches stay valid), and two monorepo packages with identical
  CSS but different engines never share (poison) a cache entry. `computeCacheKey(script, version)`
  is kept exported ONLY for the unit tests that pin the `${scriptHash}:${version}` shape. The
  content hash folds in everything the design system is built from besides the engine
  (`hashableContent`): the entry CSS, its locally-`@import`ed files (recursive to a small depth),
  local `@plugin`/`@config` files (resolved like Node, read as text — not what they `require`), and
  the installed `name@version` of every package the CSS imports or loads as `@plugin` (walked up
  through `node_modules`, read from `package.json`). The engine version says nothing about
  `tw-animate-css` or `@tailwindcss/typography`; before this, upgrading one or editing a local
  plugin kept serving the old class list, so removed classes stopped being reported (H19,
  `tests/e2e/cache-dir.test.ts`). Every read is schema-validated (`isPrecomputedData`): a corrupt,
  truncated, or poisoned file (or a `{}` that would otherwise crash `fromPrecomputed`) reads as a
  miss, is deleted under the lock, and recomputed — never wedges the loader. Content-based caching
  enables monorepo deduplication. The cache dir honours `OXLINT_TAILWINDCSS_CACHE_DIR`
  (`resolveCacheDir` in `sync-loader.ts`): when set to a non-empty value it replaces the per-uid
  default, letting CI/sandboxes pin the cache location and letting the test suite give each
  `pnpm test` invocation a private dir (see Tests). A dir the plugin creates is still `mode 0o700`;
  pointing it at a pre-existing world-writable dir re-opens the poisoning vector, so that's the
  caller's responsibility.
- **Cold-cache precompute coordination (#24)**: parallel oxlint isolates that all miss the cache for
  the same CSS would each spawn their own precompute worker. `computeWithLock` in `sync-loader.ts`
  gates it behind a `<contentHash>.lock` file (atomic `openSync(..., 'wx')`): the winner runs the
  worker (which writes the cache), the rest busy-wait via an Atomics sync-sleep for the
  `<contentHash>.json`. A lock older than `timeout + 30s` (a holder that died mid-compute) is
  reclaimed by **exclusive rename** (`reclaimStaleLock`), not unlink — two waiters both judging it
  stale would otherwise both `unlink`, and the second could delete a fresh lock a third isolate just
  created, re-spawning parallel precomputes. A non-writable cache dir degrades to an uncoordinated
  compute rather than spinning. `cacheArtifactPaths(cssPath)` exposes the json/lock paths for tests.
  **Failures are memoized per entry point (#24)**: `getLoadedDesignSystem`/`createLazyLoader` in
  `loader.ts` cache fatal failures in `dsFailureCache` (keyed by `resolvedPath`+`mtime`) plus a
  per-rule sticky `lastError`, so a load failure costs one attempt per entry point per process, not
  one per AST node × rule × file. `precomputeHint` classifies the cause: ENOMEM/EAGAIN →
  memory-pressure guidance, not the misleading "check CSS syntax / raise timeout".
- **CSS declaration extraction**: `DECL_EXTRACTOR_SOURCE` in `sync-loader.ts` (interpolated into
  PRECOMPUTE_SCRIPT, and into the `declaration-service` worker, so there is ONE extractor) walks the
  emitted CSS line by line with a block stack and emits `(scope, property, value)` per declaration
  plus, per interned value, the custom properties it reads (direct reads kept apart from `var()`
  fallbacks) and whether it is a pure `var()` forward. Scope is `element` / `::pseudo-element` /
  descendant, detected from the selector with a PAREN-AWARE combinator scan (`tw-animate-css` emits
  `&:where(:dir(ltr), …)`, and a naive space test would mislabel 92 rules as descendant). Descendant
  declarations are kept only for classes that style nothing else (`space-*`, `divide-*`); a class
  that styles both itself and its descendants (`prose`) advertises only its own box, and is flagged
  `partial` so it is never called redundant.
- **Modifier class detection**: Classes referenced via `[class~="..."]` attribute selectors in CSS
  output (e.g. `not-prose`) are added to `componentClasses` so `no-unknown-classes` recognizes them,
  interned in a `Set` (typography names `not-prose` from ~230 selectors).
- **`extractComponentClasses` reads SELECTORS ONLY** (`sync-loader.ts`). Everything it returns lands
  in `validitySet`, so a false entry there is a class the plugin silently accepts. It used to regex
  whole files, which harvested identifiers from Tailwind's own preflight comments (`mozilla`, `org`,
  `com`, `cgi`, `chromium`, `webkit`, `css` — all from URLs) and from declaration values
  (`padding: 0.5rem` → `5rem`). A selector is the text between the last `{`, `}` or `;` and the next
  `{`, so scanning only what precedes a `{` skips declaration bodies by construction; comments and
  strings are stepped over, and a CSS identifier start (never a digit) is the second line of defence
  for a decimal in an at-rule prelude. **Statement at-rules are the deliberate exception**: the
  class named by `@custom-variant sidebar-open (&:where(.sidebar-open *))` is load-bearing exactly
  the way `group`/`peer` are, so a prelude starting with `@` is scanned before its `;` discards it.
- **Named group/peer markers** (`cache.isMarkerClass`, issue #102): `group/menu-item` /
  `peer/menu-button` emit NO CSS — the CSS lives in the consumer, whose selector hard-codes the
  marker (`:is(:where(.group\/menu-item):hover *)`), so the marker is required markup and "does it
  compile?" is the wrong question. `no-unknown-classes` calls the predicate in its pre-pass and
  again **after** the `missing-prefix` branch (under a prefix the marker Tailwind wants IS
  `tw:group/menu-item`, so an unprefixed one is genuinely dead CSS and must stay reported). The
  predicate is derived — a precomputed class that is not a component-ONLY class and has ZERO
  declarations, which resolves to exactly `group` and `peer` on every fixture — so it self-prunes,
  self-extends, and excludes `@container/main` for free. Component-only, not `componentSet`: a
  `@custom-variant` whose selector names `.group` puts `group` in `componentSet` as well, and that
  must not unmake the marker (#165). Splits at the FIRST slash (`peer//x`, `group/a/b` are legal
  names); only the EMPTY name is rejected. **Do not seed named markers into `validClasses`**: the
  `/name` is user-chosen and unbounded, `ds.parseCandidate('peer/menu-button')` returns `[]`, and it
  would feed unbounded strings to the Levenshtein scan. Under a prefix an unprefixed marker reports
  `missingPrefix`, never a Levenshtein neighbour — for `peer//x` that neighbour is the bare `peer`,
  and the quick-fix would delete the name every consumer binds to.
- **Why a canonical rewrite isn't equivalent** (`CanonicalizeResult.reason`, R5): the worker
  compares the two classes' CSS; when only the SELECTOR differs it compiles both again in STOCK
  Tailwind (`env.loadStock()` in `makeWorkerScript`: `@import "tailwindcss"` from the same base,
  same engine, loaded lazily on the first such case). Equal there → `'variant'` (the project
  redefines the variant, e.g. shadcn's `data-disabled:`); different there too → `'selector'` (a
  spelling, `has-[[…]]:` vs `has-data-[…]:`); declarations differ → `'value'` (#78). Only
  `'variant'` is reported, and only with `enforce-canonical`'s `reportNonEquivalent`. The reason is
  persisted as the tuple's third element (`[canonical, safe, reason?]`); two-element entries still
  read.
- **Typo suggestions have a length-proportional budget** (`suggestionDistance` in
  `utils/levenshtein.ts`: `max(1, floor(len / 3))`, capped at 3), used for utilities and for both
  variant corrections (whole segment and dash tail). The distance is OSA — an adjacent swap costs 1
  — so `opne` → `open` survives a 1-edit budget. A flat cap of 3 offered `inline` for shadcn's
  CSS-less `line` marker and `w-0` for `w-[]`; don't widen the budget without re-running the bench.
- **The DS verdict ACCEPTS as well as refutes** (`no-unknown-classes`, issue #104). The rule asks
  `validateClassesSync` about every class the precompute doesn't know verbatim; that answer used to
  be read only as `compiles === false`, so `validity === 'unknown'` won even when Tailwind had just
  said the class compiles. It reclassifies now (`effectiveValidity`), and the heuristic is left with
  the one thing only it knows: telling `unknown` from `missing-prefix`. **The service is blind to
  the prefix by construction** — `declaration-service.ts` applies the project prefix before asking,
  so `compiles === true` always means "the PREFIXED form compiles". Acceptance is therefore split on
  a syntactic `prefixWritten` check, never on the verdict alone, or #29 comes straight back.
  `undefined` (markers, excluded from the batch) must never accept. The gate stays
  `validity === 'unknown'`: a component class under a prefix is already `'valid'` with no prefix
  written, and accepting on `compiles` alone would report it as needing one. Symmetrically,
  `missing-prefix` + `compiles === false` downgrades to `unknown` — `tw:bg-red-5000` is as dead as
  `bg-red-5000`, so the prefix is not the fix.
- **What `@utility` can and cannot enumerate** (#104): `--value(--brand-*)` (theme namespace) and
  `--value("a","b")` (literal set) produce `getClassList()` entries; an OPEN type (`integer`,
  `[length]`, …) produces NONE — not even the root. `ds.utilities.keys('functional')` is the only
  API that sees the root, and the plugin deliberately does not use it: of 316 functional roots only
  17 are missing from `knownPrefixes` and 16 are already recovered by existing passes, seeding would
  have to bypass `validClasses` (or `isKnownClass('foo')` starts accepting a valueless `foo`), and
  touching `PRECOMPUTE_SCRIPT` changes `SCRIPT_HASH` (folded into the content hash) and forces every
  consumer to recompute.
- **Off-scale percentages** (`cache.dynamicValuePrefix`, from the #104 audit): Tailwind enumerates
  21 of the 101 percentages it compiles, so `from-33%` is as real as `w-45`. `prefixSets()` derives,
  in the same lazy pass as `knownPrefixes`, the subset of prefixes with at least one enumerated `%`
  class (22 of ~1 800). Keep it narrow: `enforce-logical`/`enforce-physical` guard their replacement
  with `isValid` and nothing else, so accepting `<any known prefix>-N%` makes them rewrite `ml-33%`
  into the equally dead `ms-33%`. The slash branch of `isValid` stays numeric-only — neither
  `from-33%/50` nor `bg-black/50%` compiles.
- **`no-conflicting-classes` decides from the emitted CSS**
  (`rules/no-conflicting-classes/decide.ts`): a shared `(box, property)` is a conflict only when the
  declaration that LOSES the cascade carries something the winner does not reproduce — equal value
  ids never clash, the winner absorbing the loser is followed transitively through the group's
  surviving writer, a pure `var()` forwarder whose variables the group supplies carries nothing of
  its own, and a custom property reset to `initial`/`unset`/empty carries no information unless
  resetting is all the losing class does (`blur-none`, `via-none`, `drop-shadow-none` keep their
  reset; `animate-in` can lose its `--tw-enter-*` resets) — that last one is what covers the animate
  plugins, derived rather than whitelisted. The winner comes from `cache.getOrder`, and `!` beats
  it; an order synthesised from a prefix sibling counts as unknown, so the message never names a
  winner it cannot know. `spec.ts` holds ONLY what no CSS comparison can infer (prose variants,
  prose + max-w, prose + text/leading/tracking, space/divide + `*-reverse`, mask-composite), and
  `allow` is the user's escape hatch — do not grow `spec.ts` with third-party knowledge.
- **`canonicalizeCandidates()`**: Deduplicates results — must be called one class at a time, NOT in
  batch.
- **`getClassList()` gaps** (issue #37): some valid v4 classes never appear in `getClassList()`. The
  precompute reconciles three kinds, each validated through `candidatesToCss()` — the source of
  truth for "produces CSS" — so every addition self-prunes on a Tailwind version that doesn't emit
  it:
  1. **Dynamic numeric values** (`grow-1`, `border-1`, `underline-offset-3`): not seeded; recovered
     at lookup time by the prefix-and-number heuristic in `cache.isValid`/`getOrder` (falls back to
     prefix lookup). Arbitrary values handled by heuristic too.
  2. **Special-cased compiler utilities** absent from `getClassList()` AND the utility registry
     (`ds.utilities.keys('static')`): `@container-size`, `filter-none`, `backdrop-filter-none`,
     `max-w-screen`. A curated `staticExtras` seed in `sync-loader.ts` validates + pushes them to
     `validClasses` and captures their CSS (into `declCss`) so they get entries in `cssDeclarations`
     (so `@container @container-size` conflicts like `@container @container-normal`, not silently
     accepted).
  3. **Negative utilities** whose negative form `getClassList()` omits (`-col-N`, `-row-N`,
     `-hue-rotate-N`, `-backdrop-hue-rotate-N`): auto-discovered by probing `-<prefix>-1` for every
     known prefix; `candidatesToCss()` rejects non-negatable prefixes (`-p-1` → null), so only real
     negative-capable prefixes land in `validClasses` (→ `knownPrefixes` picks up `-col`, etc.). To
     re-audit after a Tailwind bump: `keys('static')`/`keys('functional')` (+ `getCompletions`
     `supportsNegative`) vs `getClassList()`, filter by `candidatesToCss != null && !cache.isValid`.
- **Legacy v3 spellings in the canonical map** (issues #16, #37): the precompute step in
  `sync-loader.ts` feeds a hardcoded seed list (v3 renames like `break-words` / `bg-gradient-to-*`,
  plus the v4-reordered position spellings `bg-left-top`→`bg-top-left` /
  `object-{left,right}-{top,bottom}`) plus dynamic `start-*`/`end-*` derived from existing
  `inset-{s,e}-*` utilities into `canonicalizeCandidates()` and adds the diffs to the canonical map.
  Legacy classes are also pushed into `validClasses` so `no-unknown-classes` doesn't flag them.
- **Floating point**: canonical class strings with rem/em/px values go through `roundRemValue()`
  (the precomputed `canonicalMap` in `cache.ts` and the canonicalize-service results).
  `prefer-scale-token` compares numerically instead, with its own epsilon-tolerant px arithmetic
  (`sameMeasure` / `isOnStep` / `formatStep`).
- **Variant reordering barriers**: `consistent-variant-order` pulls pseudo-elements innermost
  (closest to the utility), but also treats selector-changing variants — `*`, `**`, `[&>svg]`, `*:…`
  — as hard barriers: state variants never reorder across them, because `hover:[&>svg]`
  (`&:hover > svg`) and `[&>svg]:hover` (`& > svg:hover`) target different elements. The shared
  `changesTarget` / `isSelectorBarrier` / `isPseudoElementVariant` predicates live in
  `utils/class-parser.ts` (also consumed by `no-contradicting-variants`).
- **Hot path awareness**: Visitors run on every AST node. Compile regexes at module/createOnce
  level, not inside visitors. The entry-point glob matcher memoizes compiled `RegExp`s;
  `extractors.ts` walks AST expressions with an accumulator parameter
  (`extractFromExpression(node, out)`) instead of allocating intermediate arrays;
  `DesignSystemCache.findOrderByPrefix` consults a lazy `prefixOrderMap` (O(1)) instead of scanning
  `orderMap` linearly.
- **Multiline-safe class string rebuilding**: rules use `splitClassesWithSeparators` +
  `rebuildClassString` from `class-splitter.ts` to preserve `\n` + indent introduced by
  `enforce-consistent-line-wrapping`. The matrix test in
  `tests/integration/multiline-preservation.test.ts` locks behavior down per rule. Count-changing
  fixers (`no-duplicate-classes`, `enforce-shorthand`) pass a `sourceIndices` array to
  `rebuildClassString` so it recovers each output class's original separator (`pickSeparator`) and
  keeps the block's per-line grouping instead of reflowing to one class per line; the legacy
  no-mapping degrade branch survives as a fallback.
- **`enforce-consistent-line-wrapping` block convention (#109/#110/#111)**: `printWidth` measures
  the **longest individual line** of the class string (not the raw total — a multiline template's
  raw value includes every `\n`+indent, which made wrapping unsatisfiable). `classesPerLine` counts
  classes **per line**, not the flat total. Its `classesPerLine` autofix wraps into the **block
  convention** (leading `\n`, one-level-deeper interior indent, trailing `\n` + base indent) and is
  **non-destructive** (only over-budget lines are re-wrapped; conforming lines stay verbatim). The
  base indent is derived from the source line via `safeSourceCode(context)` (`utils/context.ts`) —
  the first rule to read `context.sourceCode`; `node.loc.start.column` is the backtick column, NOT
  the base indent. `no-unnecessary-whitespace` must preserve the block's indented closing backtick
  (`\n` + whitespace-only last line) or the two rules re-enter the #14 cycle.
- **Worker services lifecycle**: `sort-service.ts`, `canonicalize-service.ts` and
  `declaration-service.ts` are thin wrappers around `DesignSystemWorker<Req, Res>` (in
  `design-system/ds-worker.ts`). The class owns the SharedArrayBuffer + Atomics protocol and the
  lifecycle (`worker.unref()` so the process can exit). It keeps one warm worker per cssPath in an
  LRU pool (`workers` Map, capped at `MAX_WORKERS = 8`, #77): switching entry points reuses the warm
  worker, and past the cap only the least-recently-used one is terminated. HARD sticky errors
  (init/spawn/crash/DS-load) are kept per cssPath in `errors: Map<cssPath, SortServiceError>`, so a
  failure is never forgotten when another entry point is linted in between, and `ensure()` rethrows
  it without retrying. Per-request failures (timeout, oversized or non-JSON response) are SOFT
  sticky (#145): the worker is dropped and, after `MAX_CONSECUTIVE_REQUEST_FAILURES` (3), calls
  fast-fail for a `REQUEST_STICKY_BACKOFF_MS` (60 s) window before one retry is allowed; any success
  clears the count. Failures throw `SortServiceError` — no silent fallback to heuristic sort or
  precomputed canonicalize.
- **Suggestions API**: 12 rules provide `suggest` in `context.report()` for IDE quick-fixes (the 12
  with `hasSuggestions: true` in meta). All use `messageId: 'suggestReplace'`. The 9 rules that emit
  autofix-then-suggestions delegate the loop to `reportClassReplacements` in `utils/report.ts`.
- **Directional rules** (`enforce-logical` ↔ `enforce-physical`): both consume
  `createDirectionalMapper(context, { mappings, messageId })` from `enforce-logical.ts`. The mapping
  type is `AxisMapping { from, to, axis, exact? }` (`exact` for utilities whose value is the
  direction, such as `float-left` / `clear-left` / `text-left`, which must match whole);
  `enforce-physical` inverts via `invertAxisMappings()` and appends `LOGICAL_INSET_ALIASES`
  (`inset-s` / `inset-e` → `left` / `right`). The shared schema lives in `LOGICAL_PHYSICAL_SCHEMA`.
  `convertClass` strips a leading `-` before matching the mapping keys and re-prepends it on the
  replacement, so negative utilities convert too (`-ml-2` → `-ms-2`, `-left-4` → `-start-4`).
- **`defaultOptions`**: every rule with options declares `meta.defaultOptions`. Rules with
  `schema: []` (no options) deliberately do NOT declare it — oxlint's schema validator rejects `{}`
  against an empty schema. `consistent-variant-order` declares `defaultOptions: [{}]` (no `order`)
  so that leaving `order` undefined selects the built-in `CANONICAL_ORDER`.
- **Runtime deps**: only `@tailwindcss/node` and `tailwindcss`. No synckit, no external workers, and
  no `semver` — the engine guard's version comparator (`parseVersion`/`compareVersions` in
  `engine-guard.ts`) is a hand-rolled subset to keep the runtime dependency set at two.
- **Arbitrary→named overlap** (`enforce-canonical` ↔ `no-unnecessary-arbitrary-value` ↔
  `prefer-theme-tokens` ↔ `prefer-scale-token`): four rules can turn an arbitrary value into a named
  utility (`prefer-scale-token` suggestion-only, because its equivalence is numeric), each owning a
  distinct case so they don't double-fire on the same input. Coexistence matrix, including
  `prefer-scale-token`, locked down in `tests/integration/prefer-theme-tokens-coexistence.test.ts`.
- **`enforce-canonical` safe gate (#78, #156)**: `declsOf` in `CANONICALIZE_HANDLER` compares the
  FULL `candidatesToCss` output with only the class token that opens a selector neutralized (strings
  stepped over, at-rule preludes and declaration values untouched). Never go back to slicing
  `{`…`}`: under a variant the rule is wrapped in an at-rule, the escaped class name lands inside
  the slice, and every variant-prefixed rewrite reads as unsafe (#156). Classes whose VARIANT is
  arbitrary (`data-[open]:`, `min-[40rem]:`, via `variantHasArbitraryValue`) also go to the worker —
  the precomputed `canonicalMap` knows utilities only. Beware: Tailwind's DS is stateful here —
  `candidatesToCss` for a token can change after other `canonicalizeCandidates` calls (seen on
  shadcn's `rounded-sm`), so don't write tests that depend on call order.
- **`arbitraryEquivalents` precompute**: for each named utility, the precompute step enumerates
  every dash split point and emits one candidate per prefix (e.g. `bg-card-foreground` produces both
  `bg-[<value>]` and `bg-card-[<value>]`). Loop starts at `cls.indexOf('-', 1)` so negative
  utilities (`-translate-x-1`) keep their leading `-`. Tailwind's `candidatesToCss` is the source of
  truth.

## Tests

Two helpers in `tests/utils/with-fixture.ts` (typed via `Parameters<RuleTester['run']>` — no `any`
escape hatches):

- `runWithFixture(tester, name, rule, entryPoint, cases)` — wrapper around `RuleTester.run` that
  injects `settings.tailwindcss.entryPoint` into both `valid` and `invalid` arrays.
- `makeFixtureRunner(entryPoint)` — returns a one-shot `run(name, rule, cases)` bound to a fixture,
  useful when a test file has many small `new RuleTester().run(...)` blocks sharing the same DS.

Every DS-dependent rule test in v1 declares its `entryPoint` via one of these helpers — there is no
shared in-memory fallback the suite can rely on accidentally.

**e2e tests run the BUILT plugin** (`dist/index.cjs`) through the real oxlint binary.
`tests/e2e/helpers/dist.ts` (`assertFreshDist`) fails them loudly when `dist` is older than `src/`,
because a bare `pnpm test` (the Stop hook, an editor runner) never rebuilds — run `pnpm build`
first. `tests/docs/*` guard the markdown itself (e.g. `markdown-containers.test.ts`: VitePress `:::`
containers must survive oxfmt's `proseWrap`).

**Per-run isolation (concurrent `pnpm test` safety).** The disk cache is a single per-uid dir shared
by every process on the machine, so two `pnpm test` invocations overlapping (a background run + the
stop-hook's run, `--repeats`, or an editor running oxlint) used to race on the same cache files and
flake `canonicalize-persistence` (EISDIR / stale reads). `vitest.config.ts` (and
`vitest.bench.config.ts`) set `OXLINT_TAILWINDCSS_CACHE_DIR` to a per-invocation dir
(`oxlint-tw-{test,bench}-cache-<pid>-<ts>`) and forward it to workers via `test.env`, so each run's
cache is private; `tests/global-setup.ts` removes it at teardown. To avoid the private dir being
cold every run (the pre-warm would recompute all fixtures — ~3× slower), global-setup keeps a
persistent, test-only PRECOMPUTE seed dir and copies **only the fixed FIXTURES' `<hash>.json`** in
at setup / out at teardown (atomic rename, content-addressed). The scope is deliberate: the
cache-behaviour tests (`content-cache`, `precompute-worker`, `sync-loader`) drive unique-content
fixtures and assert hit/miss/invalidation, so seeding anything but the shared read-only fixtures
would leak state between runs and break them. Tests that write scratch files under the repo
(`.bench-tmp/*`, `fixtures/.worker-*`, `fixtures/.lock-coordination-*`, `e2e/tmp-*`) suffix the path
with `process.pid` for the same reason; other writers use `mkdtempSync(tmpdir())`. Note: running
**3+** full suites at once still fails, but from CPU oversubscription (worker-service 30 s
timeouts), not a shared-state race — that is expected, not a bug.
