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
npm test          # unit tests for the normalizer and the comparer
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
  `shadcn-ds`, `btw-recommended`, `combo`).
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

## Baseline (2026-09-25, Apple M4 Pro, 12 threads)

| Run                                   | Files | Diagnostics | Warm    | Cold   |
| ------------------------------------- | ----- | ----------- | ------- | ------ |
| oxlint-tailwindcss 1.13.0, all rules  | 880   | 2620        | 1.4 s   | 11.2 s |
| oxlint-tailwindcss, recommended       | 880   | 413         | 1.4 s   |        |
| @shadcn/lint 0.2.0, all rules         | 880   | 2578        | 1.0 s   |        |
| better-tailwindcss 4.7.0, recommended | 880   | 705         | 23–31 s |        |
| oxlint-tailwindcss + @shadcn/lint     | 880   | 2957        | 1.8 s   |        |

Competitor snapshots are not committed: they are reproducible from the pinned versions with the
commands above.

## /shadcn against @shadcn/lint

```bash
node interop.mjs   # after `pnpm -C .. build`
```

Lints every example of `packages/docs/data/shadcn-lint.json` in a minimal shadcn/ui project
(`interop/project`: `components.json`, a Button, the fixture theme), first with @shadcn/lint alone —
it must report exactly what the page's @shadcn/lint column says — then with the combined config read
from `packages/docs/shadcn.md`, where every example must still be reported and each concern by the
tool the page gives it to. Exits 1 on any disagreement. The page's oxlint-tailwindcss column is
checked by the main test suite (`tests/docs/shadcn-interop.test.ts`).
`.github/workflows/interop.yml` runs this weekly with the pinned and the latest @shadcn/lint.

## Files

- `corpus.mjs` — fetches and verifies the pinned corpus.
- `run.mjs` — materializes a config template inside the corpus and runs oxlint.
- `compare.mjs`, `lib/` — normalization and diffing.
- `synthetic/` — hand-written files seeded with typical agent mistakes (raw palette colors,
  arbitrary values, restyled components, components rebuilt from raw elements, conflicts, typos,
  `var()` references, runtime-built classes). Excluded from the repo's own lint and format.
- `interop.mjs`, `interop/project/` — the /shadcn check above.
- `r8/` — the regex prototype for detecting raw elements that borrow a design-system component's
  styles, and the original head-to-head analysis script, kept as reference.
