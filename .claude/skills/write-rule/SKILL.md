---
name: write-rule
description: Patterns, conventions, and examples for implementing new oxlint Tailwind CSS rules and their tests. Use when creating, scaffolding, or understanding rule implementation.
argument-hint: '[rule-name]'
---

If a rule name is provided as `$ARGUMENTS`, scaffold the rule at `packages/oxlint-tailwindcss/src/rules/$ARGUMENTS.ts` (exported under the camelCase name, e.g. `noDemoThing`) and its test at `packages/oxlint-tailwindcss/tests/rules/$ARGUMENTS.test.ts`, then register it (see Registration). Paths in the table and under Tests are relative to `packages/oxlint-tailwindcss/`. The helpers named here are documented in CLAUDE.md ("Shared helpers", "Key Constraints"); the reference files below are the patterns to copy — read the one that matches the rule's kind before writing.

## Pick the reference by rule kind

Every rule is `defineRule({ meta, createOnce })` from `@oxlint/plugins`, builds a `check(locations: ClassLocation[])` function, and returns `createExtractorVisitors(context, check)` from `../utils/extractors`. Don't hand-write the four visitors or pass `DEFAULT_EXTRACTOR_CONFIG`: that ignores the user's `settings.tailwindcss` extractor config. The one exception is a rule that compares an element's whole class list rather than each class string (`no-borrowed-component-styles`): it keeps `Program` from `createExtractorVisitors` (the settings check) and adds its own `JSXAttribute` visitor that calls `extractFromJSXAttribute` / `extractFromCallExpression` with `getExtractorConfig(context)`. `context.settings`, `context.filename`, and options are unavailable in `createOnce()`, so read them lazily inside `check` through the helpers below. A rule that touches the design system starts `check` with `if (locations.length === 0) return`: the visitors call `check([])` on every node, and without the guard an empty call triggers a DS load (and `locations[0]` throws). Both DS kinds declare `entryPoint: { type: 'string' }` in their schema next to their own options, because `createLazyLoader` reads the rule-level `entryPoint`.

| Kind | Copy | Key pieces |
|---|---|---|
| DS-dependent (needs the design system, fails loud) | `src/rules/no-unnecessary-arbitrary-value.ts` | `createLazyLoader(context)`; in `check`, `safeGetDS(getDS, context, locations[0].node)`, which reports `designSystemUnavailable` and returns null; `...DS_UNAVAILABLE_MESSAGE` in `meta.messages`; `defaultOptions: [{}]` when `entryPoint` is the only option |
| DS-optional (uses the DS when configured, static fallback otherwise) | `src/rules/no-deprecated-classes.ts` | `softGetDS(getDS)` plus a deterministic static path when it returns null. `softGetDS` only guards the load: a later worker-service call (declarations, sort, canonicalize) can still throw, so wrap it in `catch (e) { if (!isFatalError(e)) throw e; /* static path */ }` as `no-dark-without-light` does. Never declares `DS_UNAVAILABLE_MESSAGE` |
| No DS, with options | `src/rules/max-class-count.ts` | `createLazyOptions<Options, T>(context, compile)` from `../utils/context`; `meta.defaultOptions` (omit it when `schema: []`) |

## Fixes

`src/utils/class-parser.ts` is the home for class parsing (`splitUtilityAndVariant`, `extractVariants`, `stripProjectPrefix`, `splitImportant` / `reattachImportant`); don't split on `:` by hand, since brackets and parentheses can contain it. A rule that reads the variant chain strips the project prefix first (it comes first in the chain); a DS-optional rule gets it with `softGetDS(getDS)?.cache.prefix ?? ''`, as `enforce-consistent-line-wrapping` does, and `tests/fixtures/with-prefix.css` exercises it.

Rewrite the utility, not the whole class: `splitUtilityAndVariant` separates the variant chain (the project prefix included) and `splitImportant` / `reattachImportant` round-trip `!` — the DS-dependent reference shows the sequence. Split the class string with `splitClassesWithSeparators(loc.value)`, build `offending: { cls, replacement }[]` from `split.classes`, and pass it to `reportClassReplacements(context, loc, split, split.classes, offending, { messageId })` from `../utils/report`. It reports `data: { className, replacement }` (rename the second key with `replacementKey`, as `enforce-canonical` does), so the messages use those placeholders. It puts the autofix on the first offender and a `suggestReplace` suggestion on each later one, and rebuilds with `rebuildClassString`, which keeps the multiline wrapping `enforce-consistent-line-wrapping` introduces — rebuilding with `.join(' ')` would flatten it. Declare `fixable: 'code'`, `hasSuggestions: true`, and a `suggestReplace` message. When a replacement comes from a name table and must exist in the project's design system, guard it with `makeReplacementGuard(cache)` from `../utils/replacement`, as `no-deprecated-classes` does: pass it the rebuilt class (variant and `!` included). It wraps the tolerant `cache.isValid`. Suggestion-only rules (`prefer-scale-token`, `no-unknown-classes`) report `suggest` by hand instead.

## Tests

Tests live in `tests/rules/<rule-name>.test.ts`, use `RuleTester` from `oxlint/plugins-dev`, and give JSX cases `filename: 'test.tsx'`.

- DS-dependent: run every case through `runWithFixture(ruleTester, name, rule, ENTRY_POINT, cases)` or `makeFixtureRunner(ENTRY_POINT)` from `../utils/with-fixture`. They inject `settings.tailwindcss.entryPoint`; without it the rule reports `designSystemUnavailable`. A `beforeAll` that calls `resetDesignSystem()` + `getLoadedDesignSystem(ENTRY_POINT)` only warms the cache. Reference: `tests/rules/no-unnecessary-arbitrary-value.test.ts` (it also shows how to assert the `suggestReplace` suggestions).
- DS-optional: a plain `ruleTester.run` (no entryPoint) exercises the static fallback, and a `makeFixtureRunner` block exercises the DS path. Reference: `tests/rules/no-dark-without-light.test.ts`.
- Options only: a plain `ruleTester.run`, with `options: [{ … }]` on the cases that override the default. Reference: `tests/rules/max-class-count.test.ts`.
- When an expected error passes `data`, include every placeholder its message uses: the RuleTester hydrates the message from `data` and fails on a partial one.
- Cover the posture: a DS-dependent rule gets one case with no entryPoint expecting `designSystemUnavailable`; a DS-optional rule gets one case whose `settings.tailwindcss.entryPoint` points at a missing CSS file and still produces the static result. For a DS-optional rule, also add `expect(rule.meta?.messages).not.toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)` next to the existing one in `tests/integration/fatal-errors.test.ts` — that assertion is per rule, not automatic.
- A fixer also gets its row in `tests/integration/multiline-preservation.test.ts`.

Fixtures live in `tests/fixtures/` (`default.css` is the usual entry point). Run one file with `pnpm -C packages/oxlint-tailwindcss exec vitest run tests/rules/<rule-name>.test.ts`; also run `tests/integration/fatal-errors.test.ts` (it iterates every registered rule) and `tests/integration/multiline-preservation.test.ts`.

## Registration

A new rule is wired in at:

1. `packages/oxlint-tailwindcss/src/index.ts` — the import and the `rules` map entry (the key is the public rule name). The rule's `meta.docs` is `ruleDocs('<name>', { description, category, recommended, designSystem })` from `../utils/rule-docs`: `category` places it on `rules/index.md` and in the generated rule list, `recommended` puts it in the generated recommended configs, and `designSystem` must match what the rule does (docs-sync checks it). The docs generator reads this registry from the built `dist/index.cjs`, so run `pnpm build` before step 2.
2. `packages/docs/rules/_extras/<rule>.md` and `packages/docs/es/rules/_extras/<rule>.md`, then `pnpm -C packages/docs generate` (it does not build first; `pnpm -C packages/docs build` does both). An `_extras` file replaces the whole generated body (options, examples, auto-fix), so copy the section layout of an existing one of the same kind; the ES copy uses neutral tuteo. The regenerated `rules/<rule>.md` and `es/rules/<rule>.md` are tracked — commit them, don't hand-write them. The ✗ / ✓ examples in both `_extras` files run as tests (`tests/docs/doc-examples.test.ts`): give options with `// options: { … }` and the fixed result with `// → <line>`; `packages/docs/CLAUDE.md` has the grammar.
3. The hand-written rule lists and rule counts: `packages/docs/rules/index.md` and `packages/docs/es/rules/index.md` (both the category section and the matching DS-group table under "Defaults reference"), `packages/docs/index.md`, `packages/docs/es/index.md`, `README.md`, and the count in the first line of `packages/oxlint-tailwindcss/README.md` (its config and rule table are generated from `meta.docs`).
4. CLAUDE.md's rule count and rule lists (DS-dependent / DS-optional users, suggestion and `reportClassReplacements` counts), and the source comments that enumerate helper users (the headers of `src/utils/report.ts` and `src/utils/replacement.ts`), when the new rule changes them.
5. A `packages/oxlint-tailwindcss/CHANGELOG.md` entry. A new rule is a minor bump (see Versioning in CLAUDE.md); check the published version with `npm view oxlint-tailwindcss version` before picking the number.
6. If the rule needed a pattern this skill or CLAUDE.md doesn't describe, update them in the same PR.
