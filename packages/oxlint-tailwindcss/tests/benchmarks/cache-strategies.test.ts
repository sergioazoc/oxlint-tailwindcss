/**
 * Benchmark: Content-based cache performance in monorepo scenarios.
 *
 * Measures the real implementation of the two-level cache (mtime index + content hash)
 * and demonstrates monorepo deduplication.
 *
 * Run: pnpm vitest run tests/benchmarks/cache-strategies.test.ts --reporter=verbose
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, copyFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { loadDesignSystemSync } from '../../src/design-system/sync-loader'
import { resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const CACHE_DIR = join(tmpdir(), 'oxlint-tailwindcss')
const PROJECT_ROOT = resolve(__dirname, '../..')
const TEMP_DIR = join(PROJECT_ROOT, '.bench-tmp', 'cache-bench')

const SIMULATED_PACKAGES = ['pkg-web', 'pkg-mobile', 'pkg-admin', 'pkg-shared', 'pkg-docs']

beforeAll(() => {
  mkdirSync(TEMP_DIR, { recursive: true })
  for (const pkg of SIMULATED_PACKAGES) {
    const dir = join(TEMP_DIR, pkg)
    mkdirSync(dir, { recursive: true })
    copyFileSync(ENTRY_POINT, join(dir, 'styles.css'))
  }
})

afterAll(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true })
})

describe('Cache Strategy Benchmarks', () => {
  it('measures cache levels: cold → disk hit → mtime index hit', () => {
    // Clear all caches for the entry point to force cold load
    resetDesignSystem()
    const content = readFileSync(ENTRY_POINT, 'utf-8')
    const contentHash = createHash('md5').update(`v11:${content}`).digest('hex')
    const contentCachePath = join(CACHE_DIR, `${contentHash}.json`)
    const mtime = statSync(ENTRY_POINT).mtimeMs
    const mtimeHash = createHash('md5')
      .update(`v11:${resolve(ENTRY_POINT)}:${mtime}`)
      .digest('hex')
    const mtimeIndexPath = join(CACHE_DIR, `${mtimeHash}.idx`)

    // Save and remove existing caches
    if (existsSync(contentCachePath)) {
      rmSync(contentCachePath)
    }
    if (existsSync(mtimeIndexPath)) {
      rmSync(mtimeIndexPath)
    }

    // Cold load (no cache)
    const coldStart = performance.now()
    const coldResult = loadDesignSystemSync(ENTRY_POINT)
    const coldTime = performance.now() - coldStart
    expect(coldResult).not.toBeNull()

    // Disk cache hit (mtime index exists → content cache exists)
    resetDesignSystem()
    const warmStart = performance.now()
    const warmResult = loadDesignSystemSync(ENTRY_POINT)
    const warmTime = performance.now() - warmStart
    expect(warmResult).not.toBeNull()

    console.log('\n' + '='.repeat(55))
    console.log(' Niveles de cache')
    console.log('='.repeat(55))
    console.log(`  Cold load (sin cache):       ${coldTime.toFixed(0).padStart(6)}ms`)
    console.log(`  Mtime index + content hit:   ${warmTime.toFixed(1).padStart(6)}ms`)
    console.log(`  Speedup:                     ${(coldTime / warmTime).toFixed(0).padStart(5)}x`)
    console.log('='.repeat(55))
  })

  it('measures monorepo deduplication (real implementation)', () => {
    console.log('\n' + '='.repeat(55))
    console.log(' Monorepo: 5 paquetes con CSS idéntico')
    console.log('='.repeat(55))

    const times: { pkg: string; ms: number }[] = []

    for (const pkg of SIMULATED_PACKAGES) {
      resetDesignSystem()
      const cssPath = join(TEMP_DIR, pkg, 'styles.css')

      const start = performance.now()
      const result = loadDesignSystemSync(cssPath)
      const elapsed = performance.now() - start

      expect(result).not.toBeNull()
      times.push({ pkg, ms: elapsed })
    }

    for (const { pkg, ms } of times) {
      const fast = ms < 100
      console.log(
        `  ${pkg.padEnd(15)} ${ms.toFixed(fast ? 1 : 0).padStart(6)}ms  ${fast ? '[CONTENT HIT]' : '[COLD/MISS]'}`,
      )
    }

    const total = times.reduce((sum, t) => sum + t.ms, 0)
    const firstTime = times[0].ms
    const restTotal = times.slice(1).reduce((sum, t) => sum + t.ms, 0)

    console.log('-'.repeat(55))
    console.log(`  Total:          ${total.toFixed(0).padStart(6)}ms`)
    console.log(`  Primer paquete: ${firstTime.toFixed(0).padStart(6)}ms`)
    console.log(
      `  Resto (${SIMULATED_PACKAGES.length - 1} pkgs):  ${restTotal.toFixed(0).padStart(6)}ms`,
    )
    console.log('='.repeat(55))

    // After the first load, subsequent packages should be fast (< 100ms each)
    for (let i = 1; i < times.length; i++) {
      expect(times[i].ms).toBeLessThan(100)
    }
  })

  it('measures content hash computation overhead', () => {
    const content = readFileSync(ENTRY_POINT, 'utf-8')

    const iterations = 1000
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      createHash('md5').update(`v11:${content}`).digest('hex')
    }
    const elapsed = performance.now() - start

    const resolvedPath = resolve(ENTRY_POINT)
    const mtime = statSync(resolvedPath).mtimeMs
    const start2 = performance.now()
    for (let i = 0; i < iterations; i++) {
      createHash('md5').update(`v11:${resolvedPath}:${mtime}`).digest('hex')
    }
    const elapsed2 = performance.now() - start2

    console.log(`\n  Content hash (MD5): ${(elapsed / iterations).toFixed(3)}ms por archivo`)
    console.log(`  Path+mtime hash:    ${(elapsed2 / iterations).toFixed(3)}ms por archivo`)
    console.log(
      `  Overhead adicional: ${((elapsed - elapsed2) / iterations).toFixed(3)}ms por archivo`,
    )
  })
})
