import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The precompute worker runs the CONSUMER's Tailwind engine, which may be a
// version the plugin wasn't built against. The version guard fail-loud handles
// unsupported majors, but within the supported range the worker degrades
// gracefully via capability probes (feature detection over version detection).
// This locks those probes so a refactor can't silently remove them and turn an
// engine API change into an untyped crash across the worker boundary.
const SRC = readFileSync(resolve(__dirname, '../../src/design-system/sync-loader.ts'), 'utf-8')

describe('precompute capability guards', () => {
  it('probes ds.theme.entries before using it', () => {
    expect(SRC).toContain("typeof ds.theme.entries === 'function'")
  })

  it('validates precompute output shape before it reaches the rules', () => {
    expect(SRC).toContain('isPrecomputedData')
  })

  it('treats candidatesToCss as the source of truth (self-pruning across versions)', () => {
    expect(SRC).toContain('candidatesToCss')
  })

  it('reads variants defensively', () => {
    expect(SRC).toContain('ds.getVariants')
  })
})
