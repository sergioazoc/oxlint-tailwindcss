/**
 * Integration tests for multi-design-system support in monorepos.
 *
 * Validates that files in different packages correctly load their own
 * Tailwind CSS design system, without cross-contamination.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { resolve, join } from 'node:path'
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import {
  getLoadedDesignSystem,
  createLazyLoader,
  resetDesignSystem,
} from '../../src/design-system/loader'

const PROJECT_ROOT = resolve(__dirname, '../..')
const FIXTURES = resolve(__dirname, '../fixtures')
const TEMP_DIR = join(PROJECT_ROOT, '.bench-tmp', 'multi-ds')

// pkg-web uses with-components.css → has .btn, .card component classes
// pkg-api uses custom-theme.css → has color-brand, spacing-18 custom values
const PKG_WEB_CSS = join(FIXTURES, 'with-components.css')
const PKG_API_CSS = join(FIXTURES, 'custom-theme.css')

beforeAll(() => {
  // Create simulated monorepo structure
  mkdirSync(join(TEMP_DIR, 'pkg-web', 'src'), { recursive: true })
  mkdirSync(join(TEMP_DIR, 'pkg-api', 'src'), { recursive: true })

  // Each package has its own package.json (auto-detect boundary)
  writeFileSync(join(TEMP_DIR, 'pkg-web', 'package.json'), '{}')
  writeFileSync(join(TEMP_DIR, 'pkg-api', 'package.json'), '{}')

  // Each package has its own CSS entry point
  copyFileSync(PKG_WEB_CSS, join(TEMP_DIR, 'pkg-web', 'src', 'globals.css'))
  copyFileSync(PKG_API_CSS, join(TEMP_DIR, 'pkg-api', 'src', 'globals.css'))

  // Dummy source files (for auto-detect to resolve from)
  writeFileSync(join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx'), '')
  writeFileSync(join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx'), '')
})

afterAll(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true })
})

describe('Multi-DS: getLoadedDesignSystem per package', () => {
  beforeEach(() => resetDesignSystem())

  it('loads different DS for files in different packages', () => {
    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const apiFile = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')

    const webDS = getLoadedDesignSystem(undefined, {}, webFile)
    const apiDS = getLoadedDesignSystem(undefined, {}, apiFile)

    expect(webDS).not.toBeNull()
    expect(apiDS).not.toBeNull()

    // Different entry points resolved
    expect(webDS!.entryPoint).not.toBe(apiDS!.entryPoint)
    expect(webDS!.entryPoint).toContain('pkg-web')
    expect(apiDS!.entryPoint).toContain('pkg-api')
  })

  it('pkg-web DS recognizes component classes (.btn, .card)', () => {
    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const ds = getLoadedDesignSystem(undefined, {}, webFile)
    expect(ds).not.toBeNull()

    expect(ds!.cache.isValid('btn')).toBe(true)
    expect(ds!.cache.isValid('card')).toBe(true)
  })

  it('pkg-api DS recognizes custom theme classes (bg-brand, spacing-18)', () => {
    const apiFile = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')
    const ds = getLoadedDesignSystem(undefined, {}, apiFile)
    expect(ds).not.toBeNull()

    expect(ds!.cache.isValid('bg-brand')).toBe(true)
    expect(ds!.cache.isValid('text-brand-light')).toBe(true)
  })

  it('loading both DS does not corrupt either', () => {
    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const apiFile = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')

    // Load both
    const webDS1 = getLoadedDesignSystem(undefined, {}, webFile)
    const apiDS = getLoadedDesignSystem(undefined, {}, apiFile)

    // Re-check pkg-web — must still have .btn
    const webDS2 = getLoadedDesignSystem(undefined, {}, webFile)

    expect(webDS1).not.toBeNull()
    expect(apiDS).not.toBeNull()
    expect(webDS2).not.toBeNull()

    // pkg-web still has its component classes
    expect(webDS2!.cache.isValid('btn')).toBe(true)
    expect(webDS2!.cache.isValid('card')).toBe(true)

    // Same cache instance returned (Map hit)
    expect(webDS2!.cache).toBe(webDS1!.cache)
  })

  it('both DS share common Tailwind classes', () => {
    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const apiFile = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')

    const webDS = getLoadedDesignSystem(undefined, {}, webFile)
    const apiDS = getLoadedDesignSystem(undefined, {}, apiFile)

    // Both have standard Tailwind classes
    expect(webDS!.cache.isValid('flex')).toBe(true)
    expect(apiDS!.cache.isValid('flex')).toBe(true)
    expect(webDS!.cache.isValid('p-4')).toBe(true)
    expect(apiDS!.cache.isValid('p-4')).toBe(true)
  })
})

describe('Multi-DS: package without CSS should not inherit another package DS (#7)', () => {
  beforeEach(() => resetDesignSystem())

  it('returns null for package without CSS after loading another package', () => {
    // Create a package without any CSS entry point
    mkdirSync(join(TEMP_DIR, 'pkg-shared', 'src'), { recursive: true })
    writeFileSync(join(TEMP_DIR, 'pkg-shared', 'package.json'), '{}')
    writeFileSync(join(TEMP_DIR, 'pkg-shared', 'src', 'utils.ts'), '')

    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const sharedFile = join(TEMP_DIR, 'pkg-shared', 'src', 'utils.ts')

    // Load pkg-web DS first (sets lastLoadedPath internally)
    const webDS = getLoadedDesignSystem(undefined, {}, webFile)
    expect(webDS).not.toBeNull()

    // pkg-shared has no CSS — should NOT inherit pkg-web's DS
    const sharedDS = getLoadedDesignSystem(undefined, {}, sharedFile)
    expect(sharedDS).toBeNull()
  })

  it('lazy loader returns null for package without CSS', () => {
    mkdirSync(join(TEMP_DIR, 'pkg-shared', 'src'), { recursive: true })
    writeFileSync(join(TEMP_DIR, 'pkg-shared', 'package.json'), '{}')
    writeFileSync(join(TEMP_DIR, 'pkg-shared', 'src', 'utils.ts'), '')

    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const sharedFile = join(TEMP_DIR, 'pkg-shared', 'src', 'utils.ts')

    let currentFile = webFile
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        return {}
      },
      get filename() {
        return currentFile
      },
    }

    const getDS = createLazyLoader(context)

    // Load web DS first
    const webResult = getDS()
    expect(webResult).not.toBeNull()
    expect(webResult!.entryPoint).toContain('pkg-web')

    // Switch to shared — should be null, not inherit web's DS
    currentFile = sharedFile
    const sharedResult = getDS()
    expect(sharedResult).toBeNull()
  })
})

describe('Multi-DS: entryPoint array via settings', () => {
  beforeEach(() => resetDesignSystem())

  it('resolves closest entry point from array for each file', () => {
    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const apiFile = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')
    const webCss = join(TEMP_DIR, 'pkg-web', 'src', 'globals.css')
    const apiCss = join(TEMP_DIR, 'pkg-api', 'src', 'globals.css')

    // Both entry points in a single array
    const settings = { tailwindcss: { entryPoint: [webCss, apiCss] } }

    const webDS = getLoadedDesignSystem(undefined, settings, webFile)
    const apiDS = getLoadedDesignSystem(undefined, settings, apiFile)

    expect(webDS).not.toBeNull()
    expect(apiDS).not.toBeNull()
    expect(webDS!.entryPoint).toContain('pkg-web')
    expect(apiDS!.entryPoint).toContain('pkg-api')
  })

  it('createLazyLoader resolves array entry points per file', () => {
    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const apiFile = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')
    const webCss = join(TEMP_DIR, 'pkg-web', 'src', 'globals.css')
    const apiCss = join(TEMP_DIR, 'pkg-api', 'src', 'globals.css')

    let currentFile = webFile
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        return { tailwindcss: { entryPoint: [webCss, apiCss] } }
      },
      get filename() {
        return currentFile
      },
    }

    const getDS = createLazyLoader(context)

    const webResult = getDS()
    expect(webResult).not.toBeNull()
    expect(webResult!.entryPoint).toContain('pkg-web')
    expect(webResult!.cache.isValid('btn')).toBe(true)

    currentFile = apiFile
    const apiResult = getDS()
    expect(apiResult).not.toBeNull()
    expect(apiResult!.entryPoint).toContain('pkg-api')
    expect(apiResult!.cache.isValid('bg-brand')).toBe(true)
  })
})

describe('Multi-DS: createLazyLoader per-file resolution', () => {
  beforeEach(() => resetDesignSystem())

  it('returns different DS when filename changes between packages', () => {
    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const apiFile = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')

    let currentFile = webFile
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        return {}
      },
      get filename() {
        return currentFile
      },
    }

    const getDS = createLazyLoader(context)

    // First call: resolves to pkg-web's DS
    const webResult = getDS()
    expect(webResult).not.toBeNull()
    expect(webResult!.entryPoint).toContain('pkg-web')
    expect(webResult!.cache.isValid('btn')).toBe(true)

    // Switch to pkg-api
    currentFile = apiFile
    const apiResult = getDS()
    expect(apiResult).not.toBeNull()
    expect(apiResult!.entryPoint).toContain('pkg-api')
    expect(apiResult!.cache.isValid('bg-brand')).toBe(true)

    // Switch back to pkg-web — should return pkg-web DS again
    currentFile = webFile
    const webResult2 = getDS()
    expect(webResult2).not.toBeNull()
    expect(webResult2!.entryPoint).toContain('pkg-web')
    expect(webResult2!.cache.isValid('btn')).toBe(true)
  })

  it('returns same DS for different files in same package', () => {
    // Create a second file in pkg-web
    const file1 = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const file2 = join(TEMP_DIR, 'pkg-web', 'src', 'Header.tsx')
    writeFileSync(file2, '')

    let currentFile = file1
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        return {}
      },
      get filename() {
        return currentFile
      },
    }

    const getDS = createLazyLoader(context)

    const result1 = getDS()
    currentFile = file2
    const result2 = getDS()

    expect(result1).not.toBeNull()
    expect(result2).not.toBeNull()
    expect(result1!.entryPoint).toBe(result2!.entryPoint)
    expect(result1!.cache).toBe(result2!.cache) // Same cache instance
  })

  it('fixed entryPoint from settings overrides auto-detect for all files', () => {
    const webFile = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
    const apiFile = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')
    const fixedCSS = join(FIXTURES, 'default.css')

    let currentFile = webFile
    const context = {
      get options() {
        return [{}]
      },
      get settings() {
        return { tailwindcss: { entryPoint: fixedCSS } }
      },
      get filename() {
        return currentFile
      },
    }

    const getDS = createLazyLoader(context)

    // Both files should use the fixed entry point
    const result1 = getDS()
    currentFile = apiFile
    const result2 = getDS()

    expect(result1).not.toBeNull()
    expect(result2).not.toBeNull()
    expect(result1!.entryPoint).toBe(result2!.entryPoint)
    expect(result1!.entryPoint).toBe(resolve(fixedCSS))
  })
})
