import { DesignSystemCache } from './cache'
import { loadDesignSystemSync } from './sync-loader'
import { autoDetectEntryPoint } from './auto-detect'
import { debugLog, isDebugEnabled, setDebugEnabled, resetDebug } from './debug'
import { statSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'

export interface LoadResult {
  cache: DesignSystemCache
  entryPoint: string
}

// Per-entry-point DS cache — supports multiple design systems in monorepos
const dsCache = new Map<string, { cache: DesignSystemCache; mtime: number }>()

// Auto-detect result cache by directory — avoids repeated filesystem walks
const autoDetectCache = new Map<string, string | null>()

// Fallback path — only set by explicit entryPoint calls (tests, rule options),
// never by auto-detect. Prevents cross-package contamination in monorepos.
let lastLoadedPath: string | null = null

/**
 * Extracts `entryPoint` from `context.settings.tailwindcss`.
 * Supports both `string` and `string[]` (for monorepos).
 */
function entryPointFromSettings(
  settings?: Readonly<Record<string, unknown>>,
): string | string[] | undefined {
  const tw = settings?.tailwindcss
  if (tw && typeof tw === 'object' && 'entryPoint' in tw) {
    const ep = (tw as Record<string, unknown>).entryPoint
    if (typeof ep === 'string') return ep
    if (Array.isArray(ep) && ep.length > 0 && ep.every((e) => typeof e === 'string')) {
      return ep as string[]
    }
  }
  return undefined
}

/**
 * Given an array of entry points and a file path, pick the one that shares
 * the longest common directory prefix with the file. Falls back to first entry.
 */
function resolveClosestEntryPoint(entryPoints: string[], filePath?: string): string {
  if (entryPoints.length === 1 || !filePath) return entryPoints[0]

  const fileDir = dirname(resolve(filePath))
  let best = entryPoints[0]
  let bestLen = 0

  for (const ep of entryPoints) {
    const epDir = dirname(resolve(ep))
    // Count shared path prefix length
    const len = commonPrefixLength(fileDir, epDir)
    if (len > bestLen) {
      bestLen = len
      best = ep
    }
  }

  return best
}

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let i = 0
  while (i < len && a[i] === b[i]) i++
  return i
}

/**
 * Extracts `rootFontSize` from `context.settings.tailwindcss` (default: 16).
 */
export function rootFontSizeFromSettings(settings?: Readonly<Record<string, unknown>>): number {
  const tw = settings?.tailwindcss
  if (tw && typeof tw === 'object' && 'rootFontSize' in tw) {
    const v = (tw as Record<string, unknown>).rootFontSize
    if (typeof v === 'number' && v > 0) return v
  }
  return 16
}

/**
 * Extracts `timeout` from `context.settings.tailwindcss`.
 */
function timeoutFromSettings(settings?: Readonly<Record<string, unknown>>): number | undefined {
  const tw = settings?.tailwindcss
  if (tw && typeof tw === 'object' && 'timeout' in tw) {
    const t = (tw as Record<string, unknown>).timeout
    if (typeof t === 'number' && t > 0) return t
  }
  return undefined
}

/**
 * Cached auto-detect: caches by directory since all files in the same directory
 * resolve to the same entry point. Avoids repeated filesystem walks.
 */
function cachedAutoDetect(filePath?: string): string | null {
  if (!filePath) return autoDetectEntryPoint(filePath)
  const dir = dirname(resolve(filePath))
  const cached = autoDetectCache.get(dir)
  if (cached !== undefined) return cached
  const result = autoDetectEntryPoint(filePath)
  autoDetectCache.set(dir, result)
  return result
}

/**
 * Pure resolution of which CSS entry point to use for a given context.
 *
 * Resolution order: rule option `entryPoint` > `settingsEntry` (string or
 * closest-of-array) > `autoDetect(filePath)` > `lastPath` fallback.
 *
 * Returns `isExplicit: true` when the result came from a rule option or
 * settings (not auto-detect / lastPath) — the caller uses this to decide
 * whether to update the shared `lastLoadedPath` fallback. Auto-detect
 * results never update the fallback (prevents cross-package contamination
 * in monorepos).
 *
 * `autoDetect` is injected for testability; in production it's
 * `cachedAutoDetect`. Pure: does not touch module state.
 */
export function resolveCssPath(args: {
  entryPoint?: string
  settingsEntry?: string | string[]
  filePath?: string
  lastPath?: string | null
  autoDetect: (filePath?: string) => string | null
}): { path: string | null; isExplicit: boolean } {
  const { entryPoint, settingsEntry, filePath, lastPath, autoDetect } = args
  const explicit =
    entryPoint ??
    (Array.isArray(settingsEntry)
      ? resolveClosestEntryPoint(settingsEntry, filePath)
      : settingsEntry)
  if (explicit) return { path: explicit, isExplicit: true }
  const detected = autoDetect(filePath)
  if (detected) return { path: detected, isExplicit: false }
  return { path: lastPath ?? null, isExplicit: false }
}

/**
 * Returns the design system cache, loading synchronously on first call.
 * Uses execFileSync internally to bridge the async Tailwind API.
 *
 * Supports multiple design systems: each unique CSS entry point gets its own cache.
 * In monorepos, files in different packages auto-detect to different entry points
 * and each gets the correct DS.
 *
 * Resolution order: rule option `entryPoint` > `settings.tailwindcss.entryPoint` > auto-detect.
 */
export function getLoadedDesignSystem(
  entryPoint?: string,
  settings?: Readonly<Record<string, unknown>>,
  filePath?: string,
): LoadResult | null {
  const { path: cssPath, isExplicit } = resolveCssPath({
    entryPoint,
    settingsEntry: entryPointFromSettings(settings),
    filePath,
    lastPath: lastLoadedPath,
    autoDetect: cachedAutoDetect,
  })
  if (!cssPath) return null

  const resolvedPath = resolve(cssPath)

  try {
    const mtime = statSync(resolvedPath).mtimeMs
    const cached = dsCache.get(resolvedPath)
    if (cached && cached.mtime === mtime) {
      if (isExplicit) lastLoadedPath = resolvedPath
      return { cache: cached.cache, entryPoint: resolvedPath }
    }

    const data = loadDesignSystemSync(resolvedPath, timeoutFromSettings(settings))
    if (!data) return null

    const cache = DesignSystemCache.fromPrecomputed(data)
    dsCache.set(resolvedPath, { cache, mtime })
    debugLog(`Loaded design system from "${resolvedPath}"`)
    if (isExplicit) lastLoadedPath = resolvedPath
    return { cache, entryPoint: resolvedPath }
  } catch {
    return null
  }
}

/**
 * Creates a lazy DS loader that resolves the correct design system per file.
 *
 * In `createOnce`, `context.settings` and `context.filename` throw. When visitors
 * run, they become available. The loader re-resolves when the filename changes,
 * supporting monorepos where different files need different design systems.
 *
 * When a fixed entryPoint is provided (rule option or settings), it's used for all
 * files and cached after first resolution.
 */
export function createLazyLoader(context: {
  options?: readonly unknown[]
  settings?: Readonly<Record<string, unknown>>
  filename?: string
}): () => LoadResult | null {
  let lastFilePath: string | undefined
  let lastResult: LoadResult | null = null
  let fixedEntryResolved = false
  let fixedResult: LoadResult | null = null
  let debugInitialized = false

  return () => {
    let entryPoint: string | undefined
    try {
      const opts = context.options?.[0] as { entryPoint?: string } | undefined
      entryPoint = opts?.entryPoint
    } catch {}

    let settings: Readonly<Record<string, unknown>> | undefined
    try {
      settings = context.settings
    } catch {}

    let filePath: string | undefined
    try {
      filePath = context.filename
    } catch {}

    // Initialize debug from settings on first successful access
    if (!debugInitialized && settings) {
      debugInitialized = true
      setDebugEnabled(isDebugEnabled(settings))
    }

    // Fixed entry point (rule option or settings) — same for all files
    const settingsEntry = entryPointFromSettings(settings)
    const fixedEntry = entryPoint ?? (typeof settingsEntry === 'string' ? settingsEntry : undefined)
    if (fixedEntry) {
      if (fixedEntryResolved) return fixedResult
      fixedEntryResolved = true
      fixedResult = getLoadedDesignSystem(fixedEntry, settings, filePath)
      if (fixedResult && filePath) {
        debugLog(
          `${relative(process.cwd(), filePath)} → ${relative(process.cwd(), fixedResult.entryPoint)}`,
        )
      }
      return fixedResult
    }

    // Array entry point from settings — resolve closest per file
    if (Array.isArray(settingsEntry)) {
      const closest = resolveClosestEntryPoint(settingsEntry, filePath)
      // Re-resolve when the file changes (different file may map to different entry)
      if (filePath && filePath === lastFilePath) return lastResult
      if (filePath) lastFilePath = filePath
      lastResult = getLoadedDesignSystem(closest, settings, filePath)
      if (lastResult && filePath) {
        debugLog(
          `${relative(process.cwd(), filePath)} → ${relative(process.cwd(), lastResult.entryPoint)}`,
        )
      }
      return lastResult
    }

    // Auto-detect mode: re-resolve when the file changes
    if (filePath && filePath === lastFilePath) return lastResult
    if (filePath) lastFilePath = filePath

    lastResult = getLoadedDesignSystem(undefined, settings, filePath)
    if (lastResult && filePath) {
      debugLog(
        `${relative(process.cwd(), filePath)} → ${relative(process.cwd(), lastResult.entryPoint)}`,
      )
    }
    return lastResult
  }
}

/**
 * Resets all DS caches (useful for tests).
 */
export function resetDesignSystem(): void {
  dsCache.clear()
  autoDetectCache.clear()
  lastLoadedPath = null
  resetDebug()
}
