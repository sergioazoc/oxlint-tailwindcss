---
name: write-rule
description: Patterns, conventions, and examples for implementing new oxlint Tailwind CSS rules and their tests. Use when creating, scaffolding, or understanding rule implementation.
argument-hint: '[rule-name]'
---

If a rule name is provided as `$ARGUMENTS`, scaffold the rule at `packages/oxlint-tailwindcss/src/rules/$ARGUMENTS.ts` and its test at `packages/oxlint-tailwindcss/tests/rules/$ARGUMENTS.test.ts`, then register it (see Registration). The helpers named here are documented in CLAUDE.md ("Shared helpers", "Key Constraints"); the reference files below are the patterns to copy — read the one that matches the rule's kind before writing.

## Pick the reference by rule kind

Every rule is `defineRule({ meta, createOnce })` from `@oxlint/plugins`, builds a `check(locations: ClassLocation[])` function, and returns `createExtractorVisitors(context, check)` from `../utils/extractors`. Don't hand-write the four visitors or pass `DEFAULT_EXTRACTOR_CONFIG`: that ignores the user's `settings.tailwindcss` extractor config. `context.settings`, `context.filename`, and options are unavailable in `createOnce()`, so read them lazily inside `check` through the helpers below.

| Kind | Copy | Key pieces |
|---|---|---|
| DS-dependent (needs the design system, fails loud) | `src/rules/no-unnecessary-arbitrary-value.ts` | `createLazyLoader(context)`; in `check`, `safeGetDS(getDS, context, locations[0].node)`, which reports `designSystemUnavailable` and returns null; `...DS_UNAVAILABLE_MESSAGE` in `meta.messages`; an `entryPoint` option in the schema with `defaultOptions: [{}]` |
| DS-optional (uses the DS when configured, static fallback otherwise) | `src/rules/no-deprecated-classes.ts` | `softGetDS(getDS)` plus a deterministic static path when it returns null; never declares `DS_UNAVAILABLE_MESSAGE` |
| No DS, with options | `src/rules/max-class-count.ts` | `createLazyOptions<Options, T>(context, compile)` from `../utils/context`; `meta.defaultOptions` (omit it when `schema: []`) |

## Fixes

Split with `splitClassesWithSeparators(loc.value)`, build `offending: { cls, replacement }[]` from `split.classes`, and pass it to `reportClassReplacements(context, loc, split, split.classes, offending, { messageId })` from `../utils/report`. It puts the autofix on the first offender and a `suggestReplace` suggestion on each later one, and rebuilds with `rebuildClassString`, which keeps the multiline wrapping `enforce-consistent-line-wrapping` introduces — rebuilding with `.join(' ')` would flatten it. Declare `fixable: 'code'`, `hasSuggestions: true`, and a `suggestReplace` message. Round-trip `!` through `splitImportant` / `reattachImportant`. Suggestion-only rules (`prefer-scale-token`, `no-unknown-classes`) report `suggest` by hand instead.

## Tests

Tests live in `packages/oxlint-tailwindcss/tests/rules/<rule-name>.test.ts`, use `RuleTester` from `oxlint/plugins-dev`, and give JSX cases `filename: 'test.tsx'`.

- DS-dependent: run every case through `runWithFixture(ruleTester, name, rule, ENTRY_POINT, cases)` or `makeFixtureRunner(ENTRY_POINT)` from `../utils/with-fixture`. They inject `settings.tailwindcss.entryPoint`; without it the rule reports `designSystemUnavailable`. A `beforeAll` that calls `resetDesignSystem()` + `getLoadedDesignSystem(ENTRY_POINT)` only warms the cache. Reference: `tests/rules/no-unnecessary-arbitrary-value.test.ts`.
- DS-optional: a plain `ruleTester.run` (no entryPoint) exercises the static fallback, and a `makeFixtureRunner` block exercises the DS path. Reference: `tests/rules/no-dark-without-light.test.ts`.
- Options only: a plain `ruleTester.run`. Reference: `tests/rules/max-class-count.test.ts`.
- A fixer also gets its row in `tests/integration/multiline-preservation.test.ts`.

Fixtures live in `tests/fixtures/` (`default.css` is the usual entry point). Run one file with `pnpm -C packages/oxlint-tailwindcss exec vitest run tests/rules/<rule-name>.test.ts`.

## Registration

A new rule is wired in at:

1. `packages/oxlint-tailwindcss/src/index.ts` — the import and the `rules` map entry (the docs generator reads this registry).
2. `packages/docs/rules/_extras/<rule>.md` and `packages/docs/es/rules/_extras/<rule>.md`, then `pnpm -C packages/docs generate`.
3. The hand-written rule lists and rule counts: `packages/docs/rules/index.md`, `packages/docs/es/rules/index.md`, `packages/docs/index.md`, `packages/docs/es/index.md`, `README.md`, `packages/oxlint-tailwindcss/README.md`.
4. CLAUDE.md's rule count and rule lists (DS-dependent / DS-optional users, suggestion and `reportClassReplacements` counts) when the new rule changes them.
5. A `packages/oxlint-tailwindcss/CHANGELOG.md` entry.
