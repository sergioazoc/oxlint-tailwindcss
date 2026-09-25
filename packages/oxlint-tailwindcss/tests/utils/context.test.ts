import { describe, expect, it, vi } from 'vitest'
import { createLazyOptions, createLazySettings } from '../../src/utils/context'

/**
 * A rule's `createOnce` runs once per worker, and the SAME context object then
 * serves every file that worker lints. What it reads through that context is
 * per file (measured on oxlint 1.85):
 *   - `options` is one array object per effective config — shared by every file
 *     of that config, different for an `overrides` block or a nested config;
 *   - `settings` is a fresh object for every file, even under one config.
 * These fakes model exactly that: one context, fields swapped between "files".
 */
function fakeContext(init: { options?: unknown[]; settings?: Record<string, unknown> } = {}) {
  return { options: init.options, settings: init.settings } as {
    options?: unknown[]
    settings?: Record<string, unknown>
  }
}

/** A context whose getters throw, like oxlint's inside `createOnce`. */
function createOnceContext() {
  return {
    get options(): unknown[] {
      throw new Error('not available in createOnce')
    },
    get settings(): Record<string, unknown> {
      throw new Error('not available in createOnce')
    },
  }
}

describe('createLazyOptions', () => {
  it('compiles once for every file of one config', () => {
    const shared = [{ max: 5 }]
    const ctx = fakeContext({ options: shared })
    const compile = vi.fn((o: { max: number } | undefined) => o?.max)
    const get = createLazyOptions(ctx, compile)

    expect(get()).toBe(5)
    expect(get()).toBe(5)
    ctx.options = shared // next file, same config: same array object
    expect(get()).toBe(5)
    expect(compile).toHaveBeenCalledTimes(1)
  })

  it('recompiles when a file brings its own options (overrides, nested config)', () => {
    const root = [{ max: 5 }]
    const override = [{ max: 2 }]
    const ctx = fakeContext({ options: root })
    const compile = vi.fn((o: { max: number } | undefined) => o?.max)
    const get = createLazyOptions(ctx, compile)

    expect(get()).toBe(5)
    ctx.options = override
    expect(get()).toBe(2)
    ctx.options = root
    expect(get()).toBe(5)
    ctx.options = override
    expect(get()).toBe(2)
    // Each distinct config compiled once, then served from the memo.
    expect(compile).toHaveBeenCalledTimes(2)
  })

  it('treats "no options" as a config of its own', () => {
    const ctx = fakeContext({ options: [{ max: 5 }] })
    const get = createLazyOptions(ctx, (o: { max: number } | undefined) => o?.max ?? 20)
    expect(get()).toBe(5)
    ctx.options = []
    expect(get()).toBe(20)
    ctx.options = undefined
    expect(get()).toBe(20)
  })

  it('does not cache what it compiled while options were unavailable', () => {
    const ctx: { options?: unknown[] } = createOnceContext()
    const compile = vi.fn((o: { max: number } | undefined) => o?.max ?? 20)
    const get = createLazyOptions(ctx, compile)
    expect(get()).toBe(20)
    Object.defineProperty(ctx, 'options', { value: [{ max: 3 }] })
    expect(get()).toBe(3)
  })
})

describe('createLazySettings', () => {
  it('compiles once per distinct settings content, not per file', () => {
    const ctx = fakeContext({ settings: { tailwindcss: { rootFontSize: 20 } } })
    const compile = vi.fn((s: Record<string, unknown> | undefined) => s?.tailwindcss)
    const get = createLazySettings(ctx, compile)

    get()
    get()
    // Next file of the same config: a NEW object with the same content.
    ctx.settings = { tailwindcss: { rootFontSize: 20 } }
    get()
    expect(compile).toHaveBeenCalledTimes(1)
  })

  it('recompiles when a file’s settings differ (nested config)', () => {
    const ctx = fakeContext({ settings: { tailwindcss: { rootFontSize: 16 } } })
    const get = createLazySettings(ctx, (s) => {
      const tw = s?.tailwindcss as { rootFontSize?: number } | undefined
      return tw?.rootFontSize ?? 16
    })
    expect(get()).toBe(16)
    ctx.settings = { tailwindcss: { rootFontSize: 20 } }
    expect(get()).toBe(20)
    ctx.settings = { tailwindcss: { rootFontSize: 16 } }
    expect(get()).toBe(16)
    ctx.settings = undefined
    expect(get()).toBe(16)
  })

  it('does not cache what it compiled while settings were unavailable', () => {
    const ctx: { settings?: Record<string, unknown> } = createOnceContext()
    const get = createLazySettings(ctx, (s) => (s ? 'real' : 'default'))
    expect(get()).toBe('default')
    Object.defineProperty(ctx, 'settings', { value: { tailwindcss: {} } })
    expect(get()).toBe('real')
  })

  it('stays bounded when every file brings different settings', () => {
    const ctx = fakeContext()
    const compile = vi.fn((s: Record<string, unknown> | undefined) => s?.tailwindcss)
    const get = createLazySettings(ctx, compile)
    for (let i = 0; i < 100; i++) {
      ctx.settings = { tailwindcss: { rootFontSize: i + 1 } }
      get()
    }
    // The oldest entries were dropped; recent ones are still memoized.
    ctx.settings = { tailwindcss: { rootFontSize: 100 } }
    get()
    expect(compile).toHaveBeenCalledTimes(100)
    ctx.settings = { tailwindcss: { rootFontSize: 1 } }
    get()
    expect(compile).toHaveBeenCalledTimes(101)
  })
})
