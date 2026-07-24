# no-conflicting-classes

> Disallow Tailwind CSS classes that generate conflicting CSS properties

## What this rule does

Detects pairs of Tailwind classes on the same element, under the same variant, whose CSS
declarations clash — where one of the two is silently discarded. The comparison is made against the
CSS the design system actually emits, values included: property names alone cannot tell a conflict
from a composition.

A shared property is a conflict only when the declaration that LOSES the cascade carries something
the winner does not reproduce. Which means these are **not** conflicts, and none of them is
special-cased:

- **the same value on both sides** — `mask-b-from-50% mask-b-from-black` share four byte-identical
  declarations, so whoever wins, the result is the same;
- **a `var()` forwarder and the class supplying the variable** — `outline-2` declares
  `outline-style: var(--tw-outline-style)` and carries no value of its own; matching is by the real
  variable name, so a plugin's `--scrollbar-*` behaves exactly like Tailwind's `--tw-*`;
- **a winner that still pulls the loser in** — `drop-shadow-indigo-500` reads the
  `--tw-drop-shadow-size` that `drop-shadow-xl` writes, followed transitively (that is how the
  `from-*` / `via-*` / `to-*` chain composes);
- **a custom property reset to `initial`** — `animate-in` initializes every `--tw-enter-*` for its
  modifiers to override;
- **declarations on different boxes** — `placeholder-*` styles `::placeholder`, `space-x-*` styles
  the children, neither styles the element.

Two classes that declare the same property with the same value are reported as **`redundant`**
instead: not a conflict, but one of them is dead weight. `reportRedundant: false` opts out.

Which class wins is asked of the design system, not inferred from the order you wrote the classes in
— Tailwind's output does not depend on that order. When the position cannot be known (for a class
whose value you wrote, like `w-[10px]`), the diagnostic reports the clash without naming a winner.

Only two compositions cannot be derived from the CSS, and they stay declared in the source with the
reason why: `prose` size variants and `prose` + `max-w-*` (the plugin intends the override and the
emitted CSS is indistinguishable from an accident), and `mask-composite` modes. For a composition
your own plugins produce, use the **`allow`** option rather than waiting for a release.

DS-dependent — requires `settings.tailwindcss.entryPoint`. When the design system can't load, the
rule emits a single fatal `designSystemUnavailable` diagnostic per file instead of silently passing.

## Options

| Option            | Type                             | Default | Description                                                                                                                                         |
| ----------------- | -------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reportRedundant` | `boolean`                        | `true`  | Report two classes that declare the same property with the same value as `redundant`.                                                               |
| `allow`           | `(string \| [string, string])[]` | `[]`    | Patterns to silence. A bare pattern silences any pair involving a matching class; a two-element pattern silences that combination, in either order. |
| `entryPoint`      | `string`                         | —       | Per-rule override of `settings.tailwindcss.entryPoint`.                                                                                             |

```jsonc
{
  "rules": {
    "tailwindcss/no-conflicting-classes": [
      "error",
      {
        // Your plugin composes in a way the emitted CSS cannot show.
        "allow": [["^gutter-thin$", "^gutter-(thumb|track)-"]],
      },
    ],
  },
}
```

## Examples

### ✗ Incorrect

```tsx
// Same property, different value: one of them is discarded
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
