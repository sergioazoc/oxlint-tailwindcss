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

interface ContextLike {
  options?: readonly unknown[]
  settings?: Readonly<Record<string, unknown>>
  filename?: string
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
 * Lazily memoize a compiled options object across visitor calls.
 *
 * Every rule with options reinvents:
 *
 *     let _x: CompiledOptions | null = null
 *     function getX() {
 *       if (_x === null) _x = compile(safeOptions<RawOptions>(context))
 *       return _x
 *     }
 *
 * This wraps the pattern: pass the context and a `compile` function (which
 * receives the raw options object — possibly undefined) and get a memoized
 * thunk back. Inside `createOnce`, options aren't available yet, so the first
 * visitor call triggers compilation; every subsequent call is O(1).
 */
export function createLazyOptions<Raw, Compiled>(
  context: ContextLike,
  compile: (raw: Raw | undefined) => Compiled,
): () => Compiled {
  let cached: { value: Compiled } | null = null
  return () => {
    if (cached) return cached.value
    cached = { value: compile(safeOptions<Raw>(context)) }
    return cached.value
  }
}
