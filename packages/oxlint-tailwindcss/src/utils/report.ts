/**
 * Shared reporter for the "first-as-fix, rest-as-suggestion" pattern.
 *
 * Nine rules (enforce-canonical, enforce-logical, enforce-physical,
 * enforce-consistent-variable-syntax, enforce-consistent-important-position,
 * enforce-negative-arbitrary-values, no-deprecated-classes,
 * no-unnecessary-arbitrary-value, prefer-theme-tokens) all emit
 * replacements via the same shape:
 *
 *   1. Collect `{ cls, replacement }` entries from a class string.
 *   2. Rebuild the full class string with replacements applied.
 *   3. Emit ONE diagnostic with the autofix attached.
 *   4. Emit one MORE diagnostic per remaining offender, each carrying
 *      the same autofix as a `suggest`.
 *
 * oxlint's fixer is single-shot per AST node, so multiple offenders in the
 * same class string can only get one mechanical fix; the rest stay as
 * suggestions the IDE can offer interactively.
 */

import { rebuildClassString, type ClassSplit } from './class-splitter'
import { preserveSpaces, type ClassLocation } from './extractors'

export interface ReplacementEntry {
  cls: string
  replacement: string
}

interface Fixer {
  replaceTextRange(range: [number, number], text: string): unknown
}

// Typed as `unknown` so the helper isn't pinned to a specific oxlint version's
// diagnostic shape. Rules pass their own typed context; the property access is
// duck-typed and the diagnostic shape is what oxlint validates.
type Reporter = unknown

export interface ReportOptions {
  /** messageId for every diagnostic emitted (primary fix + suggestion duplicates). */
  messageId: string
  /**
   * Key under which `replacement` appears in the primary diagnostic's data.
   * Defaults to `'replacement'`. enforce-canonical templates "{{canonical}}"
   * and passes `'canonical'`.
   */
  replacementKey?: string
  /** messageId of the suggest entry shown for the non-first offenders. */
  suggestMessageId?: string
}

/**
 * Emit autofix + suggestion diagnostics for a list of class replacements.
 *
 * If `offending` is empty, no-op. The fixer's `replaceTextRange` is shared
 * across all diagnostics — the first one is the primary fix, the rest carry
 * the same fix as a suggestion (oxlint can only apply one autofix per node).
 */
export function reportClassReplacements(
  context: Reporter,
  loc: ClassLocation,
  split: ClassSplit,
  classes: string[],
  offending: readonly ReplacementEntry[],
  options: ReportOptions,
): void {
  if (offending.length === 0) return

  const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
  const fixedValue = rebuildClassString(
    split,
    classes.map((c) => replacements.get(c) ?? c),
  )

  const replacementKey = options.replacementKey ?? 'replacement'
  const suggestMessageId = options.suggestMessageId ?? 'suggestReplace'

  const applyFix = (fixer: Fixer) =>
    fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))

  const report = (context as { report: (d: unknown) => void }).report

  for (let i = 0; i < offending.length; i++) {
    const { cls, replacement } = offending[i]
    const primaryData: Record<string, string> = { className: cls, [replacementKey]: replacement }

    if (i === 0) {
      report({
        node: loc.node,
        messageId: options.messageId,
        data: primaryData,
        fix: applyFix,
      })
    } else {
      report({
        node: loc.node,
        messageId: options.messageId,
        data: primaryData,
        suggest: [
          {
            messageId: suggestMessageId,
            data: { className: cls, replacement },
            fix: applyFix,
          },
        ],
      })
    }
  }
}
