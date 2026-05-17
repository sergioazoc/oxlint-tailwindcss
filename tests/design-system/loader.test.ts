import { describe, it, expect } from 'vitest'
import { resolveCssPath } from '../../src/design-system/loader'

const noAutoDetect = () => null

describe('resolveCssPath', () => {
  describe('explicit entry point (rule option)', () => {
    it('wins over settings, auto-detect and lastPath', () => {
      const result = resolveCssPath({
        entryPoint: '/explicit.css',
        settingsEntry: '/settings.css',
        lastPath: '/last.css',
        autoDetect: () => '/detected.css',
      })
      expect(result).toEqual({ path: '/explicit.css', isExplicit: true })
    })
  })

  describe('settings.entryPoint as string', () => {
    it('is used when no rule option is given', () => {
      const result = resolveCssPath({
        settingsEntry: '/settings.css',
        autoDetect: noAutoDetect,
      })
      expect(result).toEqual({ path: '/settings.css', isExplicit: true })
    })
  })

  describe('settings.entryPoint as array', () => {
    it('picks the entry with longest common directory prefix to filePath', () => {
      const result = resolveCssPath({
        settingsEntry: ['/repo/apps/web/styles.css', '/repo/apps/admin/styles.css'],
        filePath: '/repo/apps/admin/src/page.tsx',
        autoDetect: noAutoDetect,
      })
      expect(result).toEqual({ path: '/repo/apps/admin/styles.css', isExplicit: true })
    })

    it('falls back to first entry when filePath is missing', () => {
      const result = resolveCssPath({
        settingsEntry: ['/a/styles.css', '/b/styles.css'],
        autoDetect: noAutoDetect,
      })
      expect(result).toEqual({ path: '/a/styles.css', isExplicit: true })
    })
  })

  describe('auto-detect', () => {
    it('is used when no explicit entry is provided', () => {
      const result = resolveCssPath({
        filePath: '/repo/src/page.tsx',
        autoDetect: () => '/repo/app/styles.css',
      })
      expect(result).toEqual({ path: '/repo/app/styles.css', isExplicit: false })
    })

    it('marks isExplicit:false so the caller does NOT update lastLoadedPath (monorepo safety)', () => {
      const result = resolveCssPath({
        filePath: '/repo/pkg-a/src/x.tsx',
        autoDetect: () => '/repo/pkg-a/styles.css',
      })
      expect(result.isExplicit).toBe(false)
    })
  })

  describe('lastPath fallback', () => {
    it('is used only when explicit and auto-detect both fail', () => {
      const result = resolveCssPath({
        lastPath: '/previously-loaded.css',
        autoDetect: noAutoDetect,
      })
      expect(result).toEqual({ path: '/previously-loaded.css', isExplicit: false })
    })

    it('is skipped when auto-detect succeeds', () => {
      const result = resolveCssPath({
        lastPath: '/old.css',
        autoDetect: () => '/fresh.css',
      })
      expect(result.path).toBe('/fresh.css')
    })
  })

  describe('no resolution possible', () => {
    it('returns null path when nothing resolves', () => {
      const result = resolveCssPath({ autoDetect: noAutoDetect })
      expect(result).toEqual({ path: null, isExplicit: false })
    })

    it('treats null lastPath the same as undefined', () => {
      const result = resolveCssPath({ lastPath: null, autoDetect: noAutoDetect })
      expect(result.path).toBeNull()
    })
  })
})
