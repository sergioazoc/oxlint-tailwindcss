import { DesignSystemCache } from './cache'
import { loadDesignSystemSync } from './sync-loader'
import { debugLog, isDebugEnabled, setDebugEnabled, resetDebug } from './debug'
import { existsSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import {
  DeprecatedEntryPointShapeError,
  DesignSystemLoadError,
  isFatalError,
  MissingEntryPointError,
} from '../utils/fatal'
import type { EntryPointMapping } from '../types'
import { safeCwd, safeFilename, safeOptions, safeSettings } from '../utils/context'

export type { EntryPointMapping }

export interface LoadResult {
  cache: DesignSystemCache
  entryPoint: string
}

type EntryPointSetting = string | EntryPointMapping[]

const dsCache = new Map<string, { cache: DesignSystemCache; mtime: number }>()

/**
 * Memoizes DS-load FAILURES per entry point, keyed by `(resolvedPath, mtime)`.
 *
 * Without this, a single environmental failure (e.g. `spawnSync … ENOMEM` on a
 * constrained CI runner) was re-attempted on every AST node × every rule ×
 * every file — the storm that turned one failure into ~18k re-spawns and 21k
 * per-class errors (issue #24 / birdman report). Caching the failure collapses
 * it to one attempt per entry point per process. Keyed by mtime so fixing the
 * CSS (mtime changes) invalidates the entry and a fresh load is attempted.
 */
const dsFailureCache = new Map<string, { error: Error; mtime: number }>()

function isEntryPointMapping(v: unknown): v is EntryPointMapping {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  const filesOk =
    typeof m.files === 'string' ||
    (Array.isArray(m.files) && m.files.every((s) => typeof s === 'string'))
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
          'See https://oxlint-tailwindcss.pages.dev/migration/v0-to-v1',
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
 *
 * Memoized across calls because `resolveByGlobMapping` runs per lint visit;
 * recompiling the same pattern per AST node would be wasted work.
 */
const globRegexCache = new Map<string, RegExp>()
function globToRegExp(glob: string): RegExp {
  const cached = globRegexCache.get(glob)
  if (cached) return cached
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
  const compiled = new RegExp('^' + re + '$')
  globRegexCache.set(glob, compiled)
  return compiled
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
 * oxlint discovers nested configuration by walking up from each linted file
 * looking for files with these names. We mirror that walk to find the config
 * directory a relative `entryPoint` should be anchored to.
 */
const OXLINT_CONFIG_NAMES = ['.oxlintrc.json'] as const

/** Memoizes the nearest-config walk per starting directory (cleared in tests). */
const nearestConfigDirCache = new Map<string, string | null>()

/**
 * Find the directory of the **nearest** enclosing oxlint config, walking up
 * from `filePath` toward the filesystem root. Returns `undefined` if none is
 * found. This is the config oxlint applies to the file under its default
 * nested-config discovery, so a relative `entryPoint` declared in it is meant
 * to resolve relative to that directory — not the process CWD, which differs
 * between the CLI (`cd package && oxlint`) and an editor (CWD = workspace
 * root). See issue #39.
 *
 * Stops at the first match (early exit), so in the common case it touches only
 * the file's package, not the whole path to root.
 */
function nearestConfigDir(filePath: string): string | undefined {
  const start = dirname(resolve(filePath))
  const cached = nearestConfigDirCache.get(start)
  if (cached !== undefined) return cached ?? undefined

  let dir = start
  // Walk to the filesystem root; `dirname('/') === '/'` is the fixpoint.
  for (;;) {
    if (OXLINT_CONFIG_NAMES.some((name) => existsSync(resolve(dir, name)))) {
      nearestConfigDirCache.set(start, dir)
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  nearestConfigDirCache.set(start, null)
  return undefined
}

/**
 * Resolve a string `entryPoint` (from `settings` or a rule option) to an
 * absolute path.
 *
 * Absolute paths are returned normalized and untouched. A **relative** path is
 * anchored to the directory of the nearest enclosing `.oxlintrc.json` (the
 * config oxlint applies to the file), with the CWD as a single fallback:
 *
 *   1. nearest config dir — if its candidate file exists, use it;
 *   2. CWD — if its candidate file exists, use it;
 *   3. otherwise resolve against the nearest config dir (else CWD) so the
 *      downstream "could not stat" diagnostic names the package-local path the
 *      user most likely intended — i.e. fail loud rather than silently reach
 *      past the nearest config into an unrelated ancestor.
 *
 * Deliberately a two-step [config dir → CWD] resolution, NOT a walk through
 * every ancestor config: the v1 charter is deterministic + fail-loud, and a
 * multi-ancestor existence probe would let a coincidentally same-named CSS in
 * an unrelated parent silently shadow a genuine misconfiguration.
 *
 * This makes resolution independent of where oxlint is launched from: the
 * editor (CWD = workspace root) and the CLI (CWD = package dir) now agree on
 * the same CSS file in a Pattern-B monorepo (issue #39).
 */
export function resolveStringEntryPoint(
  entry: string,
  filePath: string | undefined,
  cwd: string,
): string {
  if (isAbsolute(entry)) return resolve(entry)

  const configDir = filePath ? nearestConfigDir(filePath) : undefined
  const bases = configDir && configDir !== cwd ? [configDir, cwd] : [cwd]

  for (const base of bases) {
    const candidate = resolve(base, entry)
    if (existsSync(candidate)) return candidate
  }
  // Nothing exists — resolve against the most-specific base for the error.
  return resolve(bases[0], entry)
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
      'Check that the file exists and is readable. A relative `entryPoint` is resolved against the nearest `.oxlintrc.json` directory, falling back to the oxlint working directory.',
      { cause: cause instanceof Error ? cause : undefined },
    )
  }

  const cached = dsCache.get(resolvedPath)
  if (cached && cached.mtime === mtime) return { cache: cached.cache, entryPoint: resolvedPath }

  // A prior load for this exact (path, mtime) already failed — rethrow the
  // cached error instead of paying the load cost again (issue #24 storm).
  const failed = dsFailureCache.get(resolvedPath)
  if (failed && failed.mtime === mtime) throw failed.error

  let data
  try {
    data = loadDesignSystemSync(resolvedPath, timeoutFromSettings(settings))
  } catch (err) {
    // Memoize only plugin-fatal load errors; let genuine bugs propagate without
    // poisoning the cache (mirrors `safeGetDS`'s fatal-vs-rethrow split).
    if (isFatalError(err)) dsFailureCache.set(resolvedPath, { error: err, mtime })
    throw err
  }
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
 * A relative string entry (1 or 2) is anchored to the nearest enclosing
 * `.oxlintrc.json` directory rather than the CWD, so editor and CLI runs agree
 * in Pattern-B monorepos (issue #39); see `resolveStringEntryPoint`.
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
  cwd?: string
}): () => LoadResult {
  let debugInitialized = false
  let lastFilePath: string | undefined
  let lastResult: LoadResult | undefined
  let lastError: Error | undefined

  return () => {
    const filePath = safeFilename(context)

    // Visitors fire on every AST node and the file is stable within a lint
    // pass; once we have a result (or a failure) for this filename we can skip
    // the entire resolve → stat → cache-lookup chain. Caching the failure here
    // is what stops a single fatal error from re-running per node (issue #24);
    // `getLoadedDesignSystem` memoizes it across rules, this does it per rule.
    if (filePath !== undefined && filePath === lastFilePath) {
      if (lastError) throw lastError
      if (lastResult) return lastResult
    }

    const ruleOptionEntry = safeOptions<{ entryPoint?: string }>(context)?.entryPoint
    const settings = safeSettings(context)

    if (!debugInitialized && settings) {
      debugInitialized = true
      setDebugEnabled(isDebugEnabled(settings))
    }

    lastFilePath = filePath
    lastResult = undefined
    lastError = undefined
    try {
      const settingsEntry = entryPointFromSettings(settings)
      const cssPath = resolveEntryPointForFile(
        ruleOptionEntry,
        settingsEntry,
        filePath,
        safeCwd(context),
      )
      lastResult = getLoadedDesignSystem(cssPath, settings)
    } catch (err) {
      if (isFatalError(err) && err instanceof Error) lastError = err
      throw err
    }
    if (filePath) {
      debugLog(
        `${relative(process.cwd(), filePath)} → ${relative(process.cwd(), lastResult.entryPoint)}`,
      )
    }
    return lastResult
  }
}

/**
 * Pure resolution from (rule option, settings entry, file path, cwd) to an
 * absolute CSS entry-point path. Exported for testability.
 *
 * Relative string entries are anchored via `resolveStringEntryPoint` (nearest
 * `.oxlintrc.json` dir, then `cwd`); mapping arrays match relative to `cwd`.
 *
 * Throws `MissingEntryPointError` if nothing resolves. The error message
 * names the file so the user knows which one tripped the configuration.
 */
export function resolveEntryPointForFile(
  ruleOptionEntry: string | undefined,
  settingsEntry: EntryPointSetting | undefined,
  filePath: string | undefined,
  cwd: string = process.cwd(),
): string {
  if (ruleOptionEntry) return resolveStringEntryPoint(ruleOptionEntry, filePath, cwd)
  if (typeof settingsEntry === 'string')
    return resolveStringEntryPoint(settingsEntry, filePath, cwd)
  if (Array.isArray(settingsEntry)) {
    if (!filePath) {
      throw new MissingEntryPointError(
        '`settings.tailwindcss.entryPoint` is a mapping array but no file path is available to match against.',
        'This usually means the rule ran outside the linter context. Open an issue if you see this in a real lint run.',
      )
    }
    const matched = resolveByGlobMapping(settingsEntry, filePath, cwd)
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
  dsFailureCache.clear()
  nearestConfigDirCache.clear()
  resetDebug()
}
