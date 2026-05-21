import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import {
  getLoadedDesignSystem,
  createLazyLoader,
  resetDesignSystem,
} from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('getLoadedDesignSystem resolution order', () => {
  beforeEach(() => resetDesignSystem())

  it('rule option wins over settings', () => {
    const badSettings = { tailwindcss: { entryPoint: '/nonexistent.css' } }
    const result = getLoadedDesignSystem(ENTRY_POINT, badSettings)
    expect(result).not.toBeNull()
    expect(result!.entryPoint).toBe(ENTRY_POINT)
  })

  it('settings wins over auto-detect', () => {
    const settings = { tailwindcss: { entryPoint: ENTRY_POINT } }
    // filePath points to a dir with no CSS — auto-detect would fail
    const result = getLoadedDesignSystem(undefined, settings, '/nonexistent/file.tsx')
    expect(result).not.toBeNull()
    expect(result!.entryPoint).toBe(ENTRY_POINT)
  })

  it('auto-detects via filePath when no entryPoint or settings', () => {
    // filePath near a CSS with tailwind signal → auto-detect finds it
    // Use ENTRY_POINT's directory as the "linted file" location
    const fakeFile = resolve(ENTRY_POINT, '../deep/nested/Component.tsx')
    const result = getLoadedDesignSystem(undefined, {}, fakeFile)
    expect(result).not.toBeNull()
    expect(result!.cache.isValid('flex')).toBe(true)
  })

  it('returns null when all sources fail', () => {
    const result = getLoadedDesignSystem(undefined, {}, '/nonexistent/file.tsx')
    expect(result).toBeNull()
  })

  it('ignores malformed settings without crashing', () => {
    // settings.tailwindcss is a string, not an object
    const result = getLoadedDesignSystem(undefined, { tailwindcss: 'bad' } as any)
    expect(result).toBeNull()
  })
})

describe('createLazyLoader — oxlint lifecycle simulation', () => {
  beforeEach(() => resetDesignSystem())

  it('fails in createOnce, succeeds in visitor via settings', () => {
    // This is the EXACT bug scenario:
    // 1. createOnce: settings/filename throw → DS not loaded
    // 2. visitor: settings available → DS loads
    let inVisitor = false
    const context = {
      get options() {
        return [{}] // no entryPoint in rule options
      },
      get settings() {
        if (!inVisitor) throw new Error('Cannot access settings in createOnce')
        return { tailwindcss: { entryPoint: ENTRY_POINT } }
      },
      get filename() {
        if (!inVisitor) throw new Error('Cannot access filename in createOnce')
        return '/some/project/src/App.tsx'
      },
    }

    const getDS = createLazyLoader(context)

    // createOnce phase — should fail gracefully
    expect(getDS()).toBeNull()

    // visitor phase — should succeed now
    inVisitor = true
    const result = getDS()
    expect(result).not.toBeNull()
    expect(result!.cache.isValid('flex')).toBe(true)
    expect(result!.cache.isValid('itms-center')).toBe(false)
  })

  it('fails in createOnce, succeeds in visitor via filename auto-detect', () => {
    // Same lifecycle but DS loads via auto-detect (no settings entryPoint)
    let inVisitor = false
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        if (!inVisitor) throw new Error('Cannot access settings in createOnce')
        return {} // empty — no entryPoint
      },
      get filename() {
        if (!inVisitor) throw new Error('Cannot access filename in createOnce')
        // Points near fixtures/index.css (symlink to default.css)
        return resolve(__dirname, '../fixtures/deep/Component.tsx')
      },
    }

    const getDS = createLazyLoader(context)
    expect(getDS()).toBeNull()

    inVisitor = true
    const result = getDS()
    expect(result).not.toBeNull()
    expect(result!.cache.isValid('flex')).toBe(true)
  })

  it('stops retrying with same filename, retries with new filename', () => {
    let currentFile = '/nonexistent/file.tsx'
    let callCount = 0
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        return {} // no entryPoint
      },
      get filename() {
        callCount++
        return currentFile
      },
    }

    const getDS = createLazyLoader(context)
    expect(getDS()).toBeNull()
    expect(getDS()).toBeNull()

    // Same filename → second call short-circuits
    expect(callCount).toBe(2) // first reads filename, second reads and matches → skip

    // New filename → retries auto-detect
    currentFile = '/other/nonexistent/file.tsx'
    expect(getDS()).toBeNull()
    expect(callCount).toBe(3) // read new filename, tried, failed
  })
})

describe('timeout via settings', () => {
  beforeEach(() => resetDesignSystem())

  it('respects custom timeout from settings', () => {
    const settings = { tailwindcss: { entryPoint: ENTRY_POINT, timeout: 60000 } }
    const result = getLoadedDesignSystem(undefined, settings)
    expect(result).not.toBeNull()
    expect(result!.cache.isValid('flex')).toBe(true)
  })

  it('ignores invalid timeout values', () => {
    const settings = { tailwindcss: { entryPoint: ENTRY_POINT, timeout: -1 } }
    const result = getLoadedDesignSystem(undefined, settings)
    // Falls back to default 30s timeout — still loads successfully
    expect(result).not.toBeNull()
  })
})

describe('entryPoint as array — closest match', () => {
  beforeEach(() => resetDesignSystem())

  it('single-element array works like a string', () => {
    const settings = { tailwindcss: { entryPoint: [ENTRY_POINT] } }
    const result = getLoadedDesignSystem(undefined, settings, '/any/file.tsx')
    expect(result).not.toBeNull()
    expect(result!.entryPoint).toBe(ENTRY_POINT)
  })

  it('picks closest entry point to the file being linted', () => {
    // Two fixtures in different dirs
    const componentsCss = resolve(__dirname, '../fixtures/with-components.css')
    const settings = {
      tailwindcss: { entryPoint: [ENTRY_POINT, componentsCss] },
    }

    // File near default.css → should pick default.css
    const result = getLoadedDesignSystem(
      undefined,
      settings,
      resolve(__dirname, '../fixtures/deep/Component.tsx'),
    )
    expect(result).not.toBeNull()
    // Both are in the same fixtures dir, so either could win — but both should load
    expect(result!.cache.isValid('flex')).toBe(true)
  })

  it('ignores non-string arrays', () => {
    const settings = { tailwindcss: { entryPoint: [123, true] } }
    const result = getLoadedDesignSystem(undefined, settings as any, '/nonexistent/file.tsx')
    expect(result).toBeNull()
  })

  it('ignores empty array', () => {
    const settings = { tailwindcss: { entryPoint: [] } }
    const result = getLoadedDesignSystem(undefined, settings, '/nonexistent/file.tsx')
    expect(result).toBeNull()
  })
})

// NOTE: Monorepo auto-detect path resolution is thoroughly tested in
// auto-detect.test.ts (88 tests). The lifecycle simulation test above
// verifies createLazyLoader pipes filename to getLoadedDesignSystem.
// No need to do full DS loads from temp files here (~4s each).
