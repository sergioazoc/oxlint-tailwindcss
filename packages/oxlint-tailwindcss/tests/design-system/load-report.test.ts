/**
 * What `debug` says about a design-system load: whether it came from the disk
 * cache or was precomputed, how long each step took, and — for a precompute —
 * each of the worker's phases, measured by the precompute script itself (so
 * the numbers are the real script's, not a copy's).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadDesignSystemSync, takeLoadReport } from '../../src/design-system/sync-loader'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { resetDebug, setDebugEnabled } from '../../src/design-system/debug'

const FIXTURE = resolve(__dirname, '../fixtures/default.css')
// Unique content, so the first load is a real precompute in this run's cache dir.
const COLD = resolve(__dirname, `../fixtures/.load-report-cold-${process.pid}.css`)

const PHASES = [
  'load',
  'validate',
  'arbitrary',
  'expand',
  'markers',
  'canonical',
  'deprecated',
  'order',
  'declarations',
  'variants',
  'components',
  'tokens',
]

beforeAll(() => {
  writeFileSync(COLD, `@import 'tailwindcss';\n/* load-report ${process.pid} ${Date.now()} */\n`)
})

afterAll(() => {
  rmSync(COLD, { force: true })
})

afterEach(() => {
  resetDesignSystem()
  resetDebug()
  vi.restoreAllMocks()
})

describe('load report', () => {
  it("a precompute reports the script's own phases, then the same content is a cache hit", () => {
    loadDesignSystemSync(COLD)
    const cold = takeLoadReport()!
    expect(cold.source).toBe('precompute')
    expect(Object.keys(cold.phases ?? {})).toEqual(PHASES)
    for (const ms of Object.values(cold.phases!)) expect(ms).toBeGreaterThanOrEqual(0)
    expect(cold.computeMs).toBeGreaterThan(0)

    loadDesignSystemSync(COLD)
    const warm = takeLoadReport()!
    expect(warm.source).toBe('cache')
    expect(warm.computeMs).toBeUndefined()
    expect(warm.readMs).toBeGreaterThanOrEqual(0)
    // Taken: a second take has nothing.
    expect(takeLoadReport()).toBeNull()
  })

  it('debug prints one line per load: where it came from and how long each step took', () => {
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line))
    setDebugEnabled(true)
    getLoadedDesignSystem(FIXTURE)
    const line = lines.find((l) => l.includes('Loaded design system'))
    expect(line).toMatch(
      /Loaded design system from ".*default\.css" — (cache hit|precomputed in \d+ ms \(load \d+ ms, .*\)); hash \d+ ms, read \d+ ms, build \d+ ms$/,
    )
  })
})
