/**
 * The gap #91 reported, and the boundary that keeps it from being noise.
 *
 * Since #78, `enforce-canonical` only rewrites when the emitted CSS is
 * byte-identical, which is right for an autofixer and silently dropped the
 * consistency signal for every value whose token resolves through `var()`. This
 * rule is that signal, report-only.
 *
 * The other half of the file is the boundary. Tailwind compiles ANY number
 * (`w-8.425` is valid CSS), so "has a scale equivalent" is true for practically
 * every length — reporting all of them would just be `no-arbitrary-value` with
 * extra steps. The cut is the granularity Tailwind's own enumerated steps use,
 * derived by the precompute rather than chosen here.
 */

import { resolve } from 'node:path'
import { beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { preferScaleToken } from '../../src/rules/prefer-scale-token'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { makeFixtureRunner, runWithFixture } from '../utils/with-fixture'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const run = makeFixtureRunner(ENTRY_POINT)

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

/** `[written, suggested]` — reported, with the suggestion applied by the editor. */
const SCALE: [string, string][] = [
  // The enumerated steps `enforce-canonical` stopped reporting after #78.
  ['p-[10px]', 'p-2.5'],
  ['gap-[4px]', 'gap-1'],
  ['h-[2rem]', 'h-8'],
  ['mt-[6px]', 'mt-1.5'],
  // The issue's own example. Tailwind compiles `w-35` but never proposes it (35
  // is not one of the steps it enumerates), which is why nothing reported this
  // before — not #78.
  ['w-[140px]', 'w-35'],
  // Whole numbers well past the enumerated range still land on the scale.
  ['top-[400px]', 'top-100'],
]

const TOKENS: [string, string][] = [
  // A named token whose value matches, read off the emitted CSS + the theme.
  ['rounded-[0.5rem]', 'rounded-lg'],
  ['rounded-[2px]', 'rounded-xs'],
  ['basis-[28rem]', 'basis-md'],
]

describe('values that equal a scale step', () => {
  run('prefer-scale-token (scale)', preferScaleToken, {
    valid: [],
    invalid: SCALE.map(([written, suggested]) => ({
      code: `<div className="${written}" />`,
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'preferToken' as const,
          data: { className: written, replacement: suggested },
          suggestions: [
            {
              messageId: 'suggestReplace' as const,
              data: { className: written, replacement: suggested },
              output: `<div className="${suggested}" />`,
            },
          ],
        },
      ],
    })),
  })
})

describe('values that equal a named theme token', () => {
  run('prefer-scale-token (tokens)', preferScaleToken, {
    valid: [],
    invalid: TOKENS.map(([written, suggested]) => ({
      code: `<div className="${written}" />`,
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'preferToken' as const,
          data: { className: written, replacement: suggested },
        },
      ],
    })),
  })
})

describe('the boundary', () => {
  run('prefer-scale-token (valid)', preferScaleToken, {
    valid: [
      // Finer than the granularity Tailwind's own scale uses. Both compile
      // (`w-8.25`, `w-8.425`), and reporting them would make this rule fire on
      // essentially every length.
      { code: '<div className="w-[33px]" />', filename: 'test.tsx' },
      { code: '<div className="w-[33.7px]" />', filename: 'test.tsx' },
      // Byte-identical to a named class → `no-unnecessary-arbitrary-value`'s.
      { code: '<div className="w-[100%]" />', filename: 'test.tsx' },
      { code: '<div className="z-[10]" />', filename: 'test.tsx' },
      { code: '<div className="p-[0px]" />', filename: 'test.tsx' },
      // Not a length, or not on a prefix that reads the scale.
      { code: '<div className="w-[50%]" />', filename: 'test.tsx' },
      { code: '<div className="grid-cols-[18rem_1fr]" />', filename: 'test.tsx' },
      { code: '<div className="content-[attr(data-x)]" />', filename: 'test.tsx' },
      { code: '<div className="bg-[#ff0000]" />', filename: 'test.tsx' },
      // A variable reference has no literal to compare — `prefer-theme-tokens`
      // is the rule that looks at those.
      { code: '<div className="p-(--gutter)" />', filename: 'test.tsx' },
      { code: '<div className="p-[var(--gutter)]" />', filename: 'test.tsx' },
      // Already a token.
      { code: '<div className="p-2.5 rounded-lg" />', filename: 'test.tsx' },
      // `text-sm` also sets `line-height`, so it is NOT what `text-[14px]` says.
      // The precompute drops the whole family for that reason; this locks it.
      { code: '<div className="text-[14px]" />', filename: 'test.tsx' },
    ],
    invalid: [],
  })
})

describe('variants and the ! modifier travel with the class', () => {
  run('prefer-scale-token (modifiers)', preferScaleToken, {
    valid: [],
    invalid: [
      {
        code: '<div className="hover:p-[10px]" />',
        filename: 'test.tsx',
        errors: [
          {
            messageId: 'preferToken',
            data: { className: 'hover:p-[10px]', replacement: 'hover:p-2.5' },
          },
        ],
      },
      {
        code: '<div className="!p-[10px]" />',
        filename: 'test.tsx',
        errors: [
          { messageId: 'preferToken', data: { className: '!p-[10px]', replacement: '!p-2.5' } },
        ],
      },
      {
        code: '<div className="p-[10px]!" />',
        filename: 'test.tsx',
        errors: [
          { messageId: 'preferToken', data: { className: 'p-[10px]!', replacement: 'p-2.5!' } },
        ],
      },
      // Multiline class strings keep their shape through the suggestion.
      {
        code: '<div className={`flex\n  p-[10px]\n  gap-[4px]`} />',
        filename: 'test.tsx',
        errors: [{ messageId: 'preferToken' }, { messageId: 'preferToken' }],
      },
    ],
  })
})

describe('options', () => {
  run('prefer-scale-token (step)', preferScaleToken, {
    valid: [
      // Coarser: 2.5 is no longer a whole number of steps.
      { code: '<div className="p-[10px]" />', filename: 'test.tsx', options: [{ step: 1 }] },
      // Allowed away by prefix.
      {
        code: '<div className="p-[10px]" />',
        filename: 'test.tsx',
        options: [{ allow: ['p-'] }],
      },
    ],
    invalid: [
      // Finer: quarter steps opt in, which is the extension the option exists for.
      {
        code: '<div className="w-[33px]" />',
        filename: 'test.tsx',
        options: [{ step: 0.25 }],
        errors: [
          { messageId: 'preferToken', data: { className: 'w-[33px]', replacement: 'w-8.25' } },
        ],
      },
      // A coarser step never suppresses a NAMED token: that match is by value,
      // not by granularity.
      {
        code: '<div className="rounded-[0.5rem]" />',
        filename: 'test.tsx',
        options: [{ step: 1 }],
        errors: [
          {
            messageId: 'preferToken',
            data: { className: 'rounded-[0.5rem]', replacement: 'rounded-lg' },
          },
        ],
      },
    ],
  })
})

describe('without an entry point', () => {
  // DS-dependent: the equivalences come entirely from the design system, so
  // there is no static fallback to degrade to.
  runWithFixture(new RuleTester(), 'prefer-scale-token (no DS)', preferScaleToken, '', {
    valid: [],
    invalid: [
      {
        code: '<div className="p-[10px]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'designSystemUnavailable' }],
      },
    ],
  })
})
