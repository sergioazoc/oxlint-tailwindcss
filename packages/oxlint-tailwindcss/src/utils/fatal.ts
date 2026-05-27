/**
 * Fatal error types and reporter for the deterministic v1 design.
 *
 * The plugin used to silently skip when the design system could not be
 * loaded or the worker thread misbehaved. v1 fails loud: every DS-dependent
 * rule catches these errors and surfaces them as a single fatal lint
 * diagnostic so the user sees exactly what to fix.
 */

/**
 * The single `messageId` every DS-dependent rule uses to surface a fatal
 * design-system load failure. Exported as a constant so the rule's
 * `meta.messages` and `context.report()` calls in `reportFatalDsError`
 * cannot drift apart silently.
 */
export const DS_UNAVAILABLE_MESSAGE_ID = 'designSystemUnavailable' as const

/** Pre-shaped entry for `meta.messages`. Spread it: `messages: { ..., ...DS_UNAVAILABLE_MESSAGE }`. */
export const DS_UNAVAILABLE_MESSAGE = {
  [DS_UNAVAILABLE_MESSAGE_ID]: '{{message}}',
} as const

export class OxlintTailwindError extends Error {
  /** A short, actionable hint shown alongside the error message. */
  public readonly hint?: string

  constructor(message: string, hint?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = this.constructor.name
    this.hint = hint
  }
}

/** No `settings.tailwindcss.entryPoint` was provided and a DS-dependent rule needs one. */
export class MissingEntryPointError extends OxlintTailwindError {}

/** `settings.tailwindcss.entryPoint` is an array of strings — removed in v1. */
export class DeprecatedEntryPointShapeError extends OxlintTailwindError {}

/** `__unstable__loadDesignSystem` failed (bad CSS path, malformed CSS, install issue). */
export class DesignSystemLoadError extends OxlintTailwindError {}

/** The sort or canonicalize worker thread failed to initialize or timed out. */
export class SortServiceError extends OxlintTailwindError {}

export type FatalError =
  | MissingEntryPointError
  | DeprecatedEntryPointShapeError
  | DesignSystemLoadError
  | SortServiceError

/** Type-guard: did this error originate from the plugin's fail-loud infrastructure? */
export function isFatalError(err: unknown): err is FatalError {
  return err instanceof OxlintTailwindError
}

/**
 * Format a fatal error into the diagnostic message a rule should report.
 *
 * Pulls in the optional `hint` (a one-line "here's how to fix it" follow-up)
 * so the message is self-contained even when the user is reading it in an
 * editor without the docs site open.
 */
export function formatFatalError(err: FatalError): string {
  return err.hint ? `${err.message}\n\nHint: ${err.hint}` : err.message
}

/**
 * Structural reporter shape. Permissive on the diagnostic parameter so the
 * helper accepts oxlint's strict `RuleContext.report` (which takes a typed
 * `DiagnosticBase`) without pinning to a specific oxlint version.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reporter = { report: (diagnostic: any) => void }

/**
 * Helper for DS-dependent rules to convert a caught fatal error into a
 * single diagnostic. Returns `true` if the error was reported (and the
 * visitor should bail out), `false` otherwise — the rule layer rethrows
 * non-fatal errors to surface real bugs.
 */
export function reportFatalDsError<C extends Reporter>(
  context: C,
  err: unknown,
  node?: unknown,
): boolean {
  if (!isFatalError(err)) return false
  context.report({
    node,
    messageId: DS_UNAVAILABLE_MESSAGE_ID,
    data: { message: formatFatalError(err) },
  })
  return true
}

/**
 * Call `getDS()` and route fatal errors through `reportFatalDsError`.
 *
 * Returns the load result on success, or `null` after a fatal error has been
 * reported (rules should `if (!ds) return` and exit the visitor). Non-fatal
 * errors are re-thrown so genuine bugs aren't hidden.
 */
export function safeGetDS<T, C extends Reporter>(
  getDS: () => T,
  context: C,
  node?: unknown,
): T | null {
  try {
    return getDS()
  } catch (err) {
    if (reportFatalDsError(context, err, node)) return null
    throw err
  }
}
