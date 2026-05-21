import { DesignSystemCache } from './cache'
import { loadDesignSystemSync } from './sync-loader'
import { debugLog, isDebugEnabled, setDebugEnabled, resetDebug } from './debug'
import { statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import {
  DeprecatedEntryPointShapeError,
  DesignSystemLoadError,
  MissingEntryPointError,
  isFatalError,
} from '../utils/fatal'

export interface EntryPointMapping {
  files: string | string[]
  use: string
}

export interface LoadResult {
  cache: DesignSystemCache
  entryPoint: string
}

type EntryPointSetting = string | EntryPointMapping[]

const dsCache = new Map<string, { cache: DesignSystemCache; mtime: number }>()

function isEntryPointMapping(v: unknown): v is EntryPointMapping {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  const filesOk = typeof m.files === 'string' || (Array.isArray(m.files) && m.files.every((s) => typeof s === 'string'))
  return filesOk && typeof m.use === 'string'
}

/**
 * Read `settings.tailwindcss.entryPoint` and normalize it to the v1 shape.
 *
 * Throws `DeprecatedEntryPointShapeError` if the legacy `string[]` shape is
 * still in use (removed in v1; the user must migrate to `{ files, use }[]`).
 */
export function entryPointFromSettings(
  settings?: Readonly<Record<string, unknown>>,
): EntryPointSetting | undefined {
  const tw = settings?.tailwindcss
  if (!tw || typeof tw !== 'object' || !('entryPoint' in tw)) return undefined
  const ep = (tw as Record<string, unknown>).entryPoint
  if (typeof ep === 'string') return ep
  if (Array.isArray(ep)) {
    if (ep.length === 0) return undefined
    if (ep.every((e) => typeof e === 'string')) {
      throw new DeprecatedEntryPointShapeError(
        '`settings.tailwindcss.entryPoint: string[]` was removed in v1.0.0.',
        'Convert each entry into an object with explicit globs:\n' +
          '  entryPoint: [\n' +
          '    { files: "packages/app/**", use: "packages/app/src/styles.css" },\n' +
          '    ...\n' +
          '  ]\n' +
          'See https://oxlint-tailwindcss.dev/migration/v0-to-v1',
      )
    }
    if (ep.every(isEntryPointMapping)) return ep as EntryPointMapping[]
    throw new MissingEntryPointError(
      '`settings.tailwindcss.entryPoint` must be either a string or an array of `{ files, use }` objects.',
      'Each item needs `files` (glob or array of globs) and `use` (path to a CSS file).',
    )
  }
  return undefined
}

/**
 * Compile a minimal glob pattern to a regular expression.
 *
 * Supported syntax: `**` (any depth), `*` (any chars except `/`), `?` (one
 * char except `/`), plus literal segments. Anchored on both ends.
 */
function globToRegExp(glob: string): RegExp {
  let re = ''
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i += 2
      if (glob[i] === '/') i++
    } else if (c === '*') {
      re += '[^/]*'
      i++
    } else if (c === '?') {
      re += '[^/]'
      i++
    } else if ('+()|.\\$^{}[]'.includes(c)) {
      re += '\\' + c
      i++
    } else {
      re += c
      i++
    }
  }
  return new RegExp('^' + re + '$')
}

function matchesAnyGlob(filePath: string, globs: string | string[]): boolean {
  const list = typeof globs === 'string' ? [globs] : globs
  return list.some((g) => globToRegExp(g).test(filePath))
}

/**
 * Resolve a file path to its entry-point CSS via a mapping array.
 * First-match-wins. Paths are matched relative to `baseDir` (typically the
 * process CWD where oxlint runs), with forward-slash normalization for
 * cross-platform consistency. Returns the absolute CSS path, or `null` if
 * no mapping matches.
 */
export function resolveByGlobMapping(
  mappings: EntryPointMapping[],
  filePath: string,
  baseDir: string,
): string | null {
  const relPath = relative(baseDir, resolve(filePath)).split('\\').join('/')
  for (const m of mappings) {
    if (matchesAnyGlob(relPath, m.files)) return resolve(baseDir, m.use)
  }
  return null
}

/**
 * Extract `rootFontSize` from `settings.tailwindcss` (default: 16).
 */
export function rootFontSizeFromSettings(settings?: Readonly<Record<string, unknown>>): number {
  const tw = settings?.tailwindcss
  if (tw && typeof tw === 'object' && 'rootFontSize' in tw) {
    const v = (tw as Record<string, unknown>).rootFontSize
    if (typeof v === 'number' && v > 0) return v
  }
  return 16
}

function timeoutFromSettings(settings?: Readonly<Record<string, unknown>>): number | undefined {
  const tw = settings?.tailwindcss
  if (tw && typeof tw === 'object' && 'timeout' in tw) {
    const t = (tw as Record<string, unknown>).timeout
    if (typeof t === 'number' && t > 0) return t
  }
  return undefined
}

/**
 * Load the design system for a specific CSS entry point.
 *
 * Throws `DesignSystemLoadError` if the load fails for any reason. Callers
 * (rules via `createLazyLoader`) catch via `reportFatalDsError` and surface
 * the failure as a single Program-level diagnostic.
 *
 * Cached per absolute entry-point path, keyed by mtime. In monorepos each
 * unique CSS gets its own cache entry.
 */
export function getLoadedDesignSystem(
  cssPath: string,
  settings?: Readonly<Record<string, unknown>>,
): LoadResult {
  const resolvedPath = resolve(cssPath)

  let mtime: number
  try {
    mtime = statSync(resolvedPath).mtimeMs
  } catch (cause) {
    throw new DesignSystemLoadError(
      `Could not stat CSS entry point: ${resolvedPath}`,
      'Check that the file exists and is readable. The path is resolved relative to the oxlint working directory.',
      { cause: cause instanceof Error ? cause : undefined },
    )
  }

  const cached = dsCache.get(resolvedPath)
  if (cached && cached.mtime === mtime) return { cache: cached.cache, entryPoint: resolvedPath }

  const data = loadDesignSystemSync(resolvedPath, timeoutFromSettings(settings))
  const cache = DesignSystemCache.fromPrecomputed(data)
  dsCache.set(resolvedPath, { cache, mtime })
  debugLog(`Loaded design system from "${resolvedPath}"`)
  return { cache, entryPoint: resolvedPath }
}

/**
 * Lazy DS loader for a rule. Resolves the correct design system for each
 * file being linted, using (in priority order):
 *
 *   1. Rule option `entryPoint` (a string path).
 *   2. `settings.tailwindcss.entryPoint` as a string.
 *   3. `settings.tailwindcss.entryPoint` as an `EntryPointMapping[]` —
 *      first matching glob (relative to CWD) wins.
 *
 * If none of those produce an entry point for the current file, throws
 * `MissingEntryPointError`. If the resolved CSS fails to load, throws
 * `DesignSystemLoadError`. Both extend `OxlintTailwindError` and are
 * meant to be caught by `reportFatalDsError` in the rule's `check()`.
 *
 * `context.settings` and `context.filename` are unavailable in `createOnce`,
 * so the actual work is deferred until the returned thunk is invoked from
 * inside a visitor.
 */
export function createLazyLoader(context: {
  options?: readonly unknown[]
  settings?: Readonly<Record<string, unknown>>
  filename?: string
}): () => LoadResult {
  let debugInitialized = false
  let lastFilePath: string | undefined
  let lastResult: LoadResult | undefined

  return () => {
    let ruleOptionEntry: string | undefined
    try {
      const opts = context.options?.[0] as { entryPoint?: string } | undefined
      ruleOptionEntry = opts?.entryPoint
    } catch {}

    let settings: Readonly<Record<string, unknown>> | undefined
    try {
      settings = context.settings
    } catch {}

    let filePath: string | undefined
    try {
      filePath = context.filename
    } catch {}

    if (!debugInitialized && settings) {
      debugInitialized = true
      setDebugEnabled(isDebugEnabled(settings))
    }

    const settingsEntry = entryPointFromSettings(settings)
    const cssPath = resolveEntryPointForFile(ruleOptionEntry, settingsEntry, filePath)

    // Avoid redundant work when linting the same file repeatedly.
    if (filePath === lastFilePath && lastResult && lastResult.entryPoint === resolve(cssPath)) {
      return lastResult
    }
    lastFilePath = filePath

    lastResult = getLoadedDesignSystem(cssPath, settings)
    if (filePath) {
      debugLog(
        `${relative(process.cwd(), filePath)} → ${relative(process.cwd(), lastResult.entryPoint)}`,
      )
    }
    return lastResult
  }
}

/**
 * Pure resolution from (rule option, settings entry, file path) to a CSS
 * entry-point path. Exported for testability.
 *
 * Throws `MissingEntryPointError` if nothing resolves. The error message
 * names the file so the user knows which one tripped the configuration.
 */
export function resolveEntryPointForFile(
  ruleOptionEntry: string | undefined,
  settingsEntry: EntryPointSetting | undefined,
  filePath: string | undefined,
): string {
  if (ruleOptionEntry) return ruleOptionEntry
  if (typeof settingsEntry === 'string') return settingsEntry
  if (Array.isArray(settingsEntry)) {
    if (!filePath) {
      throw new MissingEntryPointError(
        '`settings.tailwindcss.entryPoint` is a mapping array but no file path is available to match against.',
        'This usually means the rule ran outside the linter context. Open an issue if you see this in a real lint run.',
      )
    }
    const matched = resolveByGlobMapping(settingsEntry, filePath, process.cwd())
    if (matched) return matched
    throw new MissingEntryPointError(
      `No \`entryPoint\` mapping matched \`${filePath}\`.`,
      'Add a mapping covering this file to `settings.tailwindcss.entryPoint`, or use a `"**"` fallback entry.',
    )
  }
  throw new MissingEntryPointError(
    `\`settings.tailwindcss.entryPoint\` is required${filePath ? ` (linting \`${filePath}\`)` : ''}.`,
    'Set it to a string (single-project) or an array of `{ files, use }` mappings (monorepo).',
  )
}

/** Reset all DS caches (useful for tests). */
export function resetDesignSystem(): void {
  dsCache.clear()
  resetDebug()
}

// Re-export so callers don't need to know the fatal module exists for type usage.
export { isFatalError }
