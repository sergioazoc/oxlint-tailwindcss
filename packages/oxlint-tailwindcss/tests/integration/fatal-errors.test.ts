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
import {
  resolveDeclarationsSync,
  resetDeclarationService,
  validateClassesSync,
} from '../../src/design-system/declaration-service'
import { DesignSystemCache } from '../../src/design-system/cache'
import { type PrecomputedData } from '../../src/design-system/sync-loader'
import { makeDeclarations } from '../utils/declarations'
import { DS_UNAVAILABLE_MESSAGE_ID, SortServiceError } from '../../src/utils/fatal'
import { noDarkWithoutLight } from '../../src/rules/no-dark-without-light'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'

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

/**
 * The declaration service used to swallow its own failures.
 *
 * It returned "no information" instead of throwing, which was defensible while
 * `no-conflicting-classes` was the only caller — no declarations, no comparison,
 * no diagnostic. It stopped being defensible when `no-unknown-classes` started
 * asking it about VALIDITY: there, silence sends the rule back to the tolerant
 * heuristic, so a dead worker quietly reinstates the false negatives the service
 * exists to remove and the run still passes.
 */
describe('declaration service — fail-loud', () => {
  beforeEach(() => resetDeclarationService())

  function bareCache(): DesignSystemCache {
    const data: PrecomputedData = {
      validClasses: ['flex'],
      canonical: {},
      order: { flex: '100' },
      cssDeclarations: makeDeclarations({ flex: [['', 'display', 'flex']] }),
      variantOrder: {},
      componentClasses: [],
      arbitraryEquivalents: {},
      prefix: '',
    }
    return DesignSystemCache.fromPrecomputed(data)
  }

  test('resolveDeclarationsSync throws when the worker cannot load the CSS', () => {
    expect(() => resolveDeclarationsSync(NONEXISTENT_CSS, bareCache(), ['p-[5px]'])).toThrow(
      SortServiceError,
    )
  })

  test('validateClassesSync throws instead of answering "unknown"', () => {
    expect(() => validateClassesSync(NONEXISTENT_CSS, bareCache(), ['bg-red-5000'])).toThrow(
      SortServiceError,
    )
  })

  test('the error carries a hint, like the other two services', () => {
    try {
      validateClassesSync(NONEXISTENT_CSS, bareCache(), ['bg-red-5000'])
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(SortServiceError)
      expect((err as SortServiceError).hint).toBeTruthy()
    }
  })

  test('the DS-dependent callers can surface it, and the DS-optional one cannot', () => {
    // Which posture each rule takes is not a matter of taste: a rule that may
    // report `designSystemUnavailable` declares that messageId, and one that may
    // not simply does not have it. oxlint rejects reporting an undeclared
    // messageId, so this is the guarantee itself, not a proxy for it.
    expect(noConflictingClasses.meta?.messages).toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
    expect(noUnknownClasses.meta?.messages).toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
    expect(noDarkWithoutLight.meta?.messages).not.toHaveProperty(DS_UNAVAILABLE_MESSAGE_ID)
  })
})
