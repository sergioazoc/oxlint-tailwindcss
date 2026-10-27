import { resolve } from 'node:path'
import { RuleTester } from 'oxlint/plugins-dev'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { noRestrictedClasses } from '../../src/rules/no-restricted-classes'
import { makeFixtureRunner } from '../utils/with-fixture'

/**
 * #239: a literal indexed where it's used, `{ ok: '…', error: '…' }[status]`,
 * evaluates to one of its values, so its values are classes and its keys never
 * are. And `x ?? 'a'` / `x || 'a'` can evaluate to either side, where
 * `cond && 'a'` is only ever its right. `no-restricted-classes` shows exactly
 * what is extracted: it reports every listed class it is handed.
 */
const restricted = (classes: string[]) => [{ classes }]
const report = (n: number) =>
  Array.from({ length: n }, () => ({ messageId: 'restricted' as const }))

new RuleTester().run('indexed literals and logical operands (#239)', noRestrictedClasses, {
  valid: [
    // The keys of an indexed object are names, never classes.
    {
      code: 'cn({ "bg-red-500": "flex" }[status])',
      filename: 'test.tsx',
      options: restricted(['bg-red-500']),
    },
    // `cond && 'a'`: the left side is the condition.
    {
      code: 'cn("bg-red-500" && "flex")',
      filename: 'test.tsx',
      options: restricted(['bg-red-500']),
    },
    // A member access on anything but a literal has nothing to read.
    {
      code: 'cn(TONES[status], props.className)',
      filename: 'test.tsx',
      options: restricted(['bg-red-500']),
    },
  ],
  invalid: [
    {
      code: 'cn("size-2", { ok: "bg-green-500", error: "bg-red-500" }[status])',
      filename: 'test.tsx',
      options: restricted(['bg-green-500', 'bg-red-500']),
      errors: report(2),
    },
    {
      code: '<span className={{ ok: "bg-green-500", error: "bg-red-500" }[status]} />',
      filename: 'test.tsx',
      options: restricted(['bg-red-500']),
      errors: report(1),
    },
    {
      code: '<span className={({ ok: "bg-red-500" } as const)[status]} />',
      filename: 'test.tsx',
      options: restricted(['bg-red-500']),
      errors: report(1),
    },
    // A value may itself be a ternary, or an object `cn` reads the keys of.
    {
      code: 'cn({ a: on ? "bg-red-500" : "flex", b: { "hidden": on } }[k])',
      filename: 'test.tsx',
      options: restricted(['bg-red-500', 'hidden']),
      errors: report(2),
    },
    {
      code: '<span className={["p-2", "bg-red-500"][i]} />',
      filename: 'test.tsx',
      options: restricted(['bg-red-500']),
      errors: report(1),
    },
    // `??` and `||`: both sides.
    {
      code: 'cn({ ok: "bg-green-500" }[status] ?? "bg-red-500")',
      filename: 'test.tsx',
      options: restricted(['bg-green-500', 'bg-red-500']),
      errors: report(2),
    },
    {
      code: 'cn(custom || "bg-red-500", "flex" || fallback)',
      filename: 'test.tsx',
      options: restricted(['bg-red-500', 'flex']),
      errors: report(2),
    },
  ],
})

// The values are alternatives: one is picked at runtime, so they never
// conflict with each other, the way a ternary's branches don't.
makeFixtureRunner(resolve(__dirname, '../fixtures/default.css'))(
  'indexed literals: values are alternatives',
  noConflictingClasses,
  {
    valid: [
      {
        code: '<span className={{ ok: "bg-green-500", error: "bg-red-500" }[status]} />',
        filename: 'test.tsx',
      },
      { code: 'cn(["p-2", "p-4"][i])', filename: 'test.tsx' },
    ],
    invalid: [],
  },
)
