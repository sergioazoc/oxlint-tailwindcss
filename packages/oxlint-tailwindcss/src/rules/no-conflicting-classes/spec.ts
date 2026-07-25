/**
 * The exceptions `no-conflicting-classes` cannot derive.
 *
 * The rule decides conflicts by comparing the CSS the design system actually
 * emits (see `decide.ts`): equal declarations don't clash, a `var()` forwarder
 * doesn't clash with the class supplying the variable, and declarations on
 * different boxes never clash. That mechanism replaced the regex tables that
 * used to enumerate composing families — gradients, transitions, transform axes,
 * masks, `text-*`/`leading-*`, `text-*`/`tracking-*`, `divide-*`/`border-*` — all
 * of which are now derived, along with the `animate-in`/`animate-out` families
 * whose modifiers reset `--tw-enter-*`/`--tw-exit-*` to `initial`.
 *
 * What is left is plugin INTENT: pairs whose values genuinely differ, where one
 * deliberately overrides the other and no comparison of the generated CSS can
 * tell that apart from an accident. Every entry must say why it cannot be
 * derived; if a future entry can be, it belongs in `decide.ts` instead.
 *
 * Users who need to silence a combination this table doesn't cover should not
 * wait for a release — that is what the rule's `allow` option is for.
 */

export interface ComplementaryGroup {
  /**
   * Regex that matches utilities that may compose within the group. If the
   * regex has a capture group, two utilities match-compose ONLY when their
   * captured prefixes differ. No capture group means "any pair that matches this
   * regex composes" (e.g. `prose prose-sm`).
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
    // NOT DERIVABLE: `prose` and `prose-sm` both declare `font-size` and
    // `line-height` on the element with different values, so the generated CSS
    // is indistinguishable from a real clobber. That `prose-sm` is *meant* to
    // win exists only in the plugin's design.
    pattern: /^prose(?:-|$)/,
    reason:
      '`prose` + `prose-sm`/`prose-lg`/`prose-xl` modify the same scope and are designed to compose.',
  },
]

export const COMPOSITION_PAIRS: readonly CompositionPair[] = [
  {
    // NOT DERIVABLE: `prose` sets `max-width: 65ch` and `max-w-*` sets another
    // length. A real override, intended, with no var() or equal-value trace.
    a: /^prose(?:-|$)/,
    b: /^max-w-/,
    reason: '`prose` sets a default max-width; `max-w-*` overrides it.',
  },
  {
    // NOT DERIVABLE (candidate entry under evaluation).
    a: /^prose(?:-|$)/,
    b: /^(?:text-|leading-)/,
    reason:
      '`prose` sets default typographic values on the element; `text-*`/`leading-*` override them.',
  },
  {
    // NOT DERIVABLE: every mask-gradient utility emits a literal
    // `mask-composite: intersect`, and `mask-add` overrides it with `add`. The
    // values differ and neither reads a variable, so nothing in the CSS says
    // `intersect` was a default the user is deliberately replacing.
    a: /^mask-(?:add|subtract|intersect|exclude)$/,
    b: /^-?mask-(?:linear|radial|conic|[trblxy])-/,
    reason:
      '`mask-{add,subtract,intersect,exclude}` are mask-composite modes that compose with mask-gradient utilities.',
  },
]
