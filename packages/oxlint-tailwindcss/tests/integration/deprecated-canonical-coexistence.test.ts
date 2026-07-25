/**
 * One class, one diagnostic: `no-deprecated-classes` vs `enforce-canonical`.
 *
 * Tailwind's own `canonicalizeCandidates` rewrites the v3 spellings
 * (`bg-gradient-to-r` → `bg-linear-to-r`, `flex-grow` → `grow`), and the
 * precompute feeds them into the canonical map so `enforce-canonical` sees them.
 * `no-deprecated-classes` reported the same classes from a hardcoded table, so
 * every one of them produced TWO errors carrying the SAME fix.
 *
 * The rename map now comes from the design system, and it decides ownership:
 * `no-deprecated-classes` reports these (its message is the actionable one — it
 * says the class is deprecated, not merely non-canonical), and
 * `enforce-canonical` stays quiet about them.
 *
 * The split is not "everything in the canonical map": `start-2` canonicalizes to
 * `inset-s-2` and is NOT deprecated — it is what Tailwind's docs use today — so
 * that one goes the other way. Those two directions are what this file pins down.
 */

import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { noDeprecatedClasses, DEPRECATED_MAP } from '../../src/rules/no-deprecated-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { makeFixtureRunner } from '../utils/with-fixture'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const run = makeFixtureRunner(ENTRY_POINT)

/** v3 spelling → v4 name, as reported by the design system. */
const RENAMES: [string, string][] = [
  ['flex-grow', 'grow'],
  ['flex-grow-0', 'grow-0'],
  ['flex-shrink', 'shrink'],
  ['flex-shrink-0', 'shrink-0'],
  ['overflow-ellipsis', 'text-ellipsis'],
  ['decoration-slice', 'box-decoration-slice'],
  ['decoration-clone', 'box-decoration-clone'],
  ['bg-gradient-to-r', 'bg-linear-to-r'],
  ['bg-gradient-to-tl', 'bg-linear-to-tl'],
  // Renames the hardcoded map never had, which the derived one picks up.
  ['break-words', 'wrap-break-word'],
  ['order-none', 'order-0'],
  ['bg-left-top', 'bg-top-left'],
  ['object-right-bottom', 'object-bottom-right'],
]

/** Canonicalized but NOT deprecated: current spellings that aren't canonical. */
const CANONICAL_ONLY: [string, string][] = [
  ['start-2', 'inset-s-2'],
  ['end-4', 'inset-e-4'],
]

describe('the design system is the source of truth for what is deprecated', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  it('derives every rename the hardcoded fallback knows, and more', () => {
    const { cache } = getLoadedDesignSystem(ENTRY_POINT)
    expect(cache.hasDeprecatedMap).toBe(true)

    // The fallback table must never claim something the design system doesn't.
    for (const [from, to] of Object.entries(DEPRECATED_MAP)) {
      expect(cache.deprecatedReplacement(from), from).toBe(to)
    }
    for (const [from, to] of RENAMES) {
      expect(cache.deprecatedReplacement(from), from).toBe(to)
    }
  })

  it('does not call a merely non-canonical spelling deprecated', () => {
    const { cache } = getLoadedDesignSystem(ENTRY_POINT)
    for (const [from, canonical] of CANONICAL_ONLY) {
      expect(cache.deprecatedReplacement(from), from).toBeNull()
      expect(cache.canonicalize(from), from).toBe(canonical)
    }
  })
})

run('no-deprecated-classes owns the renames', noDeprecatedClasses, {
  valid: CANONICAL_ONLY.map(([cls]) => ({
    code: `<div className="${cls}" />`,
    filename: 'test.tsx',
  })),
  invalid: RENAMES.map(([from, to]) => ({
    code: `<div className="${from}" />`,
    filename: 'test.tsx',
    errors: [{ messageId: 'deprecated' }],
    output: `<div className="${to}" />`,
  })),
})

run('enforce-canonical stays quiet about them', enforceCanonical, {
  valid: [
    ...RENAMES.map(([cls]) => ({ code: `<div className="${cls}" />`, filename: 'test.tsx' })),
    // Variants and `!` travel with the class, so the hand-off has to survive both.
    { code: '<div className="hover:break-words" />', filename: 'test.tsx' },
    { code: '<div className="!break-words" />', filename: 'test.tsx' },
    { code: '<div className="break-words!" />', filename: 'test.tsx' },
  ],
  invalid: CANONICAL_ONLY.map(([from, to]) => ({
    code: `<div className="${from}" />`,
    filename: 'test.tsx',
    errors: [{ messageId: 'nonCanonical' }],
    output: `<div className="${to}" />`,
  })),
})

describe('without an entry point', () => {
  const ruleTester = new RuleTester()

  // No design system means no derived map, so the rule falls back to the
  // hardcoded table and reports exactly what it reported before this change —
  // including nothing at all for the renames only the derived map knows.
  ruleTester.run('no-deprecated-classes (static fallback)', noDeprecatedClasses, {
    valid: [
      { code: '<div className="break-words" />', filename: 'test.tsx' },
      { code: '<div className="order-none" />', filename: 'test.tsx' },
      { code: '<div className="bg-left-top" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="flex-grow" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'deprecated' }],
        output: '<div className="grow" />',
      },
      {
        code: '<div className="bg-gradient-to-r" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'deprecated' }],
        output: '<div className="bg-linear-to-r" />',
      },
    ],
  })
})
