# no-restricted-classes

> Disallow specific Tailwind CSS classes

## What this rule does

The manual veto. Lets you ban specific Tailwind classes — by exact name or by regex pattern — and
surface a configurable message explaining why. No design system, no heuristics: if the class
matches, the rule fires.

Typical uses: phasing out legacy utilities a refactor wants gone (`float-*` in flexbox-only
codebases), keeping a deprecated brand color out of new code, banning visibility hacks (`hidden`
everywhere but a specific component), or quarantining utilities until a migration is complete.

DS-independent — no `entryPoint` required. No autofix: the rule reports and lets the developer
choose the replacement (often context-specific).

Without options, the rule is a no-op. Configure at least one of `classes` or `patterns` to make it
active.

## Options

### `classes`

`string[]`, default `[]`.

Exact class names to ban. Matches are literal — `"hidden"` matches the bare class `hidden` and the
same class anywhere in a class string (`"flex hidden items-center"`), but does _not_ match
`"sr-hidden"` or `"hover:hidden"`. Use this for a small, explicit ban list.

```jsonc
{
  "tailwindcss/no-restricted-classes": ["error", {
    "classes": ["hidden", "block"]
  }]
}
```

### `patterns`

`Array<{ pattern: string; message?: string }>`, default `[]`.

A list of regex patterns (passed as strings, compiled with `new RegExp`) with an optional custom
message. Use this when you want to ban an entire family (`^float-`, `^text-(red|orange)-`) or when a
literal list would balloon. Patterns are tested against the full class including variants, so
`^hover:bg-red-` matches `hover:bg-red-500`. Custom messages render after the class name and make
the diagnostic actionable.

```jsonc
{
  "tailwindcss/no-restricted-classes": ["error", {
    "patterns": [
      { "pattern": "^float-", "message": "Use flexbox or grid" },
      { "pattern": "^text-(red|orange)-", "message": "Use semantic color tokens" }
    ]
  }]
}
```

If a class matches both `classes` and a pattern, the exact match wins and the rule reports it once.
Otherwise the first matching pattern wins.

## Examples

### ✗ Incorrect

```tsx
// Banned exact class
<div className="hidden" />
// with options.classes: ["hidden"]

// Banned somewhere in the middle of a class string
<div className="flex hidden items-center" />

// Banned via pattern with custom message
<div className="float-left" />
// with patterns: [{ pattern: "^float-", message: "Use flexbox" }]
// → '"float-left" is restricted: Use flexbox'

// Inside a cn() call
cn("float-right")
```

### ✓ Correct

```tsx
// No restrictions configured → rule is silent
<div className="hidden" />

// Class not in the ban list
<div className="flex items-center" />

// Variant changes the class — `hover:hidden` doesn't match `hidden`
<div className="hover:hidden" />
```

## Interactions with other rules

- **`no-unknown-classes`**: orthogonal. That rule catches invalid classes; this one bans _valid_
  classes you've decided to forbid. Both should be on.
- **`no-deprecated-classes`**: covers the well-known Tailwind v3 → v4 deprecations automatically.
  Use this rule for your project's _own_ deprecations.
- **`no-arbitrary-value` / `no-hardcoded-colors`**: ban categories this rule can't easily express in
  a list. If your ban list is growing into a pattern, those rules might do the job better.

## When to disable it

- **Repos with no ban list**: don't enable it at all — leaving it on with empty options is a no-op
  but adds noise to config review.
- **Per-file legacy exceptions**: prefer
  `// oxlint-disable-next-line tailwindcss/no-restricted-classes` over disabling the rule globally,
  so the rest of the codebase keeps the enforcement.
- **Migration windows** where the ban list flip-flops: drop the rule to `warn`, complete the
  cleanup, then return to `error` once the ban list is stable.
