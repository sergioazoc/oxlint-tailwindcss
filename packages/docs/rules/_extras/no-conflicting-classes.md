## What this rule does

Detects pairs of Tailwind classes on the same element that write to the same CSS properties under
the same variant — the kind of conflict where the second class silently wins and the first one is
dead weight. Reporting happens at the CSS-property level (not by textual pattern): the rule asks the
design system what each class produces, then compares the property sets.

To avoid false positives on utilities that share properties on purpose, the rule has two escape
hatches:

- **`COMPLEMENTARY_GROUPS`** — regex families whose members are designed to compose, e.g. gradient
  stops (`from-*` / `via-*` / `to-*` share `--tw-gradient-stops`), transition pieces, transform
  axes, mask gradients, `prose` size modifiers.
- **`COMPOSITION_PAIRS`** — explicit pairs that compose despite property overlap (e.g. `text-*` and
  `leading-*`, `border-*` width and `border-{solid,dashed,…}` style, `divide-*` styling children
  while `border-*` styles the element, `animate-in` initializing the `--tw-enter-*` vars that its
  modifiers override).

It also recognizes two structural patterns automatically: composition via disjoint CSS custom
properties (so `shadow-*` and `ring-*` end up in the same `box-shadow` without colliding) and
narrowing overrides, where the later class's property set is a strict subset of the earlier one
(`size-4 h-6`, `rounded-t-lg rounded-tl-sm`, `truncate text-clip`).

DS-dependent — requires `settings.tailwindcss.entryPoint`. When the design system can't load, the
rule emits a single fatal `designSystemUnavailable` diagnostic per file instead of silently passing.

## Options

(no options beyond `entryPoint`, which can also be set globally via
`settings.tailwindcss.entryPoint`.)

## Examples

### ✗ Incorrect

```tsx
// Same property, second wins
<div className="text-red-500 text-blue-500" />

// Conflict survives across variants when both classes share the same one
<div className="hover:bg-red-500 hover:bg-blue-500" />

// `!important` doesn't help — same property, still a conflict
<div className="!text-red-500 !text-blue-500" />

// Same gradient role conflicts (`from-` + `from-`); different roles compose
<div className="from-red-500 from-blue-500" />

// Asymmetric narrowing: wider class AFTER the narrower one clobbers it
<div className="h-6 size-4" />
```

### ✓ Correct

```tsx
// Different properties
<div className="flex items-center" />

// Different variants — applied under different conditions
<div className="hover:bg-red-500 focus:bg-blue-500" />

// Gradient stops are complementary
<div className="from-blue-500 via-purple-500 to-pink-500" />

// `shadow-*` + `ring-*` compose via disjoint --tw-* custom properties
<div className="shadow-lg ring-1 ring-offset-2" />

// Narrowing: `size-4` then `h-6` refines one axis
<div className="size-4 h-6" />
```

## Interactions with other rules

- **`no-duplicate-classes`**: complementary. Duplicates are the exact same class repeated; conflicts
  are different classes that hit the same property. Keep both rules on.
- **`enforce-sort-order`**: ordering changes which class wins, but it doesn't make conflicts
  disappear. Run this rule first so the diagnostic points at the real overlap rather than chasing
  whichever class happens to be last.
- **`no-deprecated-classes`**: a deprecated alias and its modern equivalent (`flex-grow` + `grow`)
  will trip this rule on the property level. Fixing the deprecation usually resolves the conflict.
- **`enforce-canonical`**: rewriting to canonical forms collapses trivially-aliased pairs before
  they reach this rule.

## When to disable it

- **Generated class lists** where the order is meaningful and you rely on "last wins" semantics
  intentionally (e.g. a base + override pattern in a design system primitive). Prefer extracting the
  override into a `cn()`/`twMerge()` call so the conflict becomes explicit.
- **Codebases where many false positives stem from missing entries in `COMPLEMENTARY_GROUPS` /
  `COMPOSITION_PAIRS`**: open an issue rather than disabling — the tables are the supported
  extension point.
- **Tests / fixtures** that intentionally build conflicting class strings to exercise other tooling.
