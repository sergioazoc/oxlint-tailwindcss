import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolve } from 'node:path'
import {
  getLoadedDesignSystem,
  createLazyLoader,
  resetDesignSystem,
} from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('debug logging', () => {
  beforeEach(() => {
    resetDesignSystem()
    delete process.env.DEBUG
  })

  it('does not log when debug is disabled', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getLoadedDesignSystem(ENTRY_POINT, {})
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('logs when settings.tailwindcss.debug is true', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const settings = { tailwindcss: { entryPoint: ENTRY_POINT, debug: true } }

    let inVisitor = false
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        if (!inVisitor) throw new Error('Cannot access settings in createOnce')
        return settings
      },
      get filename() {
        if (!inVisitor) throw new Error('Cannot access filename in createOnce')
        return '/some/project/src/App.tsx'
      },
    }

    const getDS = createLazyLoader(context)
    inVisitor = true
    getDS()

    const debugCalls = spy.mock.calls.filter((c) => String(c[0]).includes('[oxlint-tailwindcss]'))
    expect(debugCalls.length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('logs when DEBUG=oxlint-tailwindcss env var is set', () => {
    process.env.DEBUG = 'oxlint-tailwindcss'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    getLoadedDesignSystem(ENTRY_POINT, {})

    const debugCalls = spy.mock.calls.filter((c) => String(c[0]).includes('[oxlint-tailwindcss]'))
    expect(debugCalls.length).toBeGreaterThan(0)
    spy.mockRestore()
    delete process.env.DEBUG
  })

  it('debug log includes file and entry point paths', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const settings = { tailwindcss: { entryPoint: ENTRY_POINT, debug: true } }

    let inVisitor = false
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        if (!inVisitor) throw new Error('Cannot access settings in createOnce')
        return settings
      },
      get filename() {
        if (!inVisitor) throw new Error('Cannot access filename in createOnce')
        return '/some/project/src/App.tsx'
      },
    }

    const getDS = createLazyLoader(context)
    inVisitor = true
    getDS()

    const debugCalls = spy.mock.calls.filter((c) => String(c[0]).includes('[oxlint-tailwindcss]'))
    // Should contain the arrow showing file → entry point mapping
    const hasMapping = debugCalls.some((c) => String(c[0]).includes('→'))
    expect(hasMapping).toBe(true)
    spy.mockRestore()
  })
})
