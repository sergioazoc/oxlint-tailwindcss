/**
 * The disk cache doesn't grow forever. Every change to a design system's CSS
 * precomputes a new ~3 MB artifact and nothing removed the old ones — in a CI
 * cache restored run after run, they piled up. After each precompute, the
 * plugin's own cache files unused for 30 days are removed; a cache hit
 * refreshes a file's mtime, so what's in use never expires.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  cacheArtifactPaths,
  getCacheDir,
  loadDesignSystemSync,
  pruneCacheDir,
} from '../../src/design-system/sync-loader'

const DAY = 24 * 60 * 60 * 1000
const HASH = 'a'.repeat(32)
const dirs: string[] = []
const cold: string[] = []

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  for (const f of cold) rmSync(f, { force: true })
})

const age = (path: string, days: number) => {
  const t = new Date(Date.now() - days * DAY)
  utimesSync(path, t, t)
}

describe('pruneCacheDir', () => {
  it("removes this plugin's files unused for 30 days, and nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), 'oxtw-prune-'))
    dirs.push(dir)
    const files = {
      old: `${HASH}.json`,
      oldCanon: `${'b'.repeat(32)}.canon-1234abcd-16.json`,
      oldLock: `${'c'.repeat(32)}.lock`,
      recent: `${'d'.repeat(32)}.json`,
      foreign: 'notes.json',
      shortHash: 'abc.json',
    }
    for (const name of Object.values(files)) writeFileSync(join(dir, name), '{}')
    for (const key of ['old', 'oldCanon', 'oldLock', 'foreign', 'shortHash'] as const) {
      age(join(dir, files[key]), 40)
    }
    age(join(dir, files.recent), 29)

    expect(pruneCacheDir(dir)).toBe(3)
    expect(existsSync(join(dir, files.old))).toBe(false)
    expect(existsSync(join(dir, files.oldCanon))).toBe(false)
    expect(existsSync(join(dir, files.oldLock))).toBe(false)
    expect(existsSync(join(dir, files.recent))).toBe(true)
    expect(existsSync(join(dir, files.foreign))).toBe(true)
    expect(existsSync(join(dir, files.shortHash))).toBe(true)
  })

  it('is a no-op for a directory that does not exist', () => {
    expect(pruneCacheDir(join(tmpdir(), `oxtw-missing-${process.pid}`))).toBe(0)
  })
})

describe('the loader', () => {
  it('prunes after a precompute', () => {
    const stale = join(getCacheDir(), `${'e'.repeat(32)}.json`)
    writeFileSync(stale, '{}')
    age(stale, 40)
    const css = resolve(__dirname, `../fixtures/.prune-${process.pid}.css`)
    cold.push(css)
    writeFileSync(css, `@import 'tailwindcss';\n/* prune ${process.pid} ${Date.now()} */\n`)
    loadDesignSystemSync(css)
    expect(existsSync(stale)).toBe(false)
  })

  it('leaves a recently used artifact untouched, so a warm run writes nothing', () => {
    const css = resolve(__dirname, '../fixtures/default.css')
    loadDesignSystemSync(css)
    const { json } = cacheArtifactPaths(css)
    age(json, 0.5)
    const before = statSync(json).mtimeMs
    loadDesignSystemSync(css)
    expect(statSync(json).mtimeMs).toBe(before)
  })

  it('refreshes the artifact a cache hit reads once it is over a day old', () => {
    const css = resolve(__dirname, '../fixtures/default.css')
    loadDesignSystemSync(css)
    const { json } = cacheArtifactPaths(css)
    // Over a day, and well under the 30-day prune: the run's cache dir is shared
    // by every test file, and another one's precompute may prune it meanwhile.
    age(json, 2)
    loadDesignSystemSync(css)
    expect(Date.now() - statSync(json).mtimeMs).toBeLessThan(DAY)
  })
})
