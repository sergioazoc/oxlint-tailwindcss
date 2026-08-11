import { describe, expect, it, vi } from 'vitest'
import {
  DeprecatedEntryPointShapeError,
  DesignSystemLoadError,
  MissingEntryPointError,
  OxlintTailwindError,
  SortServiceError,
  UnsupportedEngineError,
  formatFatalError,
  isFatalError,
  reportFatalDsError,
} from '../../src/utils/fatal'

describe('fatal errors', () => {
  it('preserves message and hint', () => {
    const err = new MissingEntryPointError('No entryPoint', 'set settings.tailwindcss.entryPoint')
    expect(err.message).toBe('No entryPoint')
    expect(err.hint).toBe('set settings.tailwindcss.entryPoint')
    expect(err.name).toBe('MissingEntryPointError')
  })

  it('passes through error cause', () => {
    const cause = new Error('underlying')
    const err = new DesignSystemLoadError('failed', undefined, { cause })
    expect(err.cause).toBe(cause)
  })

  it('isFatalError discriminates plugin errors from generic errors', () => {
    expect(isFatalError(new MissingEntryPointError('a'))).toBe(true)
    expect(isFatalError(new DesignSystemLoadError('b'))).toBe(true)
    expect(isFatalError(new SortServiceError('c'))).toBe(true)
    expect(isFatalError(new DeprecatedEntryPointShapeError('d'))).toBe(true)
    expect(isFatalError(new UnsupportedEngineError('e'))).toBe(true)
    expect(isFatalError(new OxlintTailwindError('f'))).toBe(true)
    expect(isFatalError(new Error('regular'))).toBe(false)
    expect(isFatalError('not an error')).toBe(false)
    expect(isFatalError(null)).toBe(false)
  })

  it('routes UnsupportedEngineError to designSystemUnavailable with no per-rule meta change', () => {
    // A new OxlintTailwindError subclass is fatal and reports through the same
    // messageId every DS-dependent rule already declares — the version guard
    // needs no new messageId anywhere.
    const report = vi.fn()
    const err = new UnsupportedEngineError('engine 5.0.0 unverified', 'set allowUntestedEngine')
    expect(reportFatalDsError({ report }, err)).toBe(true)
    expect(report).toHaveBeenCalledWith({
      node: undefined,
      messageId: 'designSystemUnavailable',
      data: { message: 'engine 5.0.0 unverified\n\nHint: set allowUntestedEngine' },
    })
  })

  it('formatFatalError appends the hint when present', () => {
    const withHint = new MissingEntryPointError('Missing entryPoint', 'fix it like this')
    expect(formatFatalError(withHint)).toBe('Missing entryPoint\n\nHint: fix it like this')

    const noHint = new MissingEntryPointError('Missing entryPoint')
    expect(formatFatalError(noHint)).toBe('Missing entryPoint')
  })

  it('reportFatalDsError reports fatal errors and returns true', () => {
    const report = vi.fn()
    const err = new MissingEntryPointError('no entryPoint', 'configure it')
    const result = reportFatalDsError({ report }, err)
    expect(result).toBe(true)
    expect(report).toHaveBeenCalledWith({
      node: undefined,
      messageId: 'designSystemUnavailable',
      data: { message: 'no entryPoint\n\nHint: configure it' },
    })
  })

  it('reportFatalDsError returns false (and does not report) for non-fatal errors', () => {
    const report = vi.fn()
    expect(reportFatalDsError({ report }, new Error('regular'))).toBe(false)
    expect(reportFatalDsError({ report }, 'string')).toBe(false)
    expect(reportFatalDsError({ report }, null)).toBe(false)
    expect(report).not.toHaveBeenCalled()
  })

  it('reportFatalDsError forwards the node argument', () => {
    const report = vi.fn()
    const node = { type: 'Program' } as const
    reportFatalDsError({ report }, new SortServiceError('worker died'), node)
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ node, messageId: 'designSystemUnavailable' }),
    )
  })
})

describe('safeGetDS', () => {
  it('returns the result on success', async () => {
    const { safeGetDS } = await import('../../src/utils/fatal')
    const report = vi.fn()
    const result = safeGetDS(() => ({ ok: true }), { report })
    expect(result).toEqual({ ok: true })
    expect(report).not.toHaveBeenCalled()
  })

  it('catches fatal errors, reports them, and returns null', async () => {
    const { safeGetDS } = await import('../../src/utils/fatal')
    const report = vi.fn()
    const result = safeGetDS(
      () => {
        throw new MissingEntryPointError('boom', 'fix it')
      },
      { report },
    )
    expect(result).toBeNull()
    expect(report).toHaveBeenCalledOnce()
  })

  it('re-throws non-fatal errors', async () => {
    const { safeGetDS } = await import('../../src/utils/fatal')
    const report = vi.fn()
    expect(() =>
      safeGetDS(
        () => {
          throw new Error('regular bug')
        },
        { report },
      ),
    ).toThrow('regular bug')
    expect(report).not.toHaveBeenCalled()
  })
})
