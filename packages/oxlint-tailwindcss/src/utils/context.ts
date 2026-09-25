/**
 * Safe accessors for `context.options`, `context.settings`, `context.filename`,
 * plus a `createLazyOptions` helper for the pattern every rule with options
 * reinvents.
 *
 * In oxlint, the context fields may not be available inside `createOnce()`
 * (they're populated when visitors run). The plain getter throws in older
 * versions and returns `null` in newer ones — the safe wrappers absorb both.
 *
 * Lives in `utils/` and not `types.ts` because these are runtime functions,
 * not types — keeping `types.ts` import-type-only enables aggressive
 * tree-shaking and makes the module boundary honest.
 */

/** The slice of oxlint's `context.sourceCode` we consume (line-indexed text). */
export interface SourceCodeLike {
  lines?: readonly string[]
  text?: string
}

interface ContextLike {
  options?: readonly unknown[]
  settings?: Readonly<Record<string, unknown>>
  filename?: string
  cwd?: string
  sourceCode?: SourceCodeLike
}

/**
 * Safely read `context.options[0]`. Returns `undefined` if the getter throws
 * (oxlint < 1.31.0) or if options aren't populated yet.
 */
export function safeOptions<T = Record<string, unknown>>(context: ContextLike): T | undefined {
  try {
    return (context.options?.[0] ?? undefined) as T | undefined
  } catch {
    return undefined
  }
}

/**
 * Safely read `context.settings`. Same try/catch pattern as `safeOptions`
 * for the createOnce-throws case.
 */
export function safeSettings(context: ContextLike): Readonly<Record<string, unknown>> | undefined {
  try {
    return context.settings ?? undefined
  } catch {
    return undefined
  }
}

/** Safely read `context.filename`. Same try/catch pattern. */
export function safeFilename(context: ContextLike): string | undefined {
  try {
    return context.filename ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Safely read `context.sourceCode`. Same try/catch pattern as the other
 * accessors (the getter may throw inside `createOnce`). Used by
 * `enforce-consistent-line-wrapping` to derive a statement's real base
 * indentation (the line's leading whitespace) when wrapping a single-line
 * template into the block convention — the backtick column
 * (`node.loc.start.column`) is NOT the base indent. Returns `undefined` if
 * unavailable; callers fall back to a zero base indent.
 */
export function safeSourceCode(context: ContextLike): SourceCodeLike | undefined {
  try {
    return context.sourceCode ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Safely read `context.cwd`, falling back to `process.cwd()`. Same try/catch
 * pattern as the other accessors (the getter throws in `createOnce` on older
 * oxlint). The fallback keeps relative-path resolution working even when the
 * linter never populates `cwd`.
 */
export function safeCwd(context: ContextLike): string {
  try {
    return context.cwd ?? process.cwd()
  } catch {
    return process.cwd()
  }
}

/**
 * Lazily memoize a compiled options object — per CONFIG, not per run.
 *
 * Every rule with options reinvents "compile `context.options[0]` once": pass
 * the context and a `compile` function (which receives the raw options object —
 * possibly undefined) and get a memoized thunk back.
 *
 * `createOnce` runs once per worker and its context then serves every file the
 * worker lints, and those files don't all share options: an `overrides` block
 * or a nested `.oxlintrc.json` gives some of them their own. oxlint hands every
 * file of one effective config the SAME options array, so the memo is keyed by
 * that array's identity: one compile per distinct config, and the steady state
 * is a single reference comparison. Options read while unavailable (inside
 * `createOnce`) are compiled but not remembered.
 */
export function createLazyOptions<Raw, Compiled>(
  context: ContextLike,
  compile: (raw: Raw | undefined) => Compiled,
): () => Compiled {
  const byOptions = new WeakMap<object, Compiled>()
  // "No options configured" arrives as `undefined` or as an empty array (a new
  // one per file, possibly): one config of its own, compiled once.
  let none: { value: Compiled } | null = null
  let lastKey: unknown = UNSET
  let last: Compiled | undefined

  return () => {
    let key: readonly unknown[] | undefined
    try {
      key = context.options ?? undefined
    } catch {
      return compile(undefined)
    }
    if (key === lastKey) return last as Compiled

    let value: Compiled
    if (key === undefined || key.length === 0 || key[0] === undefined) {
      none ??= { value: compile(undefined) }
      value = none.value
    } else if (byOptions.has(key)) {
      value = byOptions.get(key) as Compiled
    } else {
      value = compile(key[0] as Raw)
      byOptions.set(key, value)
    }
    lastKey = key
    last = value
    return value
  }
}

const UNSET = Symbol('unset')

/** Distinct settings contents remembered per thunk before the oldest is dropped. */
const SETTINGS_MEMO_SIZE = 32

/**
 * Lazily memoize a value derived from `context.settings` — per FILE.
 *
 * Settings vary between the files one context serves (a nested
 * `.oxlintrc.json` has its own), and oxlint builds a fresh settings object for
 * every file, even under one config. So: the same object as last call (the same
 * file) returns at once; otherwise the `tailwindcss` block's JSON is the key
 * into a small memo, so equal settings compile once however many files carry
 * them. Settings read while unavailable (inside `createOnce`) are compiled but
 * not remembered.
 */
export function createLazySettings<Compiled>(
  context: ContextLike,
  compile: (settings: Readonly<Record<string, unknown>> | undefined) => Compiled,
): () => Compiled {
  const byContent = new Map<string, Compiled>()
  let lastSettings: unknown = UNSET
  let last: Compiled | undefined

  return () => {
    let settings: Readonly<Record<string, unknown>> | undefined
    try {
      settings = context.settings ?? undefined
    } catch {
      return compile(undefined)
    }
    if (settings === lastSettings) return last as Compiled

    const key = settingsKey(settings)
    let value: Compiled
    if (byContent.has(key)) {
      value = byContent.get(key) as Compiled
    } else {
      value = compile(settings)
      if (byContent.size >= SETTINGS_MEMO_SIZE) {
        byContent.delete(byContent.keys().next().value as string)
      }
      byContent.set(key, value)
    }
    lastSettings = settings
    last = value
    return value
  }
}

/**
 * The memo key for a settings object: its `tailwindcss` block, the only part
 * this plugin reads. Settings come from JSON config files, so JSON is exact.
 */
export function settingsKey(settings: Readonly<Record<string, unknown>> | undefined): string {
  return JSON.stringify(settings?.tailwindcss) ?? ''
}
