/**
 * Tailwind v4 project prefix (`@import "tailwindcss" prefix(tw)`) — issue #29.
 *
 * Before the fix, the design system precomputed empty under a prefix and
 * `no-unknown-classes` flagged every class as invalid. These tests load a real
 * prefixed design system end-to-end and lock down each affected rule:
 * validation (strict — prefixed valid, unprefixed Tailwind utilities flagged,
 * component classes always valid), variant reordering (prefix stays first),
 * sorting, canonicalization and conflict detection — all preserving the prefix.
 */

import { resolve } from 'node:path'
import { beforeAll, afterAll } from 'vitest'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'
import { consistentVariantOrder } from '../../src/rules/consistent-variant-order'
import { enforceSortOrder } from '../../src/rules/enforce-sort-order'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { makeFixtureRunner } from '../utils/with-fixture'

const ENTRY_POINT = resolve(__dirname, '../fixtures/with-prefix.css')
const COMPONENTS_ENTRY_POINT = resolve(__dirname, '../fixtures/with-prefix-components.css')

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

afterAll(() => {
  resetDesignSystem()
})

const run = makeFixtureRunner(ENTRY_POINT)
const runComponents = makeFixtureRunner(COMPONENTS_ENTRY_POINT)

// ── no-unknown-classes (the core of #29) ────────────────────────────────────

run('no-unknown-classes (prefix)', noUnknownClasses, {
  valid: [
    // Prefixed utilities are valid — this is exactly what #29 reported broken.
    { code: '<div className="tw:flex tw:items-center" />', filename: 'test.tsx' },
    { code: '<div className="tw:bg-blue-500 tw:text-white tw:p-4" />', filename: 'test.tsx' },
    { code: '<div className="tw:hover:underline" />', filename: 'test.tsx' },
    { code: '<div className="tw:-mt-4" />', filename: 'test.tsx' },
    { code: '<div className="tw:bg-[#123456]" />', filename: 'test.tsx' },
    { code: '<div className="tw:bg-blue-500/50" />', filename: 'test.tsx' },
    { code: '<div className="tw:!flex tw:items-center!" />', filename: 'test.tsx' },
  ],
  invalid: [
    // Tailwind utility without the required prefix → missing-prefix (dead CSS).
    {
      code: '<div className="flex" />',
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'missingPrefix',
          data: { className: 'flex', prefix: 'tw', suggestion: 'tw:flex' },
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'flex', replacement: 'tw:flex' },
              output: '<div className="tw:flex" />',
            },
          ],
        },
      ],
    },
    {
      code: '<div className="hover:flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'missingPrefix' }],
    },
    // Genuinely unknown, even with the prefix.
    {
      code: '<div className="tw:not-a-real-class" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknown' }],
    },
  ],
})

runComponents('no-unknown-classes (prefix + components)', noUnknownClasses, {
  valid: [
    // Component classes carry NO prefix and must stay valid.
    { code: '<div className="btn" />', filename: 'test.tsx' },
    { code: '<div className="tw:flex btn" />', filename: 'test.tsx' },
  ],
  invalid: [],
})

// ── consistent-variant-order (prefix must remain first) ──────────────────────

run('consistent-variant-order (prefix)', consistentVariantOrder, {
  valid: [
    // Single real variant after the prefix — nothing to reorder.
    { code: '<div className="tw:hover:flex" />', filename: 'test.tsx' },
    // Already correctly ordered per the DS (hover before sm), prefix first.
    { code: '<div className="tw:hover:sm:flex" />', filename: 'test.tsx' },
  ],
  invalid: [
    // Must reorder to tw:hover:sm:flex — the prefix stays FIRST, never
    // hover:tw:sm:flex (which would produce no CSS).
    {
      code: '<div className="tw:sm:hover:flex" />',
      filename: 'test.tsx',
      output: '<div className="tw:hover:sm:flex" />',
      errors: [
        {
          messageId: 'wrongOrder',
          data: { className: 'tw:sm:hover:flex', replacement: 'tw:hover:sm:flex' },
        },
      ],
    },
  ],
})

// ── enforce-sort-order (default = worker, strict = cache) ─────────────────────

run('enforce-sort-order default (prefix)', enforceSortOrder, {
  valid: [{ code: '<div className="tw:flex tw:text-red-500" />', filename: 'test.tsx' }],
  invalid: [
    {
      code: '<div className="tw:text-red-500 tw:flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unsorted' }],
      output: '<div className="tw:flex tw:text-red-500" />',
    },
  ],
})

run('enforce-sort-order strict (prefix)', enforceSortOrder, {
  valid: [
    {
      code: '<div className="tw:flex tw:text-red-500" />',
      filename: 'test.tsx',
      options: [{ mode: 'strict' }],
    },
  ],
  invalid: [
    {
      code: '<div className="tw:text-red-500 tw:flex" />',
      filename: 'test.tsx',
      options: [{ mode: 'strict' }],
      errors: [{ messageId: 'unsorted' }],
      output: '<div className="tw:flex tw:text-red-500" />',
    },
  ],
})

// ── enforce-canonical (preserves the prefix) ─────────────────────────────────

run('enforce-canonical (prefix)', enforceCanonical, {
  valid: [{ code: '<div className="tw:grow" />', filename: 'test.tsx' }],
  invalid: [
    {
      code: '<div className="tw:flex-grow" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="tw:grow" />',
    },
  ],
})

// ── no-conflicting-classes (works on the unprefixed utility) ─────────────────

run('no-conflicting-classes (prefix)', noConflictingClasses, {
  valid: [{ code: '<div className="tw:flex tw:text-red-500" />', filename: 'test.tsx' }],
  invalid: [
    {
      code: '<div className="tw:flex tw:block" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
  ],
})
