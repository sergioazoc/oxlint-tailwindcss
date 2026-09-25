---
title: Running in CI
description: "Run oxlint-tailwindcss in CI: pull-request annotations, the design-system precompute cached between jobs, per-rule timings, and what to trust."
---

# Running in CI

Nothing is CI-specific: install, point [`entryPoint`](/settings#entrypoint-required) at your CSS,
run `oxlint`. The rest of this page makes it faster and easier to read.

## Annotations on the pull request

`oxlint -f github` prints each diagnostic as a GitHub Actions annotation, so it shows up inline in
the pull request's diff:

```text
::error file=src/Button.tsx,line=1,endLine=1,col=39,endColumn=62,title=tailwindcss(no-unknown-classes)::src/Button.tsx:1:39: "itms-center" is not a valid Tailwind class. Did you mean "items-center"?
```

## Cache the design system between jobs

The first time the plugin sees a CSS entry point it precomputes that design system — every class
Tailwind can generate for it, with its CSS — and writes the result to a disk cache. Later runs read
it back and skip that step. The precompute is most of a cold run: on shadcn/ui's `apps/v4`, with
every rule on, a cold run takes several times as long as a warm one.

A GitHub-hosted runner starts every job on a fresh machine, so every job pays the cold start. Put
the cache in a directory you persist between jobs, with the `OXLINT_TAILWINDCSS_CACHE_DIR`
environment variable:

```yaml
- uses: actions/cache@v6
  with:
    path: ~/.cache/oxlint-tailwindcss
    key: oxlint-tailwindcss-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml', 'src/**/*.css') }}

- run: OXLINT_TAILWINDCSS_CACHE_DIR="$HOME/.cache/oxlint-tailwindcss" npx oxlint -f github
```

- The plugin creates the directory if it doesn't exist. The variable takes the path as is — `~` is
  not expanded, which is why the step uses `$HOME`.
- A run that finds its design system in the cache doesn't compute it again. The directory also keeps
  the canonical form of each arbitrary-value class the rules meet (`p-[2px]`), so it grows a little
  as your code does; that part only saves time.
- The key above changes with the lockfile (which pins the Tailwind version and any Tailwind plugins)
  and with your CSS. Adjust the CSS glob to where your stylesheets live.

## See which rules cost what

`--debug timings` prints a per-rule table after the lint. JS plugin rules, like these, are in it
from oxlint 1.84:

```bash
npx oxlint -f default --debug timings
```

```text
Rule timings:
Rule                               Time (ms)  Relative  Calls  Source
--------------------------------  ----------  --------  -----  ---------
tailwindcss/no-unknown-classes        87.440     99.5%      2  js-plugin
tailwindcss/no-duplicate-classes       0.467      0.5%      2  js-plugin
```

It prints nothing with `-f github`: run it as a separate step, or locally, with the default format.

## What to trust

The cache holds data the rules act on — including what the autofixes rewrite classes to. Treat it
like any other build artifact:

- Restore only caches your own workflows saved.
- Don't point `OXLINT_TAILWINDCSS_CACHE_DIR` at a directory other users or jobs can write to. A
  directory the plugin creates is private to its owner (`0700`).

The plugin checks the shape of every cache file it reads and recomputes one that is corrupt or
truncated, so a bad cache costs a cold start, not a crash.

See also the [environment variables](/settings#environment-variables) reference.
