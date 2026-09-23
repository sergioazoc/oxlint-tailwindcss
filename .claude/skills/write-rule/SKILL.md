---
name: write-rule
description: Patterns, conventions, and examples for implementing new oxlint Tailwind CSS rules and their tests. Use when creating, scaffolding, or understanding rule implementation.
argument-hint: '[rule-name]'
---

If a rule name is provided as `$ARGUMENTS`, scaffold the rule at `packages/oxlint-tailwindcss/src/rules/$ARGUMENTS.ts` (exported under the camelCase name, e.g. `noDemoThing`) and its test at `packages/oxlint-tailwindcss/tests/rules/$ARGUMENTS.test.ts`, then register it (see Registration). Paths in the table and under Tests are relative to `packages/oxlint-tailwindcss/`. The helpers named here are documented in CLAUDE.md ("Shared helpers", "Key Constraints"); the reference files below are the patterns to copy — read the one that matches the rule's kind before writing.

## Pick the reference by rule kind

Every rule is `defineRule({ meta, createOnce })` from `@oxlint/plugins`, builds a `check(locations: ClassLocation[])` function, and returns `createExtractorVisitors(context, check)` from `../utils/extractors`. Don't hand-write the four visitors or pass `DEFAULT_EXTRACTOR_CONFIG`: that ignores the user's `settings.tailwindcss` extractor config. `context.settings`, `context.filename`, and options are unavailable in `createOnce()`, so read them lazily inside `check` through the helpers below.

| Kind | Copy | Key pieces |
|---|---|---|
| DS-dependent (needs the design system, fails loud) | `src/rules/no-unnecessary-arbitrary-value.ts` | `createLazyLoader(context)`; in `check`, `if (locations.length === 0) return` (the visitors call `check([])` on every node), then `safeGetDS(getDS, context, locations[0].node)`, which reports `designSystemUnavailable` and returns null; `...DS_UNAVAILABLE_MESSAGE` in `meta.messages`; an `entryPoint` option in the schema with `defaultOptions: [{}]` |
| DS-optional (uses the DS when configured, static fallback otherwise) | `src/rules/no-deprecated-classes.ts` | `softGetDS(getDS)` plus a deterministic static path when it returns null; never declares `DS_UNAVAILABLE_MESSAGE` (`tests/integration/fatal-errors.test.ts` locks this posture) |
| No DS, with options | `src/rules/max-class-count.ts` | `createLazyOptions<Options, T>(context, compile)` from `../utils/context`; `meta.defaultOptions` (omit it when `schema: []`) |

## Fixes

Rewrite the utility, not the whole class: `splitUtilityAndVariant` separates the variant chain (the project prefix included) and `splitImportant` / `reattachImportant` round-trip `!` — the DS-dependent reference shows the sequence. Split the class string with `splitClassesWithSeparators(loc.value)`, build `offending: { cls, replacement }[]` from `split.classes`, and pass it to `reportClassReplacements(context, loc, split, split.classes, offending, { messageId })` from `../utils/report`. It puts the autofix on the first offender and a `suggestReplace` suggestion on each later one, and rebuilds with `rebuildClassString`, which keeps the multiline wrapping `enforce-consistent-line-wrapping` introduces — rebuilding with `.join(' ')` would flatten it. Declare `fixable: 'code'`, `hasSuggestions: true`, and a `suggestReplace` message. When a replacement comes from a name table and must exist in the project's design system, guard it with `makeReplacementGuard(cache)` from `../utils/replacement`, as `no-deprecated-classes` does. Suggestion-only rules (`prefer-scale-token`, `no-unknown-classes`) report `suggest` by hand instead.

## Tests

Tests live in `tests/rules/<rule-name>.test.ts`, use `RuleTester` from `oxlint/plugins-dev`, and give JSX cases `filename: 'test.tsx'`.

- DS-dependent: run every case through `runWithFixture(ruleTester, name, rule, ENTRY_POINT, cases)` or `makeFixtureRunner(ENTRY_POINT)` from `../utils/with-fixture`. They inject `settings.tailwindcss.entryPoint`; without it the rule reports `designSystemUnavailable`. A `beforeAll` that calls `resetDesignSystem()` + `getLoadedDesignSystem(ENTRY_POINT)` only warms the cache. Reference: `tests/rules/no-unnecessary-arbitrary-value.test.ts` (it also shows how to assert the `suggestReplace` suggestions).
- DS-optional: a plain `ruleTester.run` (no entryPoint) exercises the static fallback, and a `makeFixtureRunner` block exercises the DS path. Reference: `tests/rules/no-dark-without-light.test.ts`.
- Options only: a plain `ruleTester.run`, with `options: [{ … }]` on the cases that override the default. Reference: `tests/rules/max-class-count.test.ts`.
- When an expected error passes `data`, include every placeholder its message uses: the RuleTester hydrates the message from `data` and fails on a partial one.
- A fixer also gets its row in `tests/integration/multiline-preservation.test.ts`.

Fixtures live in `tests/fixtures/` (`default.css` is the usual entry point). Run one file with `pnpm -C packages/oxlint-tailwindcss exec vitest run tests/rules/<rule-name>.test.ts`.

## Registration

A new rule is wired in at:

1. `packages/oxlint-tailwindcss/src/index.ts` — the import and the `rules` map entry (the key is the public rule name). The docs generator reads this registry from the built `dist/index.cjs`, so run `pnpm build` before step 2.
2. `packages/docs/rules/_extras/<rule>.md` and `packages/docs/es/rules/_extras/<rule>.md`, then `pnpm -C packages/docs generate` (it does not build first; `pnpm -C packages/docs build` does both). The rule pages themselves are generated — don't hand-write `rules/<rule>.md`.
3. The hand-written rule lists and rule counts: `packages/docs/rules/index.md`, `packages/docs/es/rules/index.md`, `packages/docs/index.md`, `packages/docs/es/index.md`, `README.md`, `packages/oxlint-tailwindcss/README.md`.
4. CLAUDE.md's rule count and rule lists (DS-dependent / DS-optional users, suggestion and `reportClassReplacements` counts) when the new rule changes them.
5. A `packages/oxlint-tailwindcss/CHANGELOG.md` entry.
6. If the rule needed a pattern this skill or CLAUDE.md doesn't describe, update them in the same PR.
