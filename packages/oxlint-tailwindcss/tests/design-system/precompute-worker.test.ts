/**
 * Tests for the worker_thread-based precompute (issue #24 / birdman CI report).
 *
 * v1.0.1 moved the precompute off `execFileSync` (which `fork()`s the oxlint host
 * and trips `spawnSync … ENOMEM` on constrained CI runners) onto a
 * worker_thread that writes the result straight to the disk cache. These tests
 * lock down: the no-fork guarantee, the disk-write contract, the error/timeout
 * paths, the cause-classified hint, and the failure memoization that stops a
 * single environmental failure from storming into thousands of re-attempts.
 */

import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { existsSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  cacheArtifactPaths,
  loadDesignSystemSync,
  precomputeHint,
} from '../../src/design-system/sync-loader'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { DesignSystemLoadError } from '../../src/utils/fatal'

// Each test that wants a cold cache writes unique CSS content (the disk cache is
// keyed by content hash), so it never collides with another test's artifacts.
function uniqueCss(tag: string): string {
  const path = resolve(__dirname, `../fixtures/.worker-${tag}.css`)
  writeFileSync(path, `@import 'tailwindcss';\n/* ${tag} ${Date.now()} ${Math.random()} */\n`)
  rmSync(cacheArtifactPaths(path).json, { force: true })
  return path
}

// Remove the CSS file and its disk-cache JSON. The cache path is derived from
// the file content, so it must be computed BEFORE the file is deleted.
function cleanup(css: string): void {
  const json = existsSync(css) ? cacheArtifactPaths(css).json : undefined
  rmSync(css, { force: true })
  if (json) rmSync(json, { force: true })
}

describe('precompute via worker_thread', () => {
  it('the loader does not import child_process (no fork → no ENOMEM)', () => {
    // The regression guard for #24: precompute must run in a worker_thread, not
    // a forked child. ESM module namespaces aren't spyable, so we assert the
    // source never imports `child_process` at all.
    const source = readFileSync(
      resolve(__dirname, '../../src/design-system/sync-loader.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/from\s+['"]node:child_process['"]/)
    expect(source).not.toMatch(/require\(['"](?:node:)?child_process['"]\)/)
    expect(source).toMatch(/from\s+['"]node:worker_threads['"]/)
  })

  it('loads a real design system through the worker', () => {
    resetDesignSystem()
    const css = uniqueCss('nofork')
    const result = loadDesignSystemSync(css)
    expect(result.validClasses.length).toBeGreaterThan(1000)
    cleanup(css)
  })

  it('writes valid JSON to the disk cache and leaves no temp file behind', () => {
    resetDesignSystem()
    const css = uniqueCss('diskcontract')
    const { json } = cacheArtifactPaths(css)

    const result = loadDesignSystemSync(css)
    expect(result.validClasses.length).toBeGreaterThan(1000)

    // The worker wrote the cache file itself.
    expect(existsSync(json)).toBe(true)
    const parsed = JSON.parse(readFileSync(json, 'utf-8'))
    expect(Array.isArray(parsed.validClasses)).toBe(true)
    expect(parsed.validClasses.length).toBe(result.validClasses.length)

    // The atomic write (tmp → rename) leaves no `.tmp.*` straggler.
    const leftovers = readdirSync(dirname(json)).filter((f) => f.includes('.tmp.'))
    expect(leftovers).toEqual([])

    rmSync(css, { force: true })
    rmSync(json, { force: true })
  })

  it('a second cold reader uses the cache file without recomputing', () => {
    resetDesignSystem()
    const css = uniqueCss('shared')
    const first = loadDesignSystemSync(css)

    // Fresh in-memory state, but the disk cache from the first load survives.
    // The second load should read it back (fast, identical) rather than spawn a
    // new worker — the cross-isolate dedup that the #24 lock guarantees.
    resetDesignSystem()
    const start = performance.now()
    const second = loadDesignSystemSync(css)
    const elapsed = performance.now() - start
    expect(second).toEqual(first)
    expect(elapsed).toBeLessThan(500)
    cleanup(css)
  })

  it('throws DesignSystemLoadError with a timeout hint when the worker exceeds the timeout', () => {
    resetDesignSystem()
    const css = uniqueCss('timeout')
    // 1 ms is far below the time to load + precompute a real design system, so
    // the worker reliably times out before signaling.
    let err: unknown
    try {
      loadDesignSystemSync(css, 1)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DesignSystemLoadError)
    expect((err as DesignSystemLoadError).message).toMatch(/Timed out/i)
    expect((err as DesignSystemLoadError).hint).toMatch(/timeout/i)
    cleanup(css)
  })
})

describe('precomputeHint (cause classification)', () => {
  it('gives a memory-pressure hint for ENOMEM', () => {
    const err = Object.assign(new Error('spawn ENOMEM'), { code: 'ENOMEM' })
    expect(precomputeHint(err)).toMatch(/memory/i)
  })

  it('gives a memory-pressure hint for EAGAIN', () => {
    const err = Object.assign(new Error('resource temporarily unavailable'), { code: 'EAGAIN' })
    expect(precomputeHint(err)).toMatch(/memory/i)
  })

  it('gives a memory-pressure hint when the message mentions ENOMEM without a code', () => {
    expect(precomputeHint(new Error('spawnSync /usr/bin/node ENOMEM'))).toMatch(/memory/i)
  })

  it('falls back to the CSS-syntax hint for unrelated errors', () => {
    const hint = precomputeHint(new Error('unexpected token'))
    expect(hint).toMatch(/CSS file/i)
    expect(hint).not.toMatch(/memory/i)
  })
})

describe('failure memoization (issue #24 storm)', () => {
  it('caches a fatal load failure per (path, mtime) and rethrows the same error', () => {
    resetDesignSystem()
    const css = uniqueCss('memo')
    const settings = { tailwindcss: { entryPoint: css, timeout: 1 } }

    let err1: unknown
    try {
      getLoadedDesignSystem(css, settings)
    } catch (e) {
      err1 = e
    }
    expect(err1).toBeInstanceOf(DesignSystemLoadError)

    // Second call at the same mtime must return the *same* error instance — a
    // fresh load would construct a new Error. Identity proves it was memoized.
    let err2: unknown
    try {
      getLoadedDesignSystem(css, settings)
    } catch (e) {
      err2 = e
    }
    expect(err2).toBe(err1)

    cleanup(css)
  })

  it('re-attempts the load once the CSS mtime changes', () => {
    resetDesignSystem()
    const css = uniqueCss('memo-invalidate')
    const settings = { tailwindcss: { entryPoint: css, timeout: 1 } }

    let err1: unknown
    try {
      getLoadedDesignSystem(css, settings)
    } catch (e) {
      err1 = e
    }
    expect(err1).toBeInstanceOf(DesignSystemLoadError)

    // Bump mtime → the (path, mtime) key changes → the failure cache misses and
    // a fresh attempt runs, producing a distinct error instance.
    const future = new Date(Date.now() + 60_000)
    utimesSync(css, future, future)

    let err2: unknown
    try {
      getLoadedDesignSystem(css, settings)
    } catch (e) {
      err2 = e
    }
    expect(err2).toBeInstanceOf(DesignSystemLoadError)
    expect(err2).not.toBe(err1)

    cleanup(css)
  })
})
