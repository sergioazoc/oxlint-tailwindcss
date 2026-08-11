import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolve } from 'node:path'
import { guardEngine, resetEngineGuard } from '../../src/design-system/engine-guard'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { safeGetDS, UnsupportedEngineError } from '../../src/utils/fatal'

// The design-system load runs for real (default.css is pre-warmed by the global
// setup). Version facts are INJECTED via the third `getLoadedDesignSystem` arg
// (and directly into `guardEngine`) so every verdict can be exercised without a
// second Tailwind install.

const DEFAULT = resolve(__dirname, '../fixtures/default.css')

beforeEach(() => resetDesignSystem())
afterEach(() => vi.restoreAllMocks())

describe('guardEngine (injected facts — no load)', () => {
  it('throws UnsupportedEngineError on a fatal verdict', () => {
    expect(() => guardEngine('/x/app.css', false, { E: '5.0.0', B: '5.0.0' })).toThrow(
      UnsupportedEngineError,
    )
    expect(() => guardEngine('/x/app.css', false, { E: '3.4.0', B: '3.4.0' })).toThrow(
      UnsupportedEngineError,
    )
  })

  it('runs (no throw) when a future major is allowed', () => {
    expect(() => guardEngine('/x/app.css', true, { E: '5.0.0', B: '5.0.0' })).not.toThrow()
  })

  it('warns once per (path, kind, E, B), again for a different E, and again after reset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const opts = { E: '4.5.0', B: '4.5.0', bundledVersion: '4.3.3' }

    guardEngine('/x/app.css', false, opts)
    guardEngine('/x/app.css', false, opts)
    expect(warn).toHaveBeenCalledTimes(1) // deduped

    guardEngine('/x/app.css', false, { E: '4.6.0', B: '4.6.0', bundledVersion: '4.3.3' })
    expect(warn).toHaveBeenCalledTimes(2) // different E → warns again

    resetEngineGuard()
    guardEngine('/x/app.css', false, opts)
    expect(warn).toHaveBeenCalledTimes(3) // reset clears the memo
  })

  it('emits the message on stderr via console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    guardEngine('/x/app.css', false, { E: '4.3.3', B: '4.5.0', bundledVersion: '4.3.3' })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('4.5.0')
  })
})

describe('getLoadedDesignSystem — version guard integration', () => {
  it('fatal future-major surfaces designSystemUnavailable via safeGetDS', () => {
    const report = vi.fn()
    const result = safeGetDS(() => getLoadedDesignSystem(DEFAULT, {}, { E: '5.0.0', B: '5.0.0' }), {
      report,
    })
    expect(result).toBeNull()
    expect(report).toHaveBeenCalledOnce()
    const arg = report.mock.calls[0][0]
    expect(arg.messageId).toBe('designSystemUnavailable')
    expect(arg.data.message).toContain('5.0.0')
  })

  it('memoizes the fatal verdict by (path, mtime): a later ok override still throws', () => {
    expect(() => getLoadedDesignSystem(DEFAULT, {}, { E: '5.0.0', B: '5.0.0' })).toThrow(
      UnsupportedEngineError,
    )
    // Same path/mtime → the cached failure short-circuits before re-assessing,
    // so even an ok override rethrows the memoized error.
    expect(() => getLoadedDesignSystem(DEFAULT, {}, { E: '4.3.3', B: '4.3.3' })).toThrow(
      UnsupportedEngineError,
    )
  })

  it('drift-major fatal is downgraded to a warn+load when allowUntestedEngine is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = getLoadedDesignSystem(
      DEFAULT,
      { tailwindcss: { allowUntestedEngine: true } },
      { E: '4.3.3', B: '3.4.0' },
    )
    expect(res.cache).toBeDefined()
    expect(res.entryPoint).toBe(DEFAULT)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('drift-minor warns once and still loads', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = getLoadedDesignSystem(
      DEFAULT,
      {},
      { E: '4.3.3', B: '4.5.0', bundledVersion: '4.3.3' },
    )
    expect(res.cache.isValid('flex')).toBe(true)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('4.5.0')
  })

  it('is silent and loads for the real installed engine (guard does not misfire)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = getLoadedDesignSystem(DEFAULT, {}) // no override → real resolver
    expect(res.cache.isValid('flex')).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })
})
