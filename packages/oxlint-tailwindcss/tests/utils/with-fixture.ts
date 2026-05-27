/**
 * v1 requires every DS-dependent rule test to declare its CSS entry point.
 * This helper injects `settings.tailwindcss.entryPoint` into every test
 * case so test files don't have to duplicate it inline on every case.
 */

import { RuleTester } from 'oxlint/plugins-dev'

type RunArgs = Parameters<RuleTester['run']>
type Rule = RunArgs[1]
type Cases = RunArgs[2]
type Case = Cases['valid'] extends (infer V)[] | undefined
  ? V & { settings?: Record<string, unknown> }
  : never

function injectEntryPoint<T extends { settings?: Record<string, unknown> }>(
  cases: T[],
  entryPoint: string,
): T[] {
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
 * `RuleTester.run` wrapper that injects `settings.tailwindcss.entryPoint`
 * into every valid/invalid case. The common case for rule tests where
 * one fixture applies to the whole file.
 */
export function runWithFixture(
  tester: RuleTester,
  ruleName: string,
  rule: Rule,
  entryPoint: string,
  cases: Cases,
): void {
  tester.run(ruleName, rule, {
    valid: injectEntryPoint((cases.valid ?? []) as Case[], entryPoint),
    invalid: injectEntryPoint((cases.invalid ?? []) as Case[], entryPoint),
  })
}

/**
 * One-shot runner bound to a fixture. Each call instantiates a fresh
 * `RuleTester` and applies `runWithFixture`. Useful for integration tests
 * with many small RuleTester blocks all sharing the same fixture.
 */
export function makeFixtureRunner(entryPoint: string) {
  return function run(ruleName: string, rule: Rule, cases: Cases): void {
    runWithFixture(new RuleTester(), ruleName, rule, entryPoint, cases)
  }
}
