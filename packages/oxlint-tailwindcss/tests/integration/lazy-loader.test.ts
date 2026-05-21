import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import {
  createLazyLoader,
  getLoadedDesignSystem,
  resetDesignSystem,
} from '../../src/design-system/loader'
import {
  DeprecatedEntryPointShapeError,
  MissingEntryPointError,
} from '../../src/utils/fatal'

// v1 lazy-loader semantics:
//   - `createLazyLoader` defers reading `context.settings`/`context.filename`
//     to the first call inside a visitor (they throw in `createOnce`).
//   - When invoked with no resolvable entry point it throws
//     MissingEntryPointError. Rules wrap the call in `safeGetDS` to convert
//     that to a single diagnostic.
//   - No auto-detect, no lastLoadedPath, no string[] heuristic.

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const COMPONENTS_ENTRY = resolve(__dirname, '../fixtures/with-components.css')

describe('getLoadedDesignSystem', () => {
  beforeEach(() => resetDesignSystem())

  it('loads a known CSS entry point', () => {
    const result = getLoadedDesignSystem(ENTRY_POINT)
    expect(result.entryPoint).toBe(ENTRY_POINT)
    expect(result.cache.isValid('flex')).toBe(true)
  })

  it('returns the same instance on a cache hit (mtime unchanged)', () => {
    const first = getLoadedDesignSystem(ENTRY_POINT)
    const second = getLoadedDesignSystem(ENTRY_POINT)
    expect(second.cache).toBe(first.cache)
  })

  it('respects a custom timeout from settings', () => {
    const settings = { tailwindcss: { entryPoint: ENTRY_POINT, timeout: 60_000 } }
    const result = getLoadedDesignSystem(ENTRY_POINT, settings)
    expect(result.cache.isValid('flex')).toBe(true)
  })
})

describe('createLazyLoader — oxlint lifecycle simulation', () => {
  beforeEach(() => resetDesignSystem())

  it('defers settings/filename access until invoked from a visitor', () => {
    let inVisitor = false
    const context = {
      get options() {
        return [{}]
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
    inVisitor = true
    const result = getDS()
    expect(result.cache.isValid('flex')).toBe(true)
    expect(result.cache.isValid('itms-center')).toBe(false)
  })

  it('rule option entryPoint overrides settings', () => {
    const context = {
      options: [{ entryPoint: ENTRY_POINT }],
      settings: { tailwindcss: { entryPoint: '/nonexistent/path.css' } },
      filename: '/any/file.tsx',
    }
    const result = createLazyLoader(context)()
    expect(result.entryPoint).toBe(ENTRY_POINT)
  })

  it('throws MissingEntryPointError when no entry point is configured', () => {
    const context = {
      options: [{}],
      settings: {},
      filename: '/any/file.tsx',
    }
    const getDS = createLazyLoader(context)
    expect(() => getDS()).toThrow(MissingEntryPointError)
  })

  it('throws DeprecatedEntryPointShapeError for the removed string[] shape', () => {
    const context = {
      options: [{}],
      settings: { tailwindcss: { entryPoint: [ENTRY_POINT, COMPONENTS_ENTRY] } },
      filename: '/any/file.tsx',
    }
    const getDS = createLazyLoader(context)
    expect(() => getDS()).toThrow(DeprecatedEntryPointShapeError)
  })
})

describe('entryPoint mapping array — first match wins', () => {
  beforeEach(() => resetDesignSystem())

  it('routes a file to the CSS whose glob matches it', () => {
    // Globs are matched against the path relative to process.cwd(). When
    // vitest runs, cwd is the package root, so the linted file `tests/.../
    // Component.tsx` is already relative-style.
    const context = {
      options: [{}],
      settings: {
        tailwindcss: {
          entryPoint: [
            { files: 'tests/fixtures/deep/**', use: ENTRY_POINT },
            { files: '**', use: COMPONENTS_ENTRY },
          ],
        },
      },
      filename: resolve(__dirname, '../fixtures/deep/Component.tsx'),
    }
    const result = createLazyLoader(context)()
    // Matched the first glob → default.css
    expect(result.entryPoint).toBe(ENTRY_POINT)
  })

  it('throws MissingEntryPointError when no glob matches the file', () => {
    const context = {
      options: [{}],
      settings: {
        tailwindcss: {
          entryPoint: [{ files: 'this/does/not/match/**', use: ENTRY_POINT }],
        },
      },
      filename: '/somewhere/else/Component.tsx',
    }
    expect(() => createLazyLoader(context)()).toThrow(MissingEntryPointError)
  })
})
