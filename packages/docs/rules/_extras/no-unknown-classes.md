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
```

### ✓ Correct

```tsx
// Core utility
<div className="flex items-center" />

// Theme token (works after declaring it in @theme in your entryPoint CSS)
<div className="bg-card text-card-foreground" />

// Plugin-registered class
<article className="prose prose-invert" />

// Allowlisted runtime class
<div className={"hover:" + dynamicSuffix} />
```

## Interactions with other rules

- **`no-deprecated-classes`**: this rule silently skips classes flagged by `no-deprecated-classes`
  (`flex-grow`, `space-y-reverse`, etc.) so you don't get two diagnostics for the same class. Keep
  both rules on.
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
