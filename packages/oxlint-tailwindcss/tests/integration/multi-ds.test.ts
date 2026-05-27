/**
 * Integration tests for multi-design-system support in monorepos.
 *
 * Validates that the v1 entryPoint mapping array correctly routes each
 * package's files to its own CSS, with no cross-contamination.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { resolve, join, relative } from 'node:path'
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import {
  createLazyLoader,
  getLoadedDesignSystem,
  resetDesignSystem,
} from '../../src/design-system/loader'

const PROJECT_ROOT = resolve(__dirname, '../..')
const FIXTURES = resolve(__dirname, '../fixtures')
const TEMP_DIR = join(PROJECT_ROOT, '.bench-tmp', 'multi-ds')

// pkg-web uses with-components.css → has .btn, .card component classes
// pkg-api uses custom-theme.css → has color-brand, spacing-18 custom values
const PKG_WEB_CSS = join(FIXTURES, 'with-components.css')
const PKG_API_CSS = join(FIXTURES, 'custom-theme.css')

const PKG_WEB_FILE = join(TEMP_DIR, 'pkg-web', 'src', 'App.tsx')
const PKG_WEB_GLOBALS = join(TEMP_DIR, 'pkg-web', 'src', 'globals.css')
const PKG_API_FILE = join(TEMP_DIR, 'pkg-api', 'src', 'Schema.tsx')
const PKG_API_GLOBALS = join(TEMP_DIR, 'pkg-api', 'src', 'globals.css')

// Convert absolute paths to a glob/path relative to process.cwd(); the glob
// matcher in `resolveByGlobMapping` normalizes its input that way.
function toCwdRelative(absolutePath: string): string {
  return relative(process.cwd(), absolutePath).split('\\').join('/')
}

beforeAll(() => {
  mkdirSync(join(TEMP_DIR, 'pkg-web', 'src'), { recursive: true })
  mkdirSync(join(TEMP_DIR, 'pkg-api', 'src'), { recursive: true })
  writeFileSync(join(TEMP_DIR, 'pkg-web', 'package.json'), '{}')
  writeFileSync(join(TEMP_DIR, 'pkg-api', 'package.json'), '{}')
  copyFileSync(PKG_WEB_CSS, PKG_WEB_GLOBALS)
  copyFileSync(PKG_API_CSS, PKG_API_GLOBALS)
  writeFileSync(PKG_WEB_FILE, '')
  writeFileSync(PKG_API_FILE, '')
})

afterAll(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true })
})

describe('Multi-DS: getLoadedDesignSystem per CSS entry', () => {
  beforeEach(() => resetDesignSystem())

  it('loads independent design systems for two distinct CSS files', () => {
    const webDS = getLoadedDesignSystem(PKG_WEB_GLOBALS)
    const apiDS = getLoadedDesignSystem(PKG_API_GLOBALS)
    expect(webDS.entryPoint).not.toBe(apiDS.entryPoint)
    expect(webDS.cache.isValid('btn')).toBe(true) // component class only in web
    expect(apiDS.cache.isValid('btn')).toBe(false)
    expect(apiDS.cache.isValid('bg-brand')).toBe(true) // custom theme only in api
    expect(webDS.cache.isValid('bg-brand')).toBe(false)
  })

  it('both design systems share standard Tailwind utilities', () => {
    const webDS = getLoadedDesignSystem(PKG_WEB_GLOBALS)
    const apiDS = getLoadedDesignSystem(PKG_API_GLOBALS)
    for (const cls of ['flex', 'p-4', 'bg-red-500', 'hover:bg-blue-700']) {
      expect(webDS.cache.isValid(cls)).toBe(true)
      expect(apiDS.cache.isValid(cls)).toBe(true)
    }
  })

  it('reloads from cache when mtime is unchanged', () => {
    const first = getLoadedDesignSystem(PKG_WEB_GLOBALS)
    const second = getLoadedDesignSystem(PKG_WEB_GLOBALS)
    expect(second.cache).toBe(first.cache)
  })
})

describe('Multi-DS: createLazyLoader with entryPoint mapping array', () => {
  beforeEach(() => resetDesignSystem())

  const mappingSettings = {
    tailwindcss: {
      entryPoint: [
        { files: `${toCwdRelative(join(TEMP_DIR, 'pkg-web'))}/**`, use: PKG_WEB_GLOBALS },
        { files: `${toCwdRelative(join(TEMP_DIR, 'pkg-api'))}/**`, use: PKG_API_GLOBALS },
      ],
    },
  }

  it('routes a pkg-web file to pkg-web globals.css', () => {
    const context = {
      options: [{}],
      settings: mappingSettings,
      filename: PKG_WEB_FILE,
    }
    const result = createLazyLoader(context)()
    expect(result.entryPoint).toBe(PKG_WEB_GLOBALS)
    expect(result.cache.isValid('btn')).toBe(true)
  })

  it('routes a pkg-api file to pkg-api globals.css', () => {
    const context = {
      options: [{}],
      settings: mappingSettings,
      filename: PKG_API_FILE,
    }
    const result = createLazyLoader(context)()
    expect(result.entryPoint).toBe(PKG_API_GLOBALS)
    expect(result.cache.isValid('bg-brand')).toBe(true)
  })
})
