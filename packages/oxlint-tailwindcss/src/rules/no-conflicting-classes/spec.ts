/**
 * Declarative spec for `no-conflicting-classes`.
 *
 * The rule's logic stays in `../no-conflicting-classes.ts`; this module holds
 * the data-only tables it consumes (plus a `reason` string for each entry).
 * The reason field is what the docs site renders in the rule's reference
 * page so users can see at a glance why a given combination composes.
 *
 * v1 extracted these tables out of the rule body so the docs build can
 * import them as plain data without pulling in oxlint's plugin runtime.
 */

export interface ComplementaryGroup {
  /**
   * Regex that matches utilities that may compose within the group. If the
   * regex has a capture group, two utilities match-compose ONLY when their
   * captured prefixes differ (e.g. `from-red-500` and `to-blue-500` compose,
   * but `from-red-500` and `from-blue-500` fall through to the overlap
   * check and end up flagged as conflicting). No capture group means "any
   * pair that matches this regex composes" (e.g. `prose prose-sm`).
   */
  pattern: RegExp
  /** Human-readable explanation rendered by the docs site. */
  reason: string
}

export interface CompositionPair {
  /** Regex for one side of the pair. */
  a: RegExp
  /** Regex for the other side; orientation doesn't matter when matching. */
  b: RegExp
  /** Human-readable explanation rendered by the docs site. */
  reason: string
}

export const COMPLEMENTARY_GROUPS: readonly ComplementaryGroup[] = [
  {
    pattern: /^(from|via|to)-/,
    reason:
      'Gradient stops (`from-*`, `via-*`, `to-*`) share `--tw-gradient-stops`; different prefixes compose, same prefix conflicts.',
  },
  {
    pattern: /^(transition|duration|ease|delay)(?:-|$)/,
    reason:
      '`transition-*` composes with `duration-*`, `ease-*`, `delay-*` — `transition-all` itself has no `--tw-*` vars so the heuristic misses it.',
  },
  {
    pattern: /^-?(translate|scale|rotate|skew)-/,
    reason:
      'Transform axes (translate / scale / rotate / skew) compose into a single `transform`; the overlap is not captured in `cssProps`.',
  },
  {
    pattern: /^-?mask-((?:linear|radial|conic|[trblxy])(?:-(?:from|via|to|at))?)(?:-|$)/,
    reason:
      'Mask gradients: different families (e.g. `mask-linear-*` vs `mask-radial-*`) or roles (`from`/`via`/`to`/`at`) compose; same family+role conflicts.',
  },
  {
    pattern: /^prose(?:-|$)/,
    reason:
      '`prose` + `prose-sm`/`prose-lg`/`prose-xl` modify the same scope and are designed to compose.',
  },
]

export const COMPOSITION_PAIRS: readonly CompositionPair[] = [
  {
    a: /^text-/,
    b: /^leading-/,
    reason: '`text-*` sets line-height via its size token; `leading-*` overrides it.',
  },
  {
    a: /^text-/,
    b: /^tracking-/,
    reason: '`text-*` may set letter-spacing via its size token; `tracking-*` overrides it.',
  },
  {
    a: /^border(?:-[0-9]|$)/,
    b: /^border-(?:solid|dashed|dotted|double|hidden|none)$/,
    reason: '`border-*` (width) composes with `border-{solid,dashed,…}` (style).',
  },
  {
    a: /^divide-/,
    b: /^border(?:-[trblxyse])?-/,
    reason: '`divide-*` styles direct children; `border-*` styles the element itself.',
  },
  {
    a: /^prose(?:-|$)/,
    b: /^max-w-/,
    reason: '`prose` sets a default max-width; `max-w-*` overrides it.',
  },
  {
    a: /^animate-in$/,
    b: /^(?:fade|spin|zoom|blur)-in(?:-|$)|^slide-in-from-/,
    reason:
      '`animate-in` initializes all `--tw-enter-*` vars; `*-in` modifiers each override one. (`tailwindcss-animate` / `tw-animate-css`.)',
  },
  {
    a: /^animate-out$/,
    b: /^(?:fade|spin|zoom|blur)-out(?:-|$)|^slide-out-to-/,
    reason:
      '`animate-out` initializes all `--tw-exit-*` vars; `*-out` modifiers each override one.',
  },
  {
    a: /^mask-(?:add|subtract|intersect|exclude)$/,
    b: /^-?mask-(?:linear|radial|conic|[trblxy])-/,
    reason:
      '`mask-{add,subtract,intersect,exclude}` are mask-composite modes that compose with mask-gradient utilities.',
  },
]
