/**
 * Phase 1 (v1.1) verification: the sort and canonicalize worker services
 * are fail-loud — failures throw `SortServiceError` instead of degrading
 * silently to a heuristic fallback. Callers in DS-dependent rules wrap
 * via `safeGetDS` so the failure surfaces as a single
 * `designSystemUnavailable` diagnostic.
 */

import { beforeEach, describe, expect, test } from 'vitest'
import {
  canonicalizeClassesSync,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'
import { sortClassesSync, resetSortService } from '../../src/design-system/sort-service'
import { SortServiceError } from '../../src/utils/fatal'

const NONEXISTENT_CSS = '/tmp/this-css-does-not-exist-for-fatal-test.css'

describe('sort service — fail-loud', () => {
  beforeEach(() => resetSortService())

  test('throws SortServiceError when the worker cannot load the CSS', () => {
    expect(() => sortClassesSync(NONEXISTENT_CSS, ['flex', 'p-2'])).toThrow(SortServiceError)
  })

  test('subsequent calls for the same path keep throwing (sticky)', () => {
    expect(() => sortClassesSync(NONEXISTENT_CSS, ['flex'])).toThrow(SortServiceError)
    // No retry cost — sticky lastError throws immediately.
    expect(() => sortClassesSync(NONEXISTENT_CSS, ['flex'])).toThrow(SortServiceError)
  })

  test('error carries a hint pointing the user at a remedy', () => {
    try {
      sortClassesSync(NONEXISTENT_CSS, ['flex'])
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SortServiceError)
      expect((err as SortServiceError).hint).toBeTruthy()
    }
  })
})

describe('canonicalize service — fail-loud', () => {
  beforeEach(() => resetCanonicalizeService())

  test('throws SortServiceError when the worker cannot load the CSS', () => {
    expect(() => canonicalizeClassesSync(NONEXISTENT_CSS, ['p-[2px]'], 16)).toThrow(
      SortServiceError,
    )
  })

  test('error carries a hint pointing the user at a remedy', () => {
    try {
      canonicalizeClassesSync(NONEXISTENT_CSS, ['p-[2px]'], 16)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SortServiceError)
      expect((err as SortServiceError).hint).toBeTruthy()
    }
  })
})
