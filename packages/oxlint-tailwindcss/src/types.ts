export interface ExtractorExclusions {
  /** Default attribute names to exclude */
  attributes?: string[]
  /** Default callee names to exclude */
  callees?: string[]
  /** Default tag names to exclude */
  tags?: string[]
  /** Default variable pattern regex sources to exclude (matched against RegExp.source) */
  variablePatterns?: string[]
}

export interface PluginSettings {
  /** CSS entry point. String for single project, array for monorepos (closest to file wins). */
  entryPoint?: string | string[]
  /** Enable debug logging to stderr (also activable via DEBUG=oxlint-tailwindcss env var) */
  debug?: boolean
  /** Root font size in pixels for px→named conversion (default: 16). Used by enforce-canonical. */
  rootFontSize?: number
  /** Timeout in milliseconds for design system loading (default: 30000) */
  timeout?: number
  /** Additional JSX attribute names to scan for Tailwind classes (added to defaults) */
  attributes?: string[]
  /** Additional function names to scan for Tailwind classes (added to defaults) */
  callees?: string[]
  /** Additional tagged template tag names to scan (added to defaults) */
  tags?: string[]
  /** Additional regex patterns (as strings) for variable names to scan (added to defaults) */
  variablePatterns?: string[]
  /** Remove specific items from the built-in defaults */
  exclude?: ExtractorExclusions
}

export interface RuleOptions {
  entryPoint?: string
}

/**
 * Safely read context.options.
 *
 * In oxlint, `context.options` is `null` inside `createOnce()` — options are
 * only populated when visitors run. Call this lazily (inside `check()` or a
 * visitor) to get the user's configured options.
 *
 * In oxlint <1.31.0 the getter may throw — the try/catch handles that.
 */
export function safeOptions<T = Record<string, unknown>>(context: {
  options?: readonly unknown[]
}): T | undefined {
  try {
    return (context.options?.[0] ?? undefined) as T | undefined
  } catch {
    return undefined
  }
}

/**
 * Safely read context.settings.
 *
 * Like `safeOptions`, `context.settings` may not be accessible in `createOnce()`.
 * The try/catch handles that gracefully.
 */
export function safeSettings(context: {
  settings?: Readonly<Record<string, unknown>>
}): Readonly<Record<string, unknown>> | undefined {
  try {
    return context.settings ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Safely read context.filename.
 *
 * Like `safeSettings`, `context.filename` may not be accessible in `createOnce()`.
 */
export function safeFilename(context: { filename?: string }): string | undefined {
  try {
    return context.filename ?? undefined
  } catch {
    return undefined
  }
}
