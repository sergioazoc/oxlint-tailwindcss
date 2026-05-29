# Contributing

Thanks for contributing to `oxlint-tailwindcss`! This guide covers the setup, the checks your change
must pass, and — most importantly — how to write a pull request that's easy to review and merge.

This is a pnpm monorepo: the published plugin lives in `packages/oxlint-tailwindcss/`, the VitePress
docs site in `packages/docs/`. The root `CLAUDE.md` documents the architecture in depth.

## Prerequisites

- **Node.js ≥ 20**
- **pnpm ≥ 11.4.0** (enforced via `engines`; a lower version is rejected on install)

## Setup

```bash
pnpm install                 # from the repo root — installs all workspaces
pnpm build                   # build the plugin
pnpm test                    # run the test suite
pnpm -C packages/docs dev    # run the docs site locally
```

## Before you open a PR

Run these from the repo root so your code arrives already formatted and green:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

- `pnpm format` auto-fixes formatting (oxfmt) in place — commit the result. CI then verifies it with
  `pnpm format:check`, which only checks and fails if anything is unformatted.
- `format`, `lint`, `typecheck`, `test` all run from the **root** and cover the whole monorepo —
  oxlint/oxfmt are centralized there, not per package.
- Run a single test file:
  `pnpm -C packages/oxlint-tailwindcss exec vitest run tests/rules/<file>.test.ts`

## Writing a good pull request

A reviewer should understand _what changed and why_ without reading the diff first. Please include:

1. **A descriptive title** in [Conventional Commits](https://www.conventionalcommits.org/) style —
   the prefix sets the change type and feeds the version bump: `feat:` (new rule/option/behavior →
   minor), `fix:` (bug → patch), `docs:`, `chore:`, `ci:`, `refactor:`, `test:`. A breaking change
   adds `!` (e.g. `feat!:`) → major.

2. **What & why.** One or two sentences on the problem and your approach. Link the issue it
   resolves: `Closes #123`.

3. **Before → after examples** for any rule or behavior change. For Tailwind rules, show the input
   classes and the expected output, e.g.:

   ```
   px-4 py-4   →   p-4
   sm:h-4 sm:w-4   →   sm:size-4
   ```

4. **Tests.** New behavior needs tests; bug fixes need a regression test. Say which test files you
   added or ran.

5. **Breaking changes**, called out explicitly — including a rule that now reports cases it
   previously ignored (that still changes users' output).

6. **A CHANGELOG entry** when the published package changes (see Versioning).

Keep PRs focused on one thing. Smaller PRs get reviewed and merged faster.

## Project-specific things that trip people up

### Docs rule pages are generated — edit the source, not the output

`packages/docs/rules/<rule>.md` and `es/rules/<rule>.md` are **generated** by
`scripts/generate-rules.ts` and overwritten on every build. Editing them directly is silently lost.
Change a rule page's body via the `_extras` partial — `rules/_extras/<rule>.md` (EN),
`es/rules/_extras/<rule>.md` (ES) — then run `pnpm -C packages/docs generate`. Mirror English edits
into Spanish (neutral tuteo, never voseo). Title and description come from the rule's `meta` in the
library, not from docs.

### Markdown is formatted by oxfmt

`.md` is formatted by oxfmt like everything else (`proseWrap: always`), so don't hand-wrap prose —
`pnpm format` owns it. Fenced code blocks are left untouched (`embeddedLanguageFormatting: off`), so
example snippets stay as written. The docs `generate` step formats the pages it emits, so always
regenerate rule pages via `pnpm -C packages/docs generate`.

### Versioning

Use **semver** for the published package (`packages/oxlint-tailwindcss/package.json`): patch for
bugfixes, minor for new features / non-breaking additions, major for breaking changes. The root
`package.json` is private and stays at `0.0.0`. Add a matching entry to
`packages/oxlint-tailwindcss/CHANGELOG.md`.

## First-time contributors (fork PRs)

If this is your first PR from a fork, GitHub Actions won't run until a maintainer clicks **"Approve
and run workflows"** on the PR — so CI may show nothing at first. That's expected; a maintainer will
approve it. Subsequent PRs run automatically.

## Reporting issues

Bug reports and feature requests are welcome —
[open an issue](https://github.com/sergioazoc/oxlint-tailwindcss/issues). If a Tailwind plugin's
classes aren't recognized, include the CSS that triggers it — it helps a lot.
