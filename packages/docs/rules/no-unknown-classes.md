# no-unknown-classes

> Disallow classes that are not defined in the Tailwind CSS design system

## What this rule does

Walks every Tailwind class extracted from your code and asks the design system — built from your
`entryPoint` CSS — whether the class is real. If it isn't, the rule reports it. When the class looks
like a typo of a known class (Levenshtein distance ≤ 2), the diagnostic includes a suggestion and an
editor quick-fix to replace it.

The design system here means **everything Tailwind would generate for your stylesheet**: the core
utilities (`flex`, `bg-red-500`, `hover:underline`), any `@theme` tokens you defined (`bg-card`,
`text-brand-foreground`), any classes registered by plugins (`prose`, `animate-in`, etc.), and any
custom CSS you wrote inline.

DS-dependent — requires `settings.tailwindcss.entryPoint`. When the design system can't load, the
rule emits a single fatal `designSystemUnavailable` diagnostic per file instead of silently passing.

### The variant chain is checked too

A typo in a variant produces no CSS at all, and it used to pass silently: the validity check
stripped the variants before looking at anything. `hoverr:flex`, `darkk:size-4`, `peer-cheked:flex`
and `@mdd:flex` are all reported now, with a suggestion that is **confirmed against the design
system before it is offered** — so `group-hoverr` is corrected to `group-hover` (root kept, tail
fixed) and a variant your own CSS defines (`@custom-variant thumb (&::-webkit-slider-thumb)`) is
spell-checked like a built-in one.

This can't be done from a list of variant names: Tailwind's functional variants (`group-*`,
`data-*`, `@md`, `supports-[…]`, `min-[…]`, `nth-*`, `has-[…]`, `not-*`, `in-[…]`) have an unbounded
value space, so a name list would report most real-world variants as unknown. Instead the chain
itself is compiled, once per distinct chain in the project.

### Off-scale values are checked against Tailwind, not guessed

Tailwind accepts numbers outside the theme scale (`w-45`, `gap-13`, `min-h-17.5`), so the rule used
to accept anything shaped like one — which meant `bg-red-5000`, `bg-red-500/foo` and `w-[]` passed
for exactly the reason `w-45` legitimately does. Classes the precompute cannot enumerate are now
resolved through the design system, batched and memoized, so the answer is Tailwind's rather than a
guess.

`w-[garbage]` stays valid on purpose: Tailwind takes an arbitrary value verbatim and emits
`width: garbage`. Whether that CSS is meaningful is not this rule's call.

## Project prefix (`prefix(...)`)

If your entry point declares a Tailwind v4 prefix — `@import "tailwindcss" prefix(tw)` — every
utility must be written with that prefix (`tw:flex`, `tw:hover:underline`). The rule is
prefix-aware:

- A correctly prefixed utility (`tw:flex`) is valid.
- A Tailwind utility written **without** the prefix (`flex`) produces no CSS, so it's reported as
  needing the prefix, with a quick-fix that adds it (`flex` → `tw:flex`).
- Component classes from `@layer components` (`btn`, `card`) carry no prefix and stay valid either
  way — only Tailwind-generated utilities require it.

The prefix is detected automatically from your `entryPoint`; there is nothing extra to configure.

## Options

### `allowlist`

`string[]`, default `[]`.

Exact class names to whitelist. Use this when the class is generated at runtime (template strings
the plugin can't statically resolve) or when it's deliberately not part of your design system but
you want it to survive linting. Matches are literal — `"my-special"` does not match
`"hover:my-special"`.

```jsonc
{ "tailwindcss/no-unknown-classes": ["error", { "allowlist": ["my-runtime-class", "legacy-button"] }] }
```

### `ignorePrefixes`

`string[]`, default `[]`.

Skip any class whose name begins with one of these prefixes. Use this for whole families of classes
you intentionally manage outside the design system — e.g. a CSS module compiled namespace (`s-`), a
third- party UI kit (`ant-`, `chakra-`), or framework-injected classes (`vue-enter`).

```jsonc
{ "tailwindcss/no-unknown-classes": ["error", { "ignorePrefixes": ["ant-", "swiper-"] }] }
```

Prefer `ignorePrefixes` over `allowlist` when there are many classes sharing a stem — easier to
maintain.

## Examples

### ✗ Incorrect

```tsx
// Typo
<div className="flx items-cetner" />
//             ~~~  ~~~~~~~~~~~~~ both reported with suggestions:
//             flx → flex
//             items-cetner → items-center

// Class doesn't exist (no plugin / no @theme token)
<div className="text-brrrand" />

// Variant on a bogus class
<div className="hover:foo-500" />

// Typo in the VARIANT — the utility is fine, the class emits nothing
<div className="hoverr:flex peer-cheked:underline" />
//              ~~~~~~      ~~~~~~~~~~~ → hover: / peer-checked:

// Shaped like an off-scale value, but Tailwind compiles neither
<div className="bg-red-5000 bg-blue-500/foo" />
```

### ✓ Correct

```tsx
// Core utility
<div className="flex items-center" />

// Theme token (works after declaring it in @theme in your entryPoint CSS)
<div className="bg-card text-card-foreground" />

// Plugin-registered class
<article className="prose prose-invert" />

// Off-scale values Tailwind does compile
<div className="w-45 gap-13 min-h-17.5" />

// Every variant shape, functional and arbitrary alike
<div className="group-hover:flex data-[state=open]:grid @md:block [&>svg]:size-4" />

// Allowlisted runtime class
<div className={"hover:" + dynamicSuffix} />
```

## Interactions with other rules

- **`no-deprecated-classes`**: this rule silently skips the v3 renames that one owns (`flex-grow`,
  `bg-gradient-to-r`, `break-words`, …) so you don't get two diagnostics for the same class. The
  list comes from the design system, not from a copy inside this rule, so the two cannot drift
  apart. Keep both rules on.
- **`enforce-canonical`**: complements this rule. `no-unknown-classes` catches typos and missing
  tokens; `enforce-canonical` rewrites valid-but-outdated forms (`-m-0` → `m-0`).
- **`no-restricted-classes`**: orthogonal. Use that one to ban valid classes you don't want; use
  this one to catch invalid ones.

## When to disable it

- **Heavy use of dynamic class generation** that the extractor can't resolve (e.g. classes assembled
  from untyped server data). The rule reports everything it doesn't recognize as unknown. Prefer
  `allowlist` or `ignorePrefixes` over disabling entirely.
- **Migrating an existing codebase**: run as `warn` until cleanup is complete, then bump to `error`.
- **Inside CSS-in-JS where the class strings aren't Tailwind**: this is usually solved by tightening
  your extractor config (remove the conflicting callee or attribute via
  `settings.tailwindcss.exclude`) rather than disabling the rule.
