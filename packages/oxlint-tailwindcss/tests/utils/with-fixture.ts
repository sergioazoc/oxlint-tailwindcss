/**
 * v1 requires every DS-dependent rule test to declare its CSS entry point.
 * This helper injects `settings.tailwindcss.entryPoint` into every test
 * case so test files don't have to duplicate it inline on every case.
 */

import { RuleTester } from 'oxlint/plugins-dev'

type CaseWithSettings = {
  settings?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * Map a list of test cases, injecting `settings.tailwindcss.entryPoint` into
 * each. An already-set value in the case wins (per-case overrides are rare
 * but useful when validating cross-DS behavior).
 */
export function withFixture<T extends CaseWithSettings>(cases: T[], entryPoint: string): T[] {
  return cases.map((c) => {
    const existingTw =
      typeof c.settings?.tailwindcss === 'object' && c.settings.tailwindcss !== null
        ? (c.settings.tailwindcss as Record<string, unknown>)
        : {}
    return {
      ...c,
      settings: {
        ...c.settings,
        tailwindcss: { entryPoint, ...existingTw },
      },
    }
  })
}

/**
 * `RuleTester.run` wrapper that applies `withFixture(..., entryPoint)` to
 * both `valid` and `invalid` arrays. Convenience for the common case where
 * every test case in the file shares the same fixture.
 */
export function runWithFixture(
  tester: RuleTester,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ruleName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rule: any,
  entryPoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cases: { valid?: any[]; invalid?: any[] },
): void {
  tester.run(ruleName, rule, {
    valid: withFixture(cases.valid ?? [], entryPoint),
    invalid: withFixture(cases.invalid ?? [], entryPoint),
  })
}

/**
 * Create a one-shot runner bound to a fixture. Each call instantiates a fresh
 * `RuleTester`, applies `withFixture(..., entryPoint)`, and runs the rule.
 *
 * Useful when a test file has many small `new RuleTester().run(...)` blocks
 * that all share the same fixture — keeps the call sites tight.
 */
export function makeFixtureRunner(entryPoint: string) {
  return function run(
    ruleName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rule: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cases: { valid?: any[]; invalid?: any[] },
  ): void {
    runWithFixture(new RuleTester(), ruleName, rule, entryPoint, cases)
  }
}
