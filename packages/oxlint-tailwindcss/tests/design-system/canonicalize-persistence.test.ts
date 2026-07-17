import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canonicalizeClassesSync,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'
import { cacheArtifactPaths } from '../../src/design-system/sync-loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

/**
 * The canonicalize service persists its per-class cache to disk next to the
 * design-system precompute artifact (content-hash keyed, so it invalidates
 * together with the design system). A fresh process — every real `oxlint`
 * invocation — then serves previously-seen dynamic classes from disk instead
 * of paying a synchronous worker round-trip per unique class.
 *
 * `resetCanonicalizeService()` clears the in-memory cache AND the persistence
 * state, so a reset + call cycle is the closest in-process equivalent of a
 * fresh oxlint run.
 */

// Derived the same way as the service does: DS artifact path + canon suffix.
function persistedCachePath(rem?: number): string {
  const { json } = cacheArtifactPaths(ENTRY_POINT)
  const remKey = rem === undefined ? 'default' : String(rem)
  return json.replace(/\.json$/, `.canon-v1-${remKey}.json`)
}

describe('canonicalize cache disk persistence', () => {
  beforeEach(() => {
    resetCanonicalizeService()
    rmSync(persistedCachePath(), { force: true })
    rmSync(persistedCachePath(16), { force: true })
  })

  afterEach(() => {
    resetCanonicalizeService()
    rmSync(persistedCachePath(), { force: true })
    rmSync(persistedCachePath(16), { force: true })
  })

  it('writes canonicalized classes to a content-hash-keyed file', () => {
    const [canonical] = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]'])

    const persisted = JSON.parse(readFileSync(persistedCachePath(), 'utf-8')) as Record<
      string,
      string
    >
    expect(persisted['p-[16px]']).toBe(canonical)
  })

  it('serves identical results after a reset (fresh-process equivalent)', () => {
    const first = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]', 'max-w-[400px]'])

    resetCanonicalizeService()
    const second = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]', 'max-w-[400px]'])

    expect(second).toEqual(first)
  })

  it('isolates rem settings in separate cache files', () => {
    canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]'], 16)

    const persisted = JSON.parse(readFileSync(persistedCachePath(16), 'utf-8')) as Record<
      string,
      string
    >
    expect(Object.keys(persisted)).toContain('p-[16px]')
  })

  it('survives a corrupt cache file', () => {
    writeFileSync(persistedCachePath(), '{ not json')

    const [canonical] = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]'])
    expect(typeof canonical).toBe('string')
    // The corrupt file is replaced by a valid one on the next flush.
    const persisted = JSON.parse(readFileSync(persistedCachePath(), 'utf-8')) as Record<
      string,
      string
    >
    expect(persisted['p-[16px]']).toBe(canonical)
  })

  it('ignores persisted entries from a poisoned file with non-string values', () => {
    writeFileSync(persistedCachePath(), JSON.stringify({ 'p-[16px]': 42 }))

    const [canonical] = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]'])
    expect(typeof canonical).toBe('string')
    expect(canonical).not.toBe(42)
  })
})
