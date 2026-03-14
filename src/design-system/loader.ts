import { DesignSystemCache } from './cache'
import { loadDesignSystemSync } from './sync-loader'
import { autoDetectEntryPoint } from './auto-detect'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

export interface LoadResult {
  cache: DesignSystemCache
  entryPoint: string
}

// Module-level SINGLETON — shared across ALL rules
let singleton: {
  cache: DesignSystemCache
  path: string
  mtime: number
} | null = null

/**
 * Returns the design system cache, loading synchronously on first call.
 * Uses execFileSync internally to bridge the async Tailwind API.
 * All rules receive the SAME instance.
 */
export function getLoadedDesignSystem(entryPoint?: string): LoadResult | null {
  const cssPath = entryPoint ?? singleton?.path ?? autoDetectEntryPoint()
  if (!cssPath) return null

  const resolvedPath = resolve(cssPath)

  try {
    const mtime = statSync(resolvedPath).mtimeMs
    if (singleton !== null && singleton.path === resolvedPath && singleton.mtime === mtime) {
      return { cache: singleton.cache, entryPoint: resolvedPath }
    }

    const data = loadDesignSystemSync(resolvedPath)
    if (!data) return null

    const cache = DesignSystemCache.fromPrecomputed(data)
    singleton = { cache, path: resolvedPath, mtime }
    return { cache, entryPoint: resolvedPath }
  } catch {
    return null
  }
}

/**
 * Resets the singleton (useful for tests).
 */
export function resetDesignSystem(): void {
  singleton = null
}
