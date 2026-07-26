/**
 * Guard for the rules that rewrite one class into another NAMED class.
 *
 * `enforce-logical`, `enforce-physical` and `no-deprecated-classes` build their
 * replacement from a name table, and none of them used to check that the class
 * they propose exists in THIS project's design system: a project that defines
 * `@utility ml-huge` got an autofix to `ms-huge`, which emits no CSS at all. The
 * fix is applied, the style silently disappears, and the only trace is a
 * `no-unknown-classes` diagnostic — if that rule is even on.
 *
 * It is not used by the rules whose replacement is an arbitrary VALUE
 * (`enforce-negative-arbitrary-values`, `enforce-consistent-variable-syntax`):
 * there the guard could not answer anything, because Tailwind takes an arbitrary
 * value verbatim, so `x-[-5px]` compiles whenever `-x-[5px]` does. Those two stay
 * purely syntactic, as their docs say.
 *
 * The check is deliberately one-sided: with no design system available every
 * replacement passes, which is exactly today's behaviour. These rules are
 * DS-OPTIONAL and must keep working with no `entryPoint` configured.
 */

import type { DesignSystemCache } from '../design-system/cache'

/**
 * Returns a predicate that answers "would this replacement produce CSS?".
 *
 * `cache.isValid` is the tolerant validity check, so it accepts arbitrary values
 * (`foo-[5px]`) it cannot verify. That is the right posture here: a rewrite of an
 * already-invalid class is `no-unknown-classes`' business, and this guard only
 * has to stop a rewrite from INTRODUCING an invalid class.
 */
export function makeReplacementGuard(
  cache: DesignSystemCache | null,
): (replacement: string) => boolean {
  if (!cache) return () => true
  return (replacement) => cache.isValid(replacement)
}
