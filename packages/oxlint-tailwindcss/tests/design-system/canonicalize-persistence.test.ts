import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import {
  canonicalizeClassesSync,
  FLUSH_THRESHOLD,
  persistFileFor,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

/**
 * The canonicalize service persists its per-class cache to disk next to the
 * design-system precompute artifact. The filename is keyed by the DS content
 * hash AND the canonicalization logic hash, so it self-invalidates when either
 * changes — no stale value can reach an autofix. A fresh process (every real
 * `oxlint` invocation) then serves previously-seen dynamic classes from disk
 * instead of paying a synchronous worker round-trip per unique class.
 *
 * `resetCanonicalizeService()` clears the in-memory cache AND the persistence
 * state, so a reset + call cycle is the closest in-process equivalent of a
 * fresh oxlint run.
 */

const cachePath = (rem?: number) => persistFileFor(ENTRY_POINT, rem) as string

/** Persisted shape: Record<class, [canonical, safe]>. */
type Persisted = Record<string, [string, boolean]>
const readPersisted = (rem?: number) =>
  JSON.parse(readFileSync(cachePath(rem), 'utf-8')) as Persisted

// Enough distinct arbitrary classes to cross FLUSH_THRESHOLD in one call, so a
// flush actually happens (a sub-threshold batch is intentionally not flushed).
const manyArbitrary = (n = FLUSH_THRESHOLD + 4) =>
  Array.from({ length: n }, (_, i) => `p-[${i + 1}px]`)

/** Remove every `.canon-*` file this fixture may have produced (all rems/hashes). */
function cleanCanonFiles(): void {
  const dir = dirname(cachePath())
  const prefix = basename(cachePath()).replace(/\.canon-.*$/, '.canon-')
  try {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(prefix)) rmSync(resolve(dir, name), { force: true })
    }
  } catch {
    // dir may not exist yet
  }
}

describe('canonicalize cache disk persistence', () => {
  beforeEach(() => {
    resetCanonicalizeService()
    cleanCanonFiles()
  })
  afterEach(() => {
    resetCanonicalizeService()
    cleanCanonFiles()
  })

  it('persists [canonical, safe] tuples to a hash-keyed file', () => {
    const classes = manyArbitrary()
    const results = canonicalizeClassesSync(ENTRY_POINT, classes)

    const persisted = readPersisted()
    // Every class round-trips through the tuple format, carrying the safe flag.
    for (let i = 0; i < classes.length; i++) {
      expect(persisted[classes[i]]).toEqual([results[i].canonical, results[i].safe])
    }
  })

  it('serves identical results after a reset (fresh-process equivalent)', () => {
    const classes = manyArbitrary()
    const first = canonicalizeClassesSync(ENTRY_POINT, classes)

    resetCanonicalizeService() // in-memory gone; only the disk cache remains
    const second = canonicalizeClassesSync(ENTRY_POINT, classes)

    expect(second).toEqual(first)
  })

  it('isolates rem settings in separate cache files', () => {
    canonicalizeClassesSync(ENTRY_POINT, manyArbitrary(), 16)
    expect(cachePath(16)).not.toBe(cachePath())
    expect(Object.keys(readPersisted(16))).toContain('p-[1px]')
  })

  it('restores the safe flag so an unsafe rewrite stays gated after a reset', () => {
    // Poison the current-hash file with a safe=false entry, then confirm a
    // fresh process reads `safe` back verbatim (not defaulted to true).
    writeFileSync(cachePath(), JSON.stringify({ 'p-[16px]': ['p-4', false] }))
    resetCanonicalizeService()

    const [result] = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]'])
    expect(result).toEqual({ canonical: 'p-4', safe: false })
  })

  describe('staleness guard (logic-hash keying)', () => {
    it('reads the current-hash file', () => {
      writeFileSync(cachePath(), JSON.stringify({ 'p-[16px]': ['SENTINEL', true] }))
      resetCanonicalizeService()

      const [result] = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]'])
      expect(result.canonical).toBe('SENTINEL') // proves the file is authoritative on load
    })

    it('ignores a cache written under a different logic hash', () => {
      // Simulate a prior version's file by swapping the hash segment.
      const stalePath = cachePath().replace(/\.canon-[0-9a-f]+-/, '.canon-deadbeef-')
      expect(stalePath).not.toBe(cachePath())
      writeFileSync(stalePath, JSON.stringify({ 'p-[16px]': ['SENTINEL', true] }))
      resetCanonicalizeService()

      try {
        const [result] = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]'])
        // The stale-hash file is not this run's file, so it's never read.
        expect(result.canonical).not.toBe('SENTINEL')
      } finally {
        rmSync(stalePath, { force: true })
      }
    })
  })

  it('survives a corrupt cache file and repairs it on the next flush', () => {
    writeFileSync(cachePath(), '{ not json')
    const results = canonicalizeClassesSync(ENTRY_POINT, manyArbitrary())

    expect(results[0].canonical).toBeTypeOf('string')
    const persisted = readPersisted() // corrupt file replaced by a valid one
    expect(persisted['p-[1px]']).toEqual([results[0].canonical, results[0].safe])
  })

  it('ignores persisted entries that are not [string, boolean] tuples', () => {
    writeFileSync(
      cachePath(),
      JSON.stringify({ 'p-[16px]': 'p-4', 'p-[8px]': ['p-2'], 'p-[4px]': 42 }),
    )
    resetCanonicalizeService()

    // None of the malformed entries are trusted; all get recomputed.
    const [a, b, c] = canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]', 'p-[8px]', 'p-[4px]'])
    for (const r of [a, b, c]) expect(r).toHaveProperty('safe')
  })

  it('disables persistence (without throwing) when the cache dir is unwritable', () => {
    const dir = dirname(cachePath())
    canonicalizeClassesSync(ENTRY_POINT, ['p-[1px]']) // ensure dir exists
    cleanCanonFiles()
    chmodSync(dir, 0o500) // read + execute, no write
    try {
      // Must not throw even though every flush attempt fails.
      const results = canonicalizeClassesSync(ENTRY_POINT, manyArbitrary())
      expect(results).toHaveLength(FLUSH_THRESHOLD + 4)
      expect(results[0].canonical).toBeTypeOf('string')
    } finally {
      chmodSync(dir, 0o700)
    }
  })

  it('never leaves a stray .tmp file across repeated flushes', () => {
    // Several flush-triggering batches; unique pid.thread.seq tmp names + atomic
    // rename must leave exactly the final file and no partial temporaries.
    for (let b = 0; b < 3; b++) {
      canonicalizeClassesSync(
        ENTRY_POINT,
        Array.from({ length: FLUSH_THRESHOLD + 1 }, (_, i) => `m-[${b}-${i}px]`),
      )
    }
    const dir = dirname(cachePath())
    const base = basename(cachePath())
    const leftovers = readdirSync(dir).filter((n) => n.startsWith(base) && n.endsWith('.tmp'))
    expect(leftovers).toEqual([])
    expect(() => readPersisted()).not.toThrow()
  })
})
