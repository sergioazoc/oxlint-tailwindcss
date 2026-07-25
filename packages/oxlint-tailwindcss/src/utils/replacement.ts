/**
 * Guard for the rules that rewrite one class into another.
 *
 * `enforce-logical`, `enforce-physical`, `enforce-negative-arbitrary-values`,
 * `enforce-consistent-variable-syntax` and `no-deprecated-classes` all build
 * their replacement from a name table. None of them used to check that the class
 * they propose exists in THIS project's design system, so a project that defines
 * `@utility ml-huge` got an autofix to `ms-huge` — a class that emits no CSS at
 * all. The fix is applied, the style silently disappears, and the only trace is
 * a `no-unknown-classes` diagnostic (if that rule is even on).
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
