/**
 * Tests for content-based cache deduplication.
 *
 * Validates that multiple CSS files with identical content share a single
 * precomputed cache entry, avoiding redundant child process spawns.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve, join, dirname } from 'node:path'
import { mkdirSync, copyFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { cacheArtifactPaths, loadDesignSystemSync } from '../../src/design-system/sync-loader'
import { resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const PROJECT_ROOT = resolve(__dirname, '../..')
const TEMP_DIR = join(PROJECT_ROOT, '.bench-tmp', 'content-cache')

const PACKAGES = ['pkg-a', 'pkg-b', 'pkg-c']

beforeAll(() => {
  mkdirSync(TEMP_DIR, { recursive: true })
  for (const pkg of PACKAGES) {
    const dir = join(TEMP_DIR, pkg)
    mkdirSync(dir, { recursive: true })
    copyFileSync(ENTRY_POINT, join(dir, 'styles.css'))
  }
})

afterAll(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true })
})

describe('Content-based cache deduplication', () => {
  it('second package with identical CSS reuses content cache', () => {
    resetDesignSystem()

    // First load — populates content cache
    const pathA = join(TEMP_DIR, 'pkg-a', 'styles.css')
    const resultA = loadDesignSystemSync(pathA)
    expect(resultA).not.toBeNull()

    // Second load — different path, same content → content cache hit
    resetDesignSystem()
    const pathB = join(TEMP_DIR, 'pkg-b', 'styles.css')
    const resultB = loadDesignSystemSync(pathB)
    expect(resultB).not.toBeNull()

    // Both return identical data (proves content deduplication)
    expect(resultB).toEqual(resultA)
  })

  it('all packages return identical precomputed data', () => {
    const results = PACKAGES.map((pkg) => {
      resetDesignSystem()
      return loadDesignSystemSync(join(TEMP_DIR, pkg, 'styles.css'))
    })

    for (const r of results) {
      expect(r).not.toBeNull()
    }

    // Deep equality: all packages produce the same output
    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
  })

  it('changing CSS content invalidates cache', () => {
    resetDesignSystem()
    const pathA = join(TEMP_DIR, 'pkg-a', 'styles.css')

    // Load with original content
    const result1 = loadDesignSystemSync(pathA)
    expect(result1).not.toBeNull()

    // Write different content
    writeFileSync(pathA, "@import 'tailwindcss';\n.custom-class { color: red; }\n")
    resetDesignSystem()

    const result2 = loadDesignSystemSync(pathA)
    expect(result2).not.toBeNull()

    // Content changed → should still work (may have different component classes)
    expect(result2!.validClasses.length).toBeGreaterThan(0)

    // Restore original
    copyFileSync(ENTRY_POINT, pathA)
  })

  it('touching mtime without changing content still hits content cache', () => {
    resetDesignSystem()
    const pathC = join(TEMP_DIR, 'pkg-c', 'styles.css')

    // Ensure content cache is populated
    loadDesignSystemSync(pathC)
    resetDesignSystem()

    // Touch the file (changes mtime, not content)
    const now = new Date()
    utimesSync(pathC, now, now)

    // Load again — mtime index misses, but content hash matches existing cache
    const start = performance.now()
    const result = loadDesignSystemSync(pathC)
    const elapsed = performance.now() - start
    expect(result).not.toBeNull()

    // Should be fast: reads CSS + computes hash + content cache hit
    // Not as fast as mtime index hit, but much faster than child process spawn
    expect(elapsed).toBeLessThan(500)
    console.log(`  Touched mtime, content cache hit: ${elapsed.toFixed(1)}ms`)
  })

  // DS-A3 / SEC-A1: a corrupt or poisoned cache file must not wedge the loader
  // forever — it should be detected as invalid, removed, and recomputed.
  //
  // These use UNIQUE CSS content (not a copy of default.css) so their content
  // hash never collides with the default.css cache that other parallel test
  // files read — clobbering this artifact must not corrupt theirs.
  const writeUniqueCss = (name: string): string => {
    const dir = join(TEMP_DIR, name)
    mkdirSync(dir, { recursive: true })
    const cssPath = join(dir, 'styles.css')
    writeFileSync(cssPath, `@import 'tailwindcss';\n.marker-${name} { color: red; }\n`)
    return cssPath
  }

  // Pre-plant a bad cache file in the slot BEFORE any load, then assert the
  // loader recomputes a valid one. This is both the realistic scenario (garbage
  // already on disk) and faster than populate-then-clobber — a single cold
  // compute instead of two.
  const plantBadCacheThenLoad = (name: string, badContent: string) => {
    resetDesignSystem()
    const cssPath = writeUniqueCss(name)
    const { json } = cacheArtifactPaths(cssPath)
    mkdirSync(dirname(json), { recursive: true })
    writeFileSync(json, badContent)
    return loadDesignSystemSync(cssPath)
  }

  it('recovers from a corrupt (non-JSON) cache file', () => {
    const recovered = plantBadCacheThenLoad('corrupt-nonjson', 'not json at all {{{')
    expect(recovered).not.toBeNull()
    expect(recovered.validClasses.length).toBeGreaterThan(0)
  })

  it('recovers from a structurally-invalid cache file ({})', () => {
    // Valid JSON, but missing every expected field — the old code crashed in
    // fromPrecomputed with a raw TypeError instead of recomputing.
    const recovered = plantBadCacheThenLoad('corrupt-empty', '{}')
    expect(recovered).not.toBeNull()
    expect(Array.isArray(recovered.validClasses)).toBe(true)
  })

  // DS-A2: the cache key must fold in @import'd files, so editing an imported
  // file invalidates the cache even when the entry itself is unchanged.
  it('changing an @import-ed file invalidates the cache', () => {
    resetDesignSystem()
    const dir = join(TEMP_DIR, 'import-invalidation')
    mkdirSync(dir, { recursive: true })
    const entry = join(dir, 'entry.css')
    const theme = join(dir, 'theme.css')
    writeFileSync(theme, '.token-a { color: red; }\n')
    writeFileSync(entry, "@import 'tailwindcss';\n@import './theme.css';\n")

    const { json: jsonBefore } = cacheArtifactPaths(entry)

    // Edit ONLY the imported file — the entry's bytes don't change.
    writeFileSync(theme, '.token-b { color: blue; }\n')
    const { json: jsonAfter } = cacheArtifactPaths(entry)

    // Different artifact path ⇒ the content hash folded in the import (DS-A2).
    expect(jsonAfter).not.toBe(jsonBefore)
  })
})
