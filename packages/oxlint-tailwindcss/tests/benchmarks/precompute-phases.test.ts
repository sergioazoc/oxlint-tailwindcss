/**
 * Benchmark: the precompute, phase by phase.
 *
 * The phases are timed by PRECOMPUTE_SCRIPT itself (`timings` in its result),
 * so this measures the real script — not a copy of it that drifts. Each fixture
 * gets a unique comment so the load is a real precompute, never a cache hit.
 *
 * Run: pnpm bench
 */

import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadDesignSystemSync, takeLoadReport } from '../../src/design-system/sync-loader'

const FIXTURES = ['default.css', 'shadcn.css', 'with-typography.css']
const written: string[] = []

afterAll(() => {
  for (const f of written) rmSync(f, { force: true })
})

describe('precompute phases', () => {
  it.each(FIXTURES)('%s', (fixture) => {
    const source = resolve(__dirname, '../fixtures', fixture)
    const cold = resolve(__dirname, '../fixtures', `.bench-${process.pid}-${fixture}`)
    writeFileSync(
      cold,
      `${readFileSync(source, 'utf8')}\n/* bench ${process.pid} ${Date.now()} */\n`,
    )
    written.push(cold)

    loadDesignSystemSync(cold)
    const report = takeLoadReport()!
    expect(report.source).toBe('precompute')

    const phases = Object.entries(report.phases ?? {}).sort((a, b) => b[1] - a[1])
    const total = phases.reduce((sum, [, ms]) => sum + ms, 0)
    console.log(`\n${fixture}: precomputed in ${report.computeMs} ms (phases ${total} ms)`)
    for (const [name, ms] of phases) {
      console.log(
        `  ${name.padEnd(14)} ${String(ms).padStart(6)} ms  ${((ms / total) * 100).toFixed(0)}%`,
      )
    }
  })
})
