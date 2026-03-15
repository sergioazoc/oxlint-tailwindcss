export interface PluginSettings {
  entryPoint?: string
  debug?: boolean
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
