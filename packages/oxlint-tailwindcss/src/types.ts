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

/**
 * One mapping in a monorepo `entryPoint` array. `files` is a glob (or array of
 * globs) matched relative to the oxlint working directory; `use` is the CSS
 * entry point to load for files matching that glob. Array order is the
 * evaluation order — first match wins.
 */
export interface EntryPointMapping {
  files: string | string[]
  use: string
}

export interface PluginSettings {
  /**
   * CSS entry point. Required in v1.0.0+ for any DS-dependent rule to run.
   *
   * - `string` — single CSS path for the whole project.
   * - `EntryPointMapping[]` — monorepo mapping, evaluated in order; the
   *   first glob matching the linted file decides which CSS to load.
   *
   * The legacy `string[]` shape was removed in v1; it now triggers a fatal
   * `DeprecatedEntryPointShapeError` with migration instructions.
   */
  entryPoint?: string | EntryPointMapping[]
  /** Enable debug logging to stderr (also activable via DEBUG=oxlint-tailwindcss env var) */
  debug?: boolean
  /** Root font size in pixels for px→named conversion (default: 16). Used by enforce-canonical. */
  rootFontSize?: number
  /** Timeout in milliseconds for design system loading (default: 60000) */
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
