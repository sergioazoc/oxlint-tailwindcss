---
title: "Tailwind CSS lint plugins benchmark"
description: "oxlint-tailwindcss, @shadcn/lint and better-tailwindcss on shadcn/ui's apps/v4: mistakes caught, false positives, speed, and what their fixes do."
---

# Benchmark

Three oxlint plugins that lint Tailwind CSS classes, run over the same real project and the same
seeded mistakes, and judged by Tailwind itself. Every number on this page is generated from
[`bench/results/latest.json`](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/bench/results/latest.json),
which
[`bench/score.mjs`](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/bench/score.mjs)
writes; a weekly job checks that a fresh run still agrees with it.

<!-- generated:bench-setup -->

- **Corpus**:
  [shadcn-ui/ui `apps/v4`](https://github.com/shadcn-ui/ui/tree/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4)
  @ `98a1fe67`, 880 files
- **Versions**: oxlint-tailwindcss 1.13.0, @shadcn/lint 0.2.0, eslint-plugin-better-tailwindcss
  4.7.0; oxlint 1.85.0, tailwindcss 4.3.3
- **Machine**: Apple M4 Pro, 12 cores, darwin 25.5.0, Node 24.19.0; median of 5 runs

<!-- /generated:bench-setup -->

## Speed

Each tool with all its rules on — and with its recommended set, where it has one — under the same
oxlint. A warm run reuses oxlint-tailwindcss's design-system cache; a cold run starts without it, as
the first run on a machine or in CI does ([Running in CI](/ci) keeps it between jobs). The other two
have no cache to be cold. better-tailwindcss is an ESLint plugin, run through oxlint's support for
them, like the other two.

<!-- generated:bench-speed -->

| Tool                             | Rules       | Warm run | Cold run | Diagnostics |
| -------------------------------- | ----------- | -------- | -------- | ----------- |
| oxlint-tailwindcss               | all         | 1.3 s    | 9.0 s    | 2,704       |
| oxlint-tailwindcss               | recommended | 1.1 s    | 9.0 s    | 352         |
| @shadcn/lint                     | all         | 1.0 s    | —        | 2,578       |
| eslint-plugin-better-tailwindcss | all         | 30.9 s   | —        | 6,284       |
| eslint-plugin-better-tailwindcss | recommended | 29.0 s   | —        | 705         |

<!-- /generated:bench-speed -->

## Seeded mistakes

Files of the mistakes people and agents make with Tailwind, in
[`bench/synthetic`](https://github.com/sergioazoc/oxlint-tailwindcss/tree/main/bench/synthetic):
palette colors, arbitrary values, restyled and rebuilt components, conflicts, typos, `var()`
references, deprecated and runtime-built classes. Each mistake is labeled with what it is, each
clean line as clean, and the ambiguous ones not at all. A tool catches a mistake when it reports its
line with a rule for that kind of mistake, and raises a false alarm when it reports a clean line
with anything but a style rule. Which rule is for which mistake comes from the tables of
[shadcn/ui and @shadcn/lint](/shadcn) and the [migration guide](/migration/from-better-tailwindcss),
which a weekly job checks against the real tools.

<!-- generated:bench-seeded -->

| Mistake                                                                        | oxlint-tailwindcss | @shadcn/lint | eslint-plugin-better-tailwindcss |
| ------------------------------------------------------------------------------ | ------------------ | ------------ | -------------------------------- |
| A Tailwind palette color instead of a theme color                              | 8/8                | 6/8          | 0/8                              |
| Arbitrary values                                                               | 8/8                | 8/8          | 0/8                              |
| Classes with a canonical form                                                  | 3/3                | 3/3          | 2/3                              |
| Restyling a design-system component through `className`                        | 1/6                | 6/6          | 0/6                              |
| Component rebuilt from raw classes                                             | 4/4                | 0/4          | 0/4                              |
| Classes that override each other                                               | 6/6                | 0/6          | 3/6                              |
| Duplicate classes                                                              | 1/1                | 0/1          | 1/1                              |
| Redundant or contradicting variant                                             | 1/1                | 0/1          | 0/1                              |
| Extra whitespace                                                               | 1/1                | 0/1          | 1/1                              |
| Classes Tailwind can't generate: typos in utilities, variants and theme colors | 9/9                | 9/9          | 9/9                              |
| A CSS variable where the theme has a named class                               | 3/3                | 1/3          | 0/3                              |
| Classes deprecated in Tailwind v4                                              | 2/2                | 0/2          | 2/2                              |
| Longhands with a shorthand                                                     | 1/1                | 0/1          | 1/1                              |
| A dark-mode color with no light-mode base                                      | 1/1                | 0/1          | 0/1                              |
| Classes built at runtime                                                       | 1/1                | 0/1          | 1/1                              |
| Inline styles                                                                  | 0/1                | 1/1          | 0/1                              |
| **All mistakes**                                                               | **50/56**          | **34/56**    | **20/56**                        |
| False alarms on the clean lines                                                | 0/6                | 0/6          | 0/6                              |

<!-- /generated:bench-seeded -->

The files are this project's, and cover the mistakes it was built for: read the table by row — which
kinds of mistake each tool covers — more than by the total. Restyled components and inline styles
are @shadcn/lint's alone; [shadcn/ui and @shadcn/lint](/shadcn) has the config that runs both.

::: details Every labeled line

<!-- generated:bench-seeded-lines -->

| Code                                                                                       | Mistake                                                                        | oxlint-tailwindcss | @shadcn/lint | eslint-plugin-better-tailwindcss |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------ | ------------ | -------------------------------- |
| `<div className="flex bg-red-500 p-4">Sale</div>`                                          | A Tailwind palette color instead of a theme color                              | ✓                  | ✓            | ✗                                |
| `<p className="text-gray-600">Subtitle</p>`                                                | A Tailwind palette color instead of a theme color                              | ✓                  | ✓            | ✗                                |
| `<div className="border border-slate-200">Box</div>`                                       | A Tailwind palette color instead of a theme color                              | ✓                  | ✓            | ✗                                |
| `<div className="bg-white">White</div>`                                                    | A Tailwind palette color instead of a theme color                              | ✓                  | ✗            | ✗                                |
| `<div className="text-black">Black</div>`                                                  | A Tailwind palette color instead of a theme color                              | ✓                  | ✗            | ✗                                |
| `<div className="bg-[#1a73e8] p-2">Hex</div>`                                              | Arbitrary values                                                               | ✓                  | ✓            | ✗                                |
| `<div className="shadow-[0_1px_2px_rgba(0,0,0,0.1)]">Shadow</div>`                         | Arbitrary values                                                               | ✓                  | ✓            | ✗                                |
| `<div className="text-[oklch(0.6_0.2_250)]">Oklch</div>`                                   | Arbitrary values                                                               | ✓                  | ✓            | ✗                                |
| `<div className="hover:bg-blue-600/80">Hover raw</div>`                                    | A Tailwind palette color instead of a theme color                              | ✓                  | ✓            | ✗                                |
| `<div className="bg-primary text-primary-foreground">OK token</div>`                       | clean                                                                          | ✓                  | ✓            | ✓                                |
| `<div className="p-[13px]">odd padding</div>`                                              | Arbitrary values                                                               | ✓                  | ✓            | ✗                                |
| `<div className="w-[350px]">fixed width</div>`                                             | Arbitrary values                                                               | ✓                  | ✓            | ✗                                |
| `<div className="text-[15px]">odd text</div>`                                              | Arbitrary values                                                               | ✓                  | ✓            | ✗                                |
| `<div className="rounded-[10px]">odd radius</div>`                                         | Arbitrary values                                                               | ✓                  | ✓            | ✗                                |
| `<div className="mt-[16px]">same as mt-4</div>`                                            | Classes with a canonical form                                                  | ✓                  | ✓            | ✗                                |
| `<div className="top-[1px] relative">same as top-px</div>`                                 | Classes with a canonical form                                                  | ✓                  | ✓            | ✓                                |
| `<div className="min-h-[100vh]">same as min-h-screen</div>`                                | Classes with a canonical form                                                  | ✓                  | ✓            | ✓                                |
| `<div className="p-4">OK scale</div>`                                                      | clean                                                                          | ✓                  | ✓            | ✓                                |
| `<Card className="p-8 shadow-xl">`                                                         | Restyling a design-system component through `className`                        | ✗                  | ✓            | ✗                                |
| `<CardTitle className="text-2xl font-bold">Checkout</CardTitle>`                           | Restyling a design-system component through `className`                        | ✗                  | ✓            | ✗                                |
| `<CardContent className="mt-2">`                                                           | clean                                                                          | ✓                  | ✓            | ✓                                |
| `<Badge className="rounded-sm px-3 text-sm">New</Badge>`                                   | Restyling a design-system component through `className`                        | ✗                  | ✓            | ✗                                |
| `<Button className="p-4 rounded-full">Pay</Button>`                                        | Restyling a design-system component through `className`                        | ✗                  | ✓            | ✗                                |
| `<Button className="bg-blue-600 text-white hover:bg-blue-700">Buy</Button>`                | Restyling a design-system component through `className`                        | ✓                  | ✓            | ✗                                |
| `<Button className="mt-4 w-full">Allowed layout</Button>`                                  | clean                                                                          | ✓                  | ✓            | ✓                                |
| `<Button size="lg" variant="outline">Allowed props</Button>`                               | clean                                                                          | ✓                  | ✓            | ✓                                |
| `<button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg…` | Component rebuilt from raw classes                                             | ✓                  | ✗            | ✗                                |
| `<input className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3…` | Component rebuilt from raw classes                                             | ✓                  | ✗            | ✗                                |
| `<div className="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground…` | Component rebuilt from raw classes                                             | ✓                  | ✗            | ✗                                |
| `<span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 …` | Component rebuilt from raw classes                                             | ✓                  | ✗            | ✗                                |
| `<div className="line-clamp-1 flex">clamp broken</div>`                                    | Classes that override each other                                               | ✓                  | ✗            | ✗                                |
| `<div className="p-4 p-6">double padding</div>`                                            | Classes that override each other                                               | ✓                  | ✗            | ✓                                |
| `<div className="text-sm text-base">double size</div>`                                     | Classes that override each other                                               | ✓                  | ✗            | ✓                                |
| `<div className="block flex">double display</div>`                                         | Classes that override each other                                               | ✓                  | ✗            | ✓                                |
| `<div className="size-5 w-4">size vs width</div>`                                          | Classes that override each other                                               | ✓                  | ✗            | ✗                                |
| `<div className="flex flex items-center">duplicate</div>`                                  | Duplicate classes                                                              | ✓                  | ✗            | ✓                                |
| `<div className="pt-3 xl:pt-3">redundant variant</div>`                                    | Redundant or contradicting variant                                             | ✓                  | ✗            | ✗                                |
| `<div className="absolute sr-only">redundant position</div>`                               | Classes that override each other                                               | ✓                  | ✗            | ✗                                |
| `<div className="mt-2   mb-2">whitespace</div>`                                            | Extra whitespace                                                               | ✓                  | ✗            | ✓                                |
| `<div className="itms-center flex">typo items</div>`                                       | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="jusitfy-between flex">typo justify</div>`                                 | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="bg-primray">typo token</div>`                                             | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="text-muted-foregound">typo token 2</div>`                                 | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="rounded-huge">unknown radius</div>`                                       | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="flex-cols">unknown flex</div>`                                            | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="shadow-xxl">unknown shadow</div>`                                         | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="md:grids-col-2 grid">typo grid</div>`                                     | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="bg-chart-6">undeclared token</div>`                                       | Classes Tailwind can't generate: typos in utilities, variants and theme colors | ✓                  | ✓            | ✓                                |
| `<div className="bg-surface text-code-foreground">declared custom tokens OK</div>`         | clean                                                                          | ✓                  | ✓            | ✓                                |
| `<div className="bg-(--primary)">var ref to token</div>`                                   | A CSS variable where the theme has a named class                               | ✓                  | ✗            | ✗                                |
| `<div className="text-[var(--muted-foreground)]">bracket var to token</div>`               | A CSS variable where the theme has a named class                               | ✓                  | ✓            | ✗                                |
| `<div className="border-(--border) border">var to border token</div>`                      | A CSS variable where the theme has a named class                               | ✓                  | ✗            | ✗                                |
| `<div className="bg-gradient-to-r from-primary to-secondary">deprecated gradient</div>`    | Classes deprecated in Tailwind v4                                              | ✓                  | ✗            | ✓                                |
| `<div className="flex-shrink-0">deprecated shrink</div>`                                   | Classes deprecated in Tailwind v4                                              | ✓                  | ✗            | ✓                                |
| `<div className="h-4 w-4">shorthand size-4</div>`                                          | Longhands with a shorthand                                                     | ✓                  | ✗            | ✓                                |
| `<div className="dark:hover:bg-accent">variant order</div>`                                | A dark-mode color with no light-mode base                                      | ✓                  | ✗            | ✗                                |
| `danger: "bg-red-500 text-white",`                                                         | A Tailwind palette color instead of a theme color                              | ✓                  | ✓            | ✗                                |
| `info: "bg-[#0ea5e9] text-white",`                                                         | Arbitrary values                                                               | ✓                  | ✓            | ✗                                |
| `<div className={`bg-${color}-500 p-2`}>template</div>`                                    | Classes built at runtime                                                       | ✓                  | ✗            | ✓                                |
| `<div className={cn("p-2", active && "bg-emerald-500")}>cn cond</div>`                     | A Tailwind palette color instead of a theme color                              | ✓                  | ✓            | ✗                                |
| `<Button className={cn(active && "rounded-none")}>cn on component</Button>`                | Restyling a design-system component through `className`                        | ✗                  | ✓            | ✗                                |
| <span v-pre>`<div style={{ color: "#f00", padding: 12 }}>inline style</div>`</span>        | Inline styles                                                                  | ✗                  | ✓            | ✗                                |

<!-- /generated:bench-seeded-lines -->

:::

## Real code, judged by Tailwind

On the corpus, a report can be checked against Tailwind itself. An unknown-class report of a class
Tailwind compiles is wrong for sure. One of a class a project stylesheet defines is most likely
wrong too: the class styles something, only not through Tailwind. A conflict report of two classes
that set no property in the same variant context has no conflict to report.

<!-- generated:bench-oracles -->

| Tool                             | Unknown-class reports | …of classes Tailwind compiles | …of classes a project stylesheet defines | Conflict reports | …of classes that share no property |
| -------------------------------- | --------------------- | ----------------------------- | ---------------------------------------- | ---------------- | ---------------------------------- |
| oxlint-tailwindcss               | 77                    | 0                             | 18                                       | 20               | 0                                  |
| @shadcn/lint                     | 34                    | 0                             | 18                                       | —                | —                                  |
| eslint-plugin-better-tailwindcss | 97                    | 0                             | 38                                       | 0                | 0                                  |

<!-- /generated:bench-oracles -->

## What the fixes do

Each tool's `--fix`, then `--fix --fix-suggestions`, applied to the corpus. Every class string a fix
changed is compared by its effective style before and after — the value each property ends up with,
in each variant context. It is the same style; a typo fixed, where a class Tailwind didn't know is
replaced by one that adds only its own declarations; or a changed style, listed below with its
before and after. Logical and physical properties are read left to right, theme values are
substituted, and `@supports` blocks apply, as they do in the browsers Tailwind v4 supports.

<!-- generated:bench-fixes -->

| Tool                             | Run                       | Class strings changed | Same style | Typo fixed | Style changed |
| -------------------------------- | ------------------------- | --------------------- | ---------- | ---------- | ------------- |
| oxlint-tailwindcss               | `--fix`                   | 670                   | 670        | 0          | 0             |
| oxlint-tailwindcss               | `--fix --fix-suggestions` | 866                   | 861        | 4          | **1**         |
| @shadcn/lint                     | `--fix`                   | no autofix            | —          | —          | —             |
| @shadcn/lint                     | `--fix --fix-suggestions` | 249                   | 212        | 3          | **34**        |
| eslint-plugin-better-tailwindcss | `--fix`                   | 2,865                 | 2,864      | 0          | **1**         |
| eslint-plugin-better-tailwindcss | `--fix --fix-suggestions` | 2,865                 | 2,864      | 0          | **1**         |

<!-- /generated:bench-fixes -->

<!-- generated:bench-fix-changes -->

::: details oxlint-tailwindcss: 1 string whose style `--fix --fix-suggestions` changed

- `components/block-viewer.tsx`

  ```diff
  - relative hidden w-3 bg-transparent p-0 after:absolute after:top-1/2 after:right-0 after:h-8 after:w-[6px] after:translate-x-[-1px] after:-translate-y-1/2 after:rounded-full after:bg-border after:transition-all after:hover:h-10 md:block
  + relative hidden w-3 bg-transparent p-0 after:absolute after:top-1/2 after:right-0 after:h-8 after:w-[6px] after:translate-x-[-1px] after:-translate-y-1/2 after:rounded-full after:bg-border after:transition-all hover:after:h-10 md:block
  ```

  `&::after > &:hover > @media (hover: hover) | height`: `40px` → none  
  `@media (hover: hover) > &:hover::after | content`: none → `var(--tw-content)`  
  `@media (hover: hover) > &:hover::after | height`: none → `40px`

:::

::: details @shadcn/lint: 34 strings whose style `--fix --fix-suggestions` changed

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - cn-menu-target z-50 no-scrollbar max-h-(--available-height) w-[calc(var(--available-width)-(--spacing(6)))] min-w-32 origin-(--transform-origin) translate-y-2 overflow-x-hidden overflow-y-auto rounded-xl border-0 bg-neutral-950/80 p-1.5 text-neutral-100 ring-1 ring-neutral-950/80 backdrop-blur-xl outline-none md:w-52 dark:bg-neutral-800/90 dark:ring-neutral-700/50 data-closed:overflow-hidden
  + cn-menu-target z-50 no-scrollbar max-h-(--available-height) w-[calc(var(--available-width)-(--spacing(6)))] min-w-32 origin-(--transform-origin) translate-y-2 overflow-x-hidden overflow-y-auto rounded-xl border-0 bg-sidebar-primary/80 p-1.5 text-neutral-100 ring-1 ring-neutral-950/80 backdrop-blur-xl outline-none md:w-52 dark:bg-neutral-800/90 dark:ring-neutral-700/50 data-closed:overflow-hidden
  ```

  `& | background-color`: `color-mix(in oklab, oklch(14.5% 0 none) 80%, transparent)` →
  `color-mix(in oklab, var(--sidebar-primary) 80%, transparent)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8
  + px-2 py-1.5 text-xs font-medium text-ring data-inset:pl-8
  ```

  `& | color`: `oklch(70.8% 0 none)` → `var(--ring)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - group/dropdown-menu-item relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium outline-hidden select-none **:text-neutral-100 focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
  + group/dropdown-menu-item relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium outline-hidden select-none **:text-muted focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
  ```

  `& * | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm font-medium outline-hidden select-none **:text-neutral-100 focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
  + relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm font-medium outline-hidden select-none **:text-muted focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
  ```

  `& * | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - -mx-1.5 my-1.5 h-px bg-neutral-600 dark:bg-neutral-700
  + -mx-1.5 my-1.5 h-px bg-muted-foreground dark:bg-neutral-700
  ```

  `& | background-color`: `oklch(43.9% 0 none)` → `var(--muted-foreground)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - ml-auto text-xs tracking-widest text-neutral-400! group-focus/dropdown-menu-item:text-neutral-100
  + ml-auto text-xs tracking-widest text-ring! group-focus/dropdown-menu-item:text-neutral-100
  ```

  `& | color`: `oklch(70.8% 0 none) !important` → `var(--ring) !important`

- `app/(app)/(create)/components/project-form.tsx`

  ```diff
  - size-4 text-neutral-100 [&_svg]:size-4 [&_svg]:fill-current
  + size-4 text-muted [&_svg]:size-4 [&_svg]:fill-current
  ```

  `& | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/project-form.tsx`

  ```diff
  - size-4 text-neutral-100 [&_svg]:size-4 *:[svg]:text-neutral-100!
  + size-4 text-muted [&_svg]:size-4 *:[svg]:text-neutral-100!
  ```

  `& | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/project-form.tsx`

  ```diff
  - size-4 shrink-0 text-neutral-100 [&_svg]:size-4 *:[svg]:text-neutral-100!
  + size-4 shrink-0 text-muted [&_svg]:size-4 *:[svg]:text-neutral-100!
  ```

  `& | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/welcome-dialog.tsx`

  ```diff
  - dialog-ring max-w-92 min-w-0 gap-0 overflow-hidden rounded-xl p-0 sm:max-w-sm dark:bg-neutral-900
  + dialog-ring max-w-92 min-w-0 gap-0 overflow-hidden rounded-xl p-0 sm:max-w-sm dark:bg-sidebar-primary
  ```

  `&.dark * | background-color`: `oklch(20.5% 0 none)` → `var(--sidebar-primary)`

- `app/(app)/(create)/components/welcome-dialog.tsx`

  ```diff
  - flex aspect-[2/1.2] w-full items-center justify-center rounded-t-xl bg-neutral-950 text-center text-neutral-100 sm:aspect-2/1
  + flex aspect-[2/1.2] w-full items-center justify-center rounded-t-xl bg-sidebar-primary text-center text-neutral-100 sm:aspect-2/1
  ```

  `& | background-color`: `oklch(14.5% 0 none)` → `var(--sidebar-primary)`

- `app/(app)/(styles)/sera/components/theme-switcher.tsx`

  ```diff
  - w-full max-w-[60vw] rounded-full border-0 bg-neutral-950/50 p-1.5 shadow-xl backdrop-blur-xl sm:max-w-fit
  + w-full max-w-[60vw] rounded-full border-0 bg-sidebar-primary/50 p-1.5 shadow-xl backdrop-blur-xl sm:max-w-fit
  ```

  `& | background-color`: `color-mix(in oklab, oklch(14.5% 0 none) 50%, transparent)` →
  `color-mix(in oklab, var(--sidebar-primary) 50%, transparent)`

…and 22 more

:::

::: details eslint-plugin-better-tailwindcss: 1 string whose style `--fix` changed

- `app/(app)/examples/playground/page.tsx`

  ```diff
  - h-5 w-5
  + block-5
  ```

  `& | width`: `20px` → none

:::
<!-- /generated:bench-fix-changes -->

## Run it yourself

```bash
git clone https://github.com/sergioazoc/oxlint-tailwindcss
cd oxlint-tailwindcss
pnpm install && pnpm build
cd bench
npm ci && npm run corpus
node score.mjs   # writes results/latest.json
```

[`bench/README.md`](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/bench/README.md) has
the details: the configs each tool runs with, how the seeded files are labeled, and how each oracle
decides.

## What it doesn't measure

- **One project.** A React app on Tailwind v4 with shadcn/ui; another codebase has other mistakes.
- **The seeded files are this project's**, so they lean to what it checks. Their labels are in the
  files, for anyone to dispute.
- **Class strings, not pages.** The oracles see what a class string does to its element, not what a
  `group-*` parent or a script does with a class.
- **Speed on one machine.** Compare the tools with each other, not with your machine.
