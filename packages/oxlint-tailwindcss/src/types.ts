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

/**
 * The structured extractor a custom callee should be routed through
 * (`settings.tailwindcss.calleeExtractors`). `tv`/`cva`/`classed` reuse the
 * dedicated extractors that understand each helper's config shape; `flat` is
 * the generic cn/clsx/twMerge-style extraction (every string argument plus
 * object keys) — the same behaviour every plain `callees` entry already gets.
 */
export type CalleeExtractorKind = 'tv' | 'cva' | 'classed' | 'flat'

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
  /**
   * Run even when the resolved Tailwind engine is a major version newer than
   * the one this plugin was built for (e.g. a future Tailwind 5), or drifts a
   * major from the version your build uses. Off by default: those cases are
   * fatal (`designSystemUnavailable`) because the plugin's results may not
   * match your compiled CSS. Setting this to `true` downgrades them to a
   * one-time stderr warning and lints best-effort. An engine older than v4 is
   * never allowed — it stays fatal regardless of this flag.
   */
  allowUntestedEngine?: boolean
  /** Root font size in pixels for px→named conversion (default: 16). Used by enforce-canonical. */
  rootFontSize?: number
  /** Timeout in milliseconds for design system loading (default: 60000) */
  timeout?: number
  /** Additional JSX attribute names to scan for Tailwind classes (added to defaults) */
  attributes?: string[]
  /**
   * Regex patterns (as strings) matched against JSX attribute NAMES, additive to
   * the exact `attributes` list. Lets `*ClassName` conventions (React Native /
   * Uniwind, component libraries) be scanned without listing every prop, e.g.
   * `["ClassName$"]`. Note: `variablePatterns` matches variable declaration
   * names only, NOT JSX attributes — use this for attributes.
   */
  attributePatterns?: string[]
  /** Additional function names to scan for Tailwind classes (added to defaults) */
  callees?: string[]
  /**
   * Route a custom callee through a known structured extractor by mapping its
   * local name to `'tv' | 'cva' | 'classed' | 'flat'`. Lets a wrapper
   * re-exported under another name (e.g. `defineStyles = createTV(config)`) be
   * linted with the same deep extraction as `tv()` — without renaming imports
   * at every call site (#155). Keys are auto-registered as callees (no need to
   * also list them in `callees`); an unknown value is skipped rather than
   * throwing, and the reserved names `tv`/`cva`/`classed` cannot be remapped
   * (the built-in extractor wins). `'flat'` is the default cn/clsx-style
   * extraction, offered so every custom callee can live in one map.
   */
  calleeExtractors?: Record<string, CalleeExtractorKind>
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
