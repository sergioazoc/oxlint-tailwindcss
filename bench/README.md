# Corpus benchmark

A reproducible, network-dependent benchmark that runs oxlint-tailwindcss (and, for reference,
`@shadcn/lint` and `eslint-plugin-better-tailwindcss`) over a pinned real-world corpus:
[shadcn-ui/ui](https://github.com/shadcn-ui/ui) `apps/v4` at commit
`98a1fe67b439324ddc857f47fbdce056600a4329` (880 files).

It is **not** part of the pnpm workspace and never runs in `release.yml`. Competitor packages are
installed here with npm so they never reach the main lockfile.

## Setup

```bash
cd bench
npm ci            # pinned oxlint, plugins, tailwindcss, shadcn
npm run corpus    # sparse-clones the corpus into bench/.corpus (verifies the SHA)
npm test          # unit tests for the libraries in lib/
```

## Running

```bash
# Build the plugin first when using --plugin local.
pnpm -C .. build

node run.mjs --config otw-all --plugin local                     # warm cache
node run.mjs --config otw-all --plugin local --cache cold        # fresh cache: measures the precompute
node run.mjs --config otw-all --plugin local --target synthetic  # the seeded agent-mistake files
node run.mjs --config shadcn-all                                 # a competitor, for reference
node run.mjs --config otw-all --plugin local --timings           # + per-rule JS plugin time
```

- `--plugin published` uses the oxlint-tailwindcss version pinned in `package.json`;
  `--plugin local` uses `packages/oxlint-tailwindcss/dist` from this repo.
- `--config` picks a template from `configs/` (`otw-all`, `otw-recommended`, `otw-ds`, `shadcn-all`,
  `shadcn-ds`, `btw-all`, `btw-recommended`, `combo`). A template may name oxlint-tailwindcss's
  rules by intent instead of listing them — `"x-rules": "all"` (every rule the plugin has, at its
  recommended severity or `warn`; `otw-all` turns `enforce-physical`, `enforce-logical` reversed,
  off) or `"recommended"` (`meta.docs.recommended`, declared since 1.14.0) — with `"x-options"` for
  a rule's options (`lib/config.mjs`). A listed rule the chosen plugin version doesn't have is
  dropped and named, so one template serves `published` and `local`.
- `--timings` adds a second, warm run with `oxlint -f default --debug=timings` (oxlint >= 1.84
  reports JS plugin rules) and stores the per-rule table in the snapshot's `meta.timings`. It covers
  rule creation, hooks and visitor callbacks, not plugin load or the design-system precompute. The
  `-f default` matters: oxlint switches to its terse `agent` formatter on its own when it detects an
  AI agent, and that formatter prints no timing table.
- Output: `out/<label>.json` (raw `oxlint -f json`) and `out/<label>.snapshot.json` (normalized
  records, one per line, plus metadata: versions, file count, threads, wall time).

## Regression guard

Every behaviour change is compared against the committed baseline:

```bash
node run.mjs --config otw-all --plugin local --label after
node compare.mjs baseline/otw-all-corpus.snapshot.json out/after.snapshot.json
```

`compare.mjs` prints the per-rule table, then the exact diagnostics added and removed and the ones
whose message changed. Dependency-only changes must pass `--expect-identical`, which exits 1 on any
difference. When a change intentionally moves diagnostics, the new snapshot replaces the baseline in
the same commit.

`baseline/` holds this repo's build (`--plugin local`) with `otw-all`, over the corpus and over
`synthetic/`. Competitor snapshots are not committed: they are reproducible from the pinned versions
with the commands above.

## Scoring: the /benchmark and /comparison pages

```bash
node score.mjs                                   # writes results/latest.json (≈ 12 min)
node score.mjs --check results/latest.json --runs 1   # exits 1 when the file is stale
pnpm -C ../packages/docs generate                # the pages' tables, from that file
```

Every number on those pages comes from `results/latest.json`; `.github/workflows/bench.yml` runs
`--check` weekly. For each tool, with its all-rules config (`otw-all`, `shadcn-all`, `btw-all`):

- **Seeded mistakes.** Each line of `synthetic/` that holds a mistake is labeled with the concerns
  that describe it (`{/* expect: palette */}`), each clean one with `expect: ok`, and the ambiguous
  ones not at all. A tool catches a mistake when it reports that line with a rule of one of its
  concerns, and raises a false alarm when it reports an `ok` line with a rule of a concern that
  isn't style policy. Which rule belongs to which concern comes from the docs' data —
  `packages/docs/data/shadcn-lint.json` for ours and @shadcn/lint's, `better-tailwindcss.json`
  (their rule ↔ ours) for better-tailwindcss's, both checked against the real tools by `interop.mjs`
  — plus `data/concerns.json` for the concerns /shadcn has no row for (`lib/concerns.mjs`).
- **Speed.** Wall time of a warm run, median of `--runs` (5), and of cold runs for
  oxlint-tailwindcss, the only one with a cache to be cold. Each tool runs under the same oxlint;
  better-tailwindcss is an ESLint plugin, run through oxlint's JS plugin support.
- **Oracles**, with the corpus's own Tailwind as the judge (`lib/oracle.mjs`): an unknown-class
  report of a class Tailwind compiles is a false positive for sure (one a project stylesheet
  defines, likely); a conflict report of two classes that set no property in a shared context is
  unfounded; and a fix — `--fix`, then `--fix --fix-suggestions` — is judged by the effective style
  of each class string it changes (`lib/css.mjs`: the winning value of every property in every
  variant context, read left-to-right, with theme values substituted and simple `calc()`s evaluated,
  `@supports` applied as Tailwind v4's browsers do). Same style, a typo fixed (a class Tailwind
  didn't know replaced by one that adds only its own declarations), or changed — every changed
  string is in the results with its before, after and diff. The fix runs edit the corpus in place
  and restore it from git, so `score.mjs` refuses to start on a corpus with local changes.

## The pages that name other plugins

```bash
node interop.mjs   # after `pnpm -C .. build`
```

For `/shadcn`: lints every example of `packages/docs/data/shadcn-lint.json` in a minimal shadcn/ui
project (`interop/project`: `components.json`, a Button, the fixture theme), first with @shadcn/lint
alone — it must report exactly what the page's @shadcn/lint column says — then with the combined
config read from `packages/docs/shadcn.md`, where every example must still be reported and each
concern by the tool the page gives it to. The page's oxlint-tailwindcss column is checked by the
main test suite (`tests/docs/shadcn-interop.test.ts`).

For `/migration/from-better-tailwindcss`: every row of `packages/docs/data/better-tailwindcss.json`
— its example must be reported by their rule and by ours, each with the row's options — and every
rule of eslint-plugin-better-tailwindcss must have a row.

Exits 1 on any disagreement. `.github/workflows/interop.yml` runs it weekly with the pinned versions
and with the latest releases.

## Files

- `corpus.mjs` — fetches and verifies the pinned corpus.
- `run.mjs` — materializes a config template inside the corpus and runs oxlint.
- `compare.mjs`, `lib/` — normalization and diffing.
- `synthetic/` — hand-written files seeded with typical agent mistakes (raw palette colors,
  arbitrary values, restyled components, components rebuilt from raw elements, conflicts, typos,
  `var()` references, runtime-built classes), each labeled with an `expect:` comment. Excluded from
  the repo's own lint and format.
- `score.mjs`, `results/latest.json` — the scoring above, and its committed output.
- `lib/runner.mjs` (running oxlint over the corpus), `lib/config.mjs`, `lib/concerns.mjs`,
  `lib/oracle.mjs`, `lib/css.mjs`, `lib/strings.mjs` — each with its tests in `test/`.
- `data/concerns.json` — the seeded files' concerns beyond /shadcn's.
- `interop.mjs`, `interop/project/` — the checks above.
- `r8/` — `gate.mjs`, the gate `no-borrowed-component-styles` passed, with its fixtures; the regex
  prototype and the original head-to-head analysis script, kept as reference.
