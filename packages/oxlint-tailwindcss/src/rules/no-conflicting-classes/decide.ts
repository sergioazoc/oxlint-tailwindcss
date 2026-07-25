/**
 * Conflict decision for `no-conflicting-classes`, derived from the generated CSS.
 *
 * Two classes clash on a property only when the declaration that LOSES the
 * cascade carries something the winner does not reproduce. Everything needed to
 * decide that comes from the design system: the declaration values, which custom
 * properties each value reads, and the physical order of the classes in the
 * generated stylesheet (`cache.getOrder`). Nothing here knows the name of a
 * Tailwind utility, let alone of a third-party plugin.
 *
 * Verified premise: the CSS Tailwind emits does not depend on the order of the
 * classes in the attribute, only on that stylesheet order — which is why the
 * diagnostics can name the winner instead of hedging.
 */

import { type CssDeclaration } from '../../design-system/css-declarations'
import { splitImportant } from '../../utils/class-parser'

/**
 * A declaration, keyed by the box it applies to and the property it sets.
 *
 * `<box>|<property>` for a non-element box, the bare property otherwise. `|`
 * cannot occur in a property or pseudo-element name, so the split is unambiguous.
 * It is also deliberately a PRINTABLE separator: an earlier version used NUL,
 * which made git classify this file as binary and hid it from every diff.
 */
export type DeclKey = string

/** Builds the comparison key. Same property on two different boxes never clashes. */
export function declKey(decl: CssDeclaration): DeclKey {
  return decl.scope === 'element' ? decl.prop : `${decl.pseudo || '>'}|${decl.prop}`
}

/** The property name a key refers to, for the diagnostic message. */
export function keyProp(key: DeclKey): string {
  const sep = key.lastIndexOf('|')
  return sep < 0 ? key : key.slice(sep + 1)
}

/** How to describe a key's box in the message; empty for the element itself. */
export function keyScopeLabel(key: DeclKey): string {
  const sep = key.indexOf('|')
  if (sep < 0) return ''
  const scope = key.slice(0, sep)
  return scope === '>' ? 'direct children' : scope
}

/** Everything about one class the decision needs. */
export interface ClassFacts {
  className: string
  /**
   * One declaration per (box, property). The LAST one the class emits wins,
   * which is CSS semantics within a rule — that is what makes `fade-in-0`
   * (`--tw-enter-opacity` declared twice) comparable to `fade-in`.
   */
  decls: Map<DeclKey, CssDeclaration>
  /** Custom properties this class writes, mapped to the value id it writes. */
  writes: Map<string, number>
  /** Physical position in the generated stylesheet; null when unknown. */
  order: bigint | null
  /** Whether the class carries the `!` important modifier. */
  important: boolean
  /** True when the class emits CSS we deliberately did not model in full. */
  partial: boolean
  /**
   * Keys the class declares more than once with different values, i.e. under a
   * selector condition this model does not capture. They are excluded from
   * comparison rather than guessed at.
   */
  ambiguousKeys: Set<DeclKey>
}

export interface GroupFacts {
  /** Every custom property written by any class in the group. */
  groupWrites: Set<string>
  /**
   * Per custom property, the class whose write survives the cascade (the one
   * that comes last). Following the chain through the *effective* writer is what
   * makes the reachability walk sound: it only follows declarations that live.
   */
  effectiveWriter: Map<string, ClassFacts>
}

const NO_INFO_VALUES = new Set(['', 'initial', 'unset'])
const CLOSURE_LIMIT = 64

export function collectFacts(classes: readonly ClassFacts[]): GroupFacts {
  const groupWrites = new Set<string>()
  const effectiveWriter = new Map<string, ClassFacts>()
  for (const cls of classes) {
    for (const varName of cls.writes.keys()) {
      groupWrites.add(varName)
      const current = effectiveWriter.get(varName)
      if (
        current === undefined ||
        (cls.order !== null && (current.order === null || cls.order > current.order))
      ) {
        effectiveWriter.set(varName, cls)
      }
    }
  }
  return { groupWrites, effectiveWriter }
}

/** Splits `!` off and reports whether the class was important. */
export function isImportant(className: string): boolean {
  return splitImportant(className).position !== null
}

/**
 * Which custom properties a value actually depends on.
 *
 * A `var()` fallback is dead once the variable is supplied, so fallback reads
 * only count when a direct read is missing from the group. Without this,
 * `text-sm` would appear to need `--text-sm--line-height` — a token no utility
 * writes — and its composition with `leading-6` would read as a conflict.
 */
export function neededVars(decl: CssDeclaration, groupWrites: ReadonlySet<string>): string[] {
  const needed = [...decl.readsVars]
  const everyDirectReadSupplied = needed.every((v) => groupWrites.has(v))
  if (!everyDirectReadSupplied) {
    for (const v of decl.readsFallbackVars) {
      if (!needed.includes(v)) needed.push(v)
    }
  }
  return needed
}

/**
 * Does the winner's declaration still pull in the loser's contribution?
 *
 * Walks the winner's variable reads, expanding each through the group's
 * effective writer, and hits when that chain reaches the loser. This is what
 * covers `drop-shadow-xl drop-shadow-indigo-500` directly and the gradient
 * family (`from-*` → `--tw-gradient-via-stops` → `via-*`) transitively.
 */
export function winnerAbsorbsLoser(
  winnerDecl: CssDeclaration,
  loser: ClassFacts,
  group: GroupFacts,
): boolean {
  const seen = new Set<string>()
  const frontier = [...winnerDecl.readsVars, ...winnerDecl.readsFallbackVars]
  let steps = 0
  while (frontier.length > 0 && steps++ < CLOSURE_LIMIT) {
    const varName = frontier.pop()!
    if (seen.has(varName)) continue
    seen.add(varName)
    const writer = group.effectiveWriter.get(varName)
    // The hit condition is that the LOSER is the surviving writer, not merely
    // that it writes the variable at all: when the winner writes it too, the
    // winner's own write is what the chain resolves to and the loser contributes
    // nothing through it. `space-x-4 space-x-2` is the case that proves it —
    // both write `--tw-space-x-reverse`, and the margins genuinely clash.
    if (writer === loser) return true
    if (!writer) continue
    const written = writer.decls.get(varName)
    if (written) frontier.push(...written.readsVars, ...written.readsFallbackVars)
  }
  return false
}

/**
 * Was the loser's declaration only forwarding a value someone else supplies?
 *
 * `outline-2` declares `outline-style: var(--tw-outline-style)` — it carries no
 * value of its own, and `outline-solid` both writes that variable and declares
 * the property concretely. Losing the forwarding declaration changes nothing.
 *
 * The three guards matter:
 * - variables the loser writes ITSELF are excluded, so `transform-none
 *   rotate-x-45` (whose `transform` forwards four variables nobody supplies)
 *   stays a conflict;
 * - the winner must supply one of them, otherwise an unrelated class that simply
 *   outranks a reader/writer pair would silence a real clobber;
 * - a loser that forwards nothing (empty set) is carrying its own contribution.
 */
export function loserOnlyForwards(
  loserDecl: CssDeclaration,
  loser: ClassFacts,
  winner: ClassFacts,
  group: GroupFacts,
): boolean {
  if (!loserDecl.pureVarRead) return false
  const needed = neededVars(loserDecl, group.groupWrites).filter((v) => !loser.writes.has(v))
  if (needed.length === 0) return false
  if (!needed.every((v) => group.groupWrites.has(v))) return false
  return needed.some((v) => winner.writes.has(v))
}

export interface PairVerdict {
  winner: ClassFacts
  loser: ClassFacts
  /** Keys where the loser's declaration is genuinely discarded. */
  conflicts: DeclKey[]
  /** Keys where both classes declare exactly the same thing. */
  duplicates: DeclKey[]
  /** False when the stylesheet order of either class is unknown. */
  orderKnown: boolean
}

/** Resolves which of the two classes wins the cascade. `!` beats stylesheet order. */
export function resolveWinner(
  a: ClassFacts,
  b: ClassFacts,
): { winner: ClassFacts; loser: ClassFacts; orderKnown: boolean } {
  if (a.important !== b.important) {
    return a.important
      ? { winner: a, loser: b, orderKnown: true }
      : { winner: b, loser: a, orderKnown: true }
  }
  if (a.order === null || b.order === null || a.order === b.order) {
    return { winner: b, loser: a, orderKnown: false }
  }
  return a.order > b.order
    ? { winner: a, loser: b, orderKnown: true }
    : { winner: b, loser: a, orderKnown: true }
}

/** A custom property cleared to a value that says nothing. */
function isReset(decl: CssDeclaration): boolean {
  return decl.prop.startsWith('--') && NO_INFO_VALUES.has(decl.value.trim())
}

/**
 * Is clearing variables the whole point of this class?
 *
 * `blur-none` writes `--tw-blur: ` and then only forwards the filter chain;
 * `animate-in` clears `--tw-enter-*` but also declares real values of its own.
 * The first cannot afford to lose its reset, the second can.
 */
function resetIsAllTheClassDoes(cls: ClassFacts): boolean {
  let sawSubstance = false
  for (const decl of cls.decls.values()) {
    if (isReset(decl)) continue
    if (decl.pureVarRead) continue
    sawSubstance = true
    break
  }
  return !sawSubstance
}

/** Does the surviving declaration reproduce what the other one contributed? */
function composes(
  winnerDecl: CssDeclaration,
  winner: ClassFacts,
  loserDecl: CssDeclaration,
  loser: ClassFacts,
  group: GroupFacts,
): boolean {
  return (
    winnerAbsorbsLoser(winnerDecl, loser, group) ||
    loserOnlyForwards(loserDecl, loser, winner, group)
  )
}

export function decidePair(a: ClassFacts, b: ClassFacts, group: GroupFacts): PairVerdict {
  const { winner, loser, orderKnown } = resolveWinner(a, b)
  const conflicts: DeclKey[] = []
  const duplicates: DeclKey[] = []

  for (const [key, loserDecl] of loser.decls) {
    const winnerDecl = winner.decls.get(key)
    if (!winnerDecl) continue

    // A class that declares the same (box, property) twice with DIFFERENT values
    // is doing so under a selector condition we do not model — tw-animate-css's
    // `slide-in-from-start` emits `&:dir(ltr)` and `&:dir(rtl)` blocks, both
    // classified as the element's own box. Keeping only the last would have us
    // compare half the class and, worse, call the other class redundant.
    if (loser.ambiguousKeys.has(key) || winner.ambiguousKeys.has(key)) continue

    // Same declaration on both sides: whoever wins, the result is the same.
    if (loserDecl.valueId === winnerDecl.valueId) {
      duplicates.push(key)
      continue
    }

    // A custom property reset to `initial`/`unset`/empty is free to lose ONLY
    // when the class resets to make room for a modifier: `animate-in` declares
    // `animation-name: enter` and clears five `--tw-enter-*` vars precisely so
    // `fade-in-0` can set one. For `blur-none`, `via-none` or `drop-shadow-none`
    // the reset IS the utility — everything else they declare is a pure `var()`
    // conduit — so dropping it drops the only thing the user asked for, and
    // `blur-lg blur-none` would go silent (it reported before this rewrite).
    // Restricted to custom properties on purpose: on a real property `initial`
    // IS a value (`animation-play-state: initial`).
    if (isReset(loserDecl) && !resetIsAllTheClassDoes(loser)) {
      continue
    }

    // Whether the two compose does not depend on knowing who wins — only on
    // whether the losing declaration carries something of its own. So when the
    // order is unknown (a user-written value borrows a prefix sibling's), both
    // directions are tried, and only a pair that composes in NEITHER direction
    // is reported — without naming a winner we cannot identify.
    if (composes(winnerDecl, winner, loserDecl, loser, group)) continue
    if (!orderKnown && composes(loserDecl, loser, winnerDecl, winner, group)) continue

    conflicts.push(key)
  }

  return { winner, loser, conflicts, duplicates, orderKnown }
}

/**
 * Which class (if any) is dead weight: every declaration it makes is also made,
 * identically, by the other one. A `partial` class is never named — its CSS is
 * only partly modelled, so "it adds nothing" would be a guess.
 */
export function redundantSide(
  verdict: PairVerdict,
): { loser: ClassFacts; winner: ClassFacts } | null {
  if (verdict.conflicts.length > 0 || verdict.duplicates.length === 0) return null
  const dup = new Set(verdict.duplicates)
  const covered = (c: ClassFacts) =>
    c.decls.size > 0 && [...c.decls.keys()].every((k) => dup.has(k))
  if (!verdict.loser.partial && covered(verdict.loser)) {
    return { loser: verdict.loser, winner: verdict.winner }
  }
  if (!verdict.winner.partial && covered(verdict.winner)) {
    return { loser: verdict.winner, winner: verdict.loser }
  }
  return null
}
