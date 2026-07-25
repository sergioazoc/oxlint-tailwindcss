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
pnpm install          # install all workspaces (requires pnpm ≥ 11.4.0)
pnpm build            # build the plugin (delegates to packages/oxlint-tailwindcss)
pnpm test             # run plugin test suite (vitest run, excluding benchmarks)
pnpm test:watch       # watch mode
pnpm lint             # oxlint over the whole monorepo (root config)
pnpm format           # oxfmt --write over the whole monorepo
pnpm format:check     # oxfmt --check (verify only, no write)
pnpm typecheck        # tsc --noEmit
pnpm -C packages/docs dev   # local docs site
```

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
> conflict-resolving merge commit. This is exactly what happened around v1.3.1 (issue #39 work) and
> cost a detour. Keep `release` clean and the one-liner keeps working.

## Architecture

oxlint plugin with 23 Tailwind CSS v4 linting rules. Uses `@oxlint/plugins`' `createOnce` API (runs
once per lint session; returned visitors run on every matching AST node).

**v1.0.0 philosophy — deterministic, explicit, fail-loud.** The plugin used to auto-detect the CSS
entry point, fall back to a module-level `lastLoadedPath`, and silently skip rules when the design
system could not be loaded. v1.0.0 removed all of that: `settings.tailwindcss.entryPoint` is
mandatory; failures surface as a fatal `designSystemUnavailable` diagnostic; mtime is in-memory only
(content hash is the disk-cache key). The trade-off — one extra config line for every project, in
exchange for "configure once, never fails" — was an intentional alignment with
prettier-plugin-tailwindcss / oxfmt / better-tailwindcss.

Core sync/async bridge: `@tailwindcss/node`'s `__unstable__loadDesignSystem` is async, but
`createOnce` is sync. Two strategies:

1. **Precompute** (`sync-loader.ts`): a **worker_thread** (`runPrecomputeViaWorker`) pre-computes
   validity, canonical forms, CSS props, etc. and writes the JSON straight to the disk cache; the
   main thread blocks on `Atomics.wait` for a SharedArrayBuffer ready signal, then reads the file
   back. Runs ONCE per unique CSS entry point, cached on disk by content hash (single-level cache in
   v1). Throws `DesignSystemLoadError` on any failure — never returns null. Content-based caching
   allows monorepo packages with identical CSS to share a single cache entry. Across parallel oxlint
   isolates a content-hash-scoped file lock (`computeWithLock`) serializes the cold-cache compute —
   only one worker runs per hash, the rest busy-wait (Atomics) for the cache file. **v1.0.1 (#24):
   precompute moved off `execFileSync` to a worker_thread.** `execFileSync` `fork()`s the oxlint
   host (Rust + embedded Node); under Linux overcommit accounting on memory-constrained CI runners
   (GitHub `ubuntu-latest`), forking a large-RSS process is rejected with `spawnSync … ENOMEM` even
   though the child immediately `exec`s. A worker_thread creates a thread in-process — no
   address-space duplication — so it is immune. The disk cache is the worker→main payload channel
   (the 4 MB SharedArrayBuffer in `ds-worker.ts` is too small for the multi-MB precompute JSON),
   written atomically (tmp + `renameSync`).
2. **Worker services** (`sort-service.ts`, `canonicalize-service.ts`, `declaration-service.ts`): all
   three wrap the shared `DesignSystemWorker<Req, Res>` class in `design-system/ds-worker.ts`. The
   class owns the SharedArrayBuffer layout, the Atomics protocol, worker lifecycle
   (`worker.unref()`, error handler), and the sticky `lastError`. The worker script itself is built
   by the shared `makeWorkerScript(handlerExpr)` factory (also in `ds-worker.ts`) — each service
   passes only its handler expression (`ds.getClassOrder` vs `ds.canonicalizeCandidates`); the
   factory owns the buffer offsets, DS load (with error-cause propagation), ready signal, and
   request loop, so the two services no longer duplicate the protocol. Both load the DS once and
   accept sync requests with fixed 60 s init / 30 s per-request timeouts (NOT governed by
   `settings.tailwindcss.timeout`, which only affects the precompute loader). Failures throw
   `SortServiceError`; the rule layer catches via `safeGetDS` and reports `designSystemUnavailable`.
   `canonicalize-service` adds a process-wide per-class cache keyed by
   `${cssPath}\0${rem}\0${class}`, rounding rem/em/px floats (`roundRemValue`) before storing so the
   worker path matches the precomputed map.
3. **`@tailwindcss/node` path/version** lives in `design-system/tailwind-node.ts` as
   `TAILWIND_NODE_PATH` and `TAILWIND_NODE_VERSION`, resolved once at module load. `sync-loader`,
   `sort-service`, and `canonicalize-service` all consume those constants — no per-call
   `require.resolve` dance.

DS-dependent rules: `no-unknown-classes`, `no-conflicting-classes`, `enforce-canonical`,
`enforce-sort-order`, `no-unnecessary-arbitrary-value`, `prefer-theme-tokens`.
`consistent-variant-order` and `no-contradicting-variants` are the DS-optional rules: their static
fallbacks (variant order, and the pseudo-element/barrier name lists) are themselves deterministic,
so a missing entryPoint is tolerated silently in both — neither may ever emit
`designSystemUnavailable`. `no-deprecated-classes` is DS-independent outright (guard removed in
#69): it consults only the hardcoded `DEPRECATED_MAP`, so it never loads the design system and never
emits `designSystemUnavailable`.

## Extraction System

`extractors.ts` is the shared class-detection layer used by all rules. Every rule delegates to
`createExtractorVisitors(context, check)` which generates the 4 standard AST visitors and resolves
the extractor config lazily from `settings.tailwindcss`.

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
- `exclude: { attributes?, callees?, tags?, variablePatterns? }` — remove specific items from
  defaults. For `variablePatterns`, exclusions match against `RegExp.source`.

Config is resolved lazily by `getExtractorConfig(context)` on first visitor call. **v1 cache:
per-context `WeakMap`** — module-level state is gone. Two parallel rule contexts no longer race on a
global. `resetExtractorConfig(context?)` survives for test isolation but is now mostly a no-op (the
WeakMap drops entries automatically when the context goes out of scope).

**Deep extraction**: `cva()` understands `variants`, `compoundVariants`, ignores `defaultVariants`.
`tv()` understands `base`, `slots`, `variants` (with slot sub-objects), `compoundVariants`,
`compoundSlots`. `classed()` (tw-classed) skips first arg (element type), then extracts class
strings and cva-like config from remaining args.

- **JSX object values**: `classNames={{ root: "flex", label: "text-sm" }}` extracts string values
  from the object (not keys). This is distinct from call-expression objects like
  `cn({ "bg-red-500": cond })` which extract keys.
- **Expressions**: ternaries (`cond ? "a" : "b"`), logical (`flag && "a"`), object keys
  (`cn({ "bg-red-500": cond })`), arrays (`cn(['a', 'b'])`, `tv({ base: ['a', 'b'] })` — the
  idiomatic multi-line form; `extractFromExpression` recurses into elements, skipping holes and
  spreads), template literals with leading/trailing space preservation across expressions.

AST visitors: `JSXAttribute`, `CallExpression`, `TaggedTemplateExpression`, `VariableDeclarator`.

## Shared helpers (canonical homes for repeated patterns)

- **`utils/context.ts`** — `safeOptions(context)`, `safeSettings(context)`, `safeFilename(context)`
  absorb the "context field throws inside `createOnce`" oxlint quirk. Plus
  `createLazyOptions(context, compile)` for the lazy-init memoized-options pattern that every rule
  with options consumes — `const getX = createLazyOptions<Options, T>(context, (o) => compile(o))`.
  Lives in `utils/`, not `types.ts` (which is import-type-only).
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
  `designSystemUnavailable`. Constants `DS_UNAVAILABLE_MESSAGE_ID` + `DS_UNAVAILABLE_MESSAGE` are
  spread into each rule's `meta.messages` so the messageId can't drift between rule and reporter.
- **`utils/allowlist.ts`** — `compileRegexList(patterns)` + `matchesAny(value, list)`, shared
  between the directional rules.

## Key Constraints

- **Lazy DS loading**: `context.settings` and `context.filename` throw in `createOnce()`.
  DS-dependent rules use `createLazyLoader(context)` which defers loading to the first visitor call.
  When the resolved entry-point changes between files (monorepo with mapping array), the loader
  picks up the new entry. There is no `lastLoadedPath` fallback — the loader always re-resolves from
  settings.
- **Options timing**: ALL options must be read lazily inside `check()` via `safeOptions()` (or
  `createLazyOptions` for memoized compiled options) — they're null in `createOnce()`.
- **Entry point resolution** (v1, deterministic): rule option `entryPoint` (a string) >
  `settings.tailwindcss.entryPoint`. The settings value is either:
  - `string` — a single CSS path for the whole project, or
  - `EntryPointMapping[]` (`{ files: glob | glob[], use: path }[]`) — first matching glob wins,
    evaluated against the linted file's path relative to `process.cwd()`. The legacy `string[]`
    shape is removed; supplying it throws `DeprecatedEntryPointShapeError` with the migration
    snippet inline. If nothing resolves, `MissingEntryPointError` is thrown and the rule emits a
    `designSystemUnavailable` diagnostic.
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
  the **precompute loader** (`sync-loader.ts`) only. The sort/canonicalize worker services use fixed
  60 s init / 30 s per-request timeouts and do NOT read this setting — their error hints say so
  rather than pointing users at a knob that won't move them.
- **Debug logging**: `settings.tailwindcss.debug: true` or `DEBUG=oxlint-tailwindcss` env var. Off
  by default — fatal errors always surface as rule diagnostics, not console output.
- **Fail-loud (v1)**: If the DS can't load, DS-dependent rules emit a single
  `designSystemUnavailable` diagnostic via the shared `safeGetDS` helper in `src/utils/fatal.ts`.
  There is no silent fallback. The dedicated error types — `MissingEntryPointError`,
  `DeprecatedEntryPointShapeError`, `DesignSystemLoadError`, `SortServiceError` — all extend
  `OxlintTailwindError` and carry an optional `hint` field that renders alongside the message. The
  one legitimate exception is `consistent-variant-order`, whose static fallback is itself
  deterministic and can stand in for the DS.
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
  Worker services need no changes — they pass the full class to the DS, which understands the prefix
  natively. All prefix-handling is gated on `_prefix !== ''`, so no-prefix projects are unaffected.
- **Disk cache (v1)**: `sync-loader.ts` caches precomputed DS JSON in a **per-user** dir
  `os.tmpdir()/oxlint-tailwindcss-<uid>/` (namespaced by uid, created `mode 0o700`), keyed **only**
  by content hash. Per-user + `0700` closes the shared-`/tmp` cache-poisoning vector (a predictably
  named, world-writable cache fed autofixes). The legacy two-level mtime-index + content-cache
  scheme is gone; mtime is tracked in memory inside `loader.ts` for the per-process fast path.
  `CACHE_KEY` (computed once at module load) is
  `${md5(PRECOMPUTE_SCRIPT).slice(0,8)}:${tailwindVersion}`. The content hash folds in the entry CSS
  **and its locally-`@import`ed files** (`hashableContent`, recursive to a small depth), so editing
  an imported `@theme`/component file invalidates the cache — not just editing the entry. Every read
  is schema-validated (`isPrecomputedData`): a corrupt, truncated, or poisoned file (or a `{}` that
  would otherwise crash `fromPrecomputed`) reads as a miss, is deleted under the lock, and
  recomputed — never wedges the loader. Content-based caching enables monorepo deduplication.
- **Cold-cache precompute coordination (#24)**: parallel oxlint isolates that all miss the cache for
  the same CSS would each spawn their own precompute worker. `computeWithLock` in `sync-loader.ts`
  gates it behind a `<contentHash>.lock` file (atomic `openSync(..., 'wx')`): the winner runs the
  worker (which writes the cache), the rest busy-wait via an Atomics sync-sleep for the
  `<contentHash>.json`. A lock older than `timeout + 30s` (a holder that died mid-compute) is
  reclaimed by **exclusive rename** (`reclaimStaleLock`), not unlink — two waiters both judging it
  stale would otherwise both `unlink`, and the second could delete a fresh lock a third isolate just
  created, re-spawning parallel precomputes. A non-writable cache dir degrades to an uncoordinated
  compute rather than spinning. `cacheArtifactPaths(cssPath)` exposes the json/lock paths for tests.
  **The original #24 ENOMEM had two parts**: (1) the fork itself — fixed by moving to a
  worker*thread (see Precompute above); (2) **amplification** —
  `getLoadedDesignSystem`/`createLazyLoader` in `loader.ts` only cached \_successes*, so a single
  load failure was re-attempted on every AST node × rule × file (~18k re-spawns, 21k per-class
  errors on the birdman CI). v1.0.1 adds `dsFailureCache` (keyed by `resolvedPath`+`mtime`, fatal
  errors only) plus a per-rule sticky `lastError`, collapsing a failure to one attempt per entry
  point per process. Hint is now cause-classified (`precomputeHint`): ENOMEM/EAGAIN →
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
  output (e.g. `not-prose`) are added to `componentClasses` so `no-unknown-classes` recognizes them.
- **`no-conflicting-classes` decides from the emitted CSS**
  (`rules/no-conflicting-classes/decide.ts`): a shared `(box, property)` is a conflict only when the
  declaration that LOSES the cascade carries something the winner does not reproduce — equal value
  ids never clash, the winner absorbing the loser is followed transitively through the group's
  surviving writer, a pure `var()` forwarder whose variables the group supplies carries nothing of
  its own, and a custom property reset to `initial` carries no information (that last one is what
  covers the animate plugins, derived rather than whitelisted). The winner comes from
  `cache.getOrder`, and `!` beats it; an order synthesised from a prefix sibling counts as unknown,
  so the message never names a winner it cannot know. `spec.ts` holds ONLY what no CSS comparison
  can infer (prose variants, prose + max-w, mask-composite), and `allow` is the user's escape hatch
  — do not grow `spec.ts` with third-party knowledge.
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
     `validClasses` and captures their CSS so they get `cssProps` (so `@container @container-size`
     conflicts like `@container @container-normal`, not silently accepted).
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
- **Floating point**: All rem/em/px operations go through `roundRemValue()`.
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
  `tests/integration/multiline-preservation.test.ts` locks behavior down per rule.
- **Worker services lifecycle**: `sort-service.ts` and `canonicalize-service.ts` are thin wrappers
  around `DesignSystemWorker<Req, Res>` (in `design-system/ds-worker.ts`). The class owns the
  SharedArrayBuffer + Atomics protocol, lifecycle (`worker.unref()` so the process can exit), and a
  sticky `lastError`. The sticky error is keyed by `lastErrorCssPath` (not `ready?.cssPath`): every
  failure path leaves `ready === null`, so the old guard never matched and the next call re-paid the
  full init — tracking the path makes it genuinely sticky. On entry-point change it cleans up and
  re-inits. Failures throw `SortServiceError` — no silent fallback to heuristic sort or precomputed
  canonicalize.
- **Suggestions API**: 11 rules provide `suggest` in `context.report()` for IDE quick-fixes. All use
  `messageId: 'suggestReplace'` with `hasSuggestions: true` in meta. The 9 rules that emit
  autofix-then-suggestions delegate the loop to `reportClassReplacements` in `utils/report.ts`.
- **Directional rules** (`enforce-logical` ↔ `enforce-physical`): both consume
  `createDirectionalMapper(context, { mappings, messageId })` from `enforce-logical.ts`. The mapping
  type is `AxisMapping { from, to, axis }`; `enforce-physical` inverts via `invertAxisMappings()`.
  The shared schema lives in `LOGICAL_PHYSICAL_SCHEMA`. `convertClass` strips a leading `-` before
  matching the mapping keys and re-prepends it on the replacement, so negative utilities convert too
  (`-ml-2` → `-ms-2`, `-left-4` → `-start-4`).
- **`defaultOptions`**: every rule with options declares `meta.defaultOptions`. Rules with
  `schema: []` (no options) deliberately do NOT declare it — oxlint's schema validator rejects `{}`
  against an empty schema. `consistent-variant-order` declares `defaultOptions: [{}]` (no `order`)
  so that leaving `order` undefined still triggers the DS-vs-static fallback detection.
- **Runtime deps**: only `@tailwindcss/node` and `tailwindcss`. No synckit, no external workers.
- **Arbitrary→named overlap** (`enforce-canonical` ↔ `no-unnecessary-arbitrary-value` ↔
  `prefer-theme-tokens`): three rules can transform an arbitrary value into a named utility, each
  owning a distinct case so they don't double-fire on the same input. Coexistence matrix locked down
  in `tests/integration/prefer-theme-tokens-coexistence.test.ts`.
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
