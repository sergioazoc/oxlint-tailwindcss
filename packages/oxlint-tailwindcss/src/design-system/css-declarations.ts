/**
 * CSS declarations precomputed per class — the data `no-conflicting-classes`
 * reasons over.
 *
 * The rule used to receive property NAMES only, which made it value-blind and
 * box-blind: two classes declaring the same property with a byte-identical
 * value read as a conflict, a `var()` reader read as a conflict with the class
 * writing the variable, and a `::placeholder` / child-selector declaration read
 * as if it applied to the element itself. Every one of those produced false
 * positives on combinations Tailwind's own documentation shows as correct usage.
 *
 * So the precompute now emits DECLARATIONS: property + value + which custom
 * properties the value reads + which box it applies to. Everything is interned
 * — 55k declarations across a default design system collapse to ~22k distinct
 * (scope, prop, value) triples over ~2.7k distinct values — so the richer data
 * is SMALLER on disk than the old name-only map, and a class's declarations are
 * decoded lazily, only for the classes a linted file actually mentions.
 */

/** Which box a declaration applies to. */
export type CssDeclScope = 'element' | 'pseudo' | 'descendant'

/** One declaration emitted by a class, decoded. */
export interface CssDeclaration {
  /** Property name, including custom properties: `color`, `--tw-scale-x`. */
  prop: string
  /** Value verbatim as Tailwind emits it: `var(--color-gray-900)`. */
  value: string
  /**
   * Interned value id. Equal ids ⇔ byte-identical values, so callers compare
   * ids instead of strings — that comparison is what tells a real conflict
   * apart from two classes declaring exactly the same thing.
   */
  valueId: number
  scope: CssDeclScope
  /** For `scope === 'pseudo'`: `::placeholder`. Empty otherwise. */
  pseudo: string
  /** True when the declaration sits inside `@media` / `@supports`. */
  conditional: boolean
  /** Custom properties the value reads directly (not inside a fallback). */
  readsVars: readonly string[]
  /**
   * Custom properties the value reads ONLY inside another `var()`'s fallback.
   * Kept apart from `readsVars` so callers can start with the strict reading —
   * a fallback is a last resort, not the composition channel — without losing
   * the information. `--tw-gradient-stops` is the case that matters: its
   * fallback does reference variables other utilities write.
   */
  readsFallbackVars: readonly string[]
  /**
   * True when the value is nothing but `var()` reads and separators, i.e. the
   * declaration contributes no value of its own and is a pure conduit
   * (`scale-3d`'s `scale: var(--tw-scale-x) var(--tw-scale-y) var(--tw-scale-z)`).
   * `transform-gpu` is the counter-example: it prepends `translateZ(0)`, so it
   * both writes and reads.
   */
  pureVarRead: boolean
}

/**
 * Serialized form stored in the disk cache.
 *
 * Encoding notes (all measured against a real design system):
 * - `table` interns the whole (scope, prop, value) triple, not just the value:
 *   55 049 declarations → 21 879 distinct entries.
 * - `table` is ordered by DESCENDING frequency, so the hottest declarations get
 *   one-character base36 ids (`display: flex` and the `filter:` var chain
 *   appear thousands of times). Worth ~130 KB.
 * - `byClass` holds a packed string rather than a number array: a JSON array of
 *   55k integers allocates 55k nodes at parse time, a string is copied in one
 *   go and decoded only for the classes actually looked up.
 */
export interface CssDeclarationIndex {
  /**
   * Classes whose CSS we deliberately did not model in full: those that style
   * both themselves and their descendants (only the element part is kept, or
   * `prose prose-sm` would read as ~40 conflicts), and those with declarations
   * inside `@media` / `@supports`. Such a class must never be reported as
   * redundant — `container` looks like a plain `width: 100%` because its
   * breakpoint `max-width`es live in `@media`.
   */
  partial: string[]
  /**
   * Interned scope tokens. Grammar:
   *   `''`            — the element's own box
   *   `'>'`           — a descendant/child (a combinator sits between the class
   *                     and the subject)
   *   `'::<name>'`    — a pseudo-element (`::placeholder`)
   *   leading `'@'`   — the declaration is inside `@media` / `@supports`
   * Index 0 is always `''`.
   */
  scopes: string[]
  /** Interned property names. */
  props: string[]
  /** Interned declaration values, verbatim. */
  values: string[]
  /** Interned custom-property names referenced by some value. */
  vars: string[]
  /** valueId (as string key) → `vars` ids read directly. Sparse. */
  valueVars: Record<string, number[]>
  /** valueId (as string key) → `vars` ids read only inside a fallback. Sparse. */
  valueFallbackVars: Record<string, number[]>
  /** Ascending valueIds whose value is a pure `var()` read. */
  pureValues: number[]
  /** declId → `"<scopeId>|<propId>|<valueId>"`, each field base36. */
  table: string[]
  /**
   * className → comma-separated base36 declIds, in EMISSION ORDER and NOT
   * deduplicated: a class that declares the same property twice (once plainly
   * and once inside `@supports`, as `bg-linear-to-r` does) keeps both.
   */
  byClass: Record<string, string>
}

const EMPTY_DECLS: readonly CssDeclaration[] = []
const EMPTY_VARS: readonly string[] = []

/** Splits a scope token into its decoded parts. Unknown tokens degrade to `element`. */
export function parseScopeToken(token: string): {
  scope: CssDeclScope
  pseudo: string
  conditional: boolean
} {
  const conditional = token.startsWith('@')
  const body = conditional ? token.slice(1) : token
  if (body === '') return { scope: 'element', pseudo: '', conditional }
  if (body === '>') return { scope: 'descendant', pseudo: '', conditional }
  if (body.startsWith('::')) return { scope: 'pseudo', pseudo: body, conditional }
  return { scope: 'element', pseudo: '', conditional }
}

/**
 * Builds a decoder bound to one index. The returned function turns a packed
 * `byClass` entry into declarations, memoizing each table entry the first time
 * it is touched — a linted file mentions hundreds of classes, not 23 000.
 */
export function createDeclarationDecoder(
  index: CssDeclarationIndex,
): (packed: string | undefined) => readonly CssDeclaration[] {
  const pure = new Set(index.pureValues)
  const decoded: (CssDeclaration | undefined)[] = Array.from({ length: index.table.length })

  function varNames(map: Record<string, number[]>, valueId: number): readonly string[] {
    const ids = map[String(valueId)]
    if (!ids || ids.length === 0) return EMPTY_VARS
    const out: string[] = []
    for (const id of ids) {
      const name = index.vars[id]
      if (name !== undefined) out.push(name)
    }
    return out
  }

  function declAt(declId: number): CssDeclaration | undefined {
    const cached = decoded[declId]
    if (cached) return cached
    const entry = index.table[declId]
    if (entry === undefined) return undefined
    const first = entry.indexOf('|')
    const second = entry.indexOf('|', first + 1)
    if (first < 0 || second < 0) return undefined
    const scopeId = parseInt(entry.slice(0, first), 36)
    const propId = parseInt(entry.slice(first + 1, second), 36)
    const valueId = parseInt(entry.slice(second + 1), 36)
    const prop = index.props[propId]
    const value = index.values[valueId]
    if (prop === undefined || value === undefined) return undefined
    const { scope, pseudo, conditional } = parseScopeToken(index.scopes[scopeId] ?? '')
    const decl: CssDeclaration = {
      prop,
      value,
      valueId,
      scope,
      pseudo,
      conditional,
      readsVars: varNames(index.valueVars, valueId),
      readsFallbackVars: varNames(index.valueFallbackVars, valueId),
      pureVarRead: pure.has(valueId),
    }
    decoded[declId] = decl
    return decl
  }

  return function decode(packed: string | undefined): readonly CssDeclaration[] {
    if (!packed) return EMPTY_DECLS
    const out: CssDeclaration[] = []
    let start = 0
    for (let i = 0; i <= packed.length; i++) {
      if (i === packed.length || packed[i] === ',') {
        if (i > start) {
          const decl = declAt(parseInt(packed.slice(start, i), 36))
          if (decl) out.push(decl)
        }
        start = i + 1
      }
    }
    return out
  }
}

/** Shape check for a value read back from the disk cache. */
export function isCssDeclarationIndex(value: unknown): value is CssDeclarationIndex {
  if (typeof value !== 'object' || value === null) return false
  const i = value as Record<string, unknown>
  return (
    Array.isArray(i.scopes) &&
    i.scopes.length > 0 &&
    i.scopes[0] === '' &&
    Array.isArray(i.props) &&
    Array.isArray(i.values) &&
    Array.isArray(i.vars) &&
    Array.isArray(i.table) &&
    Array.isArray(i.pureValues) &&
    Array.isArray(i.partial) &&
    typeof i.byClass === 'object' &&
    i.byClass !== null &&
    typeof i.valueVars === 'object' &&
    i.valueVars !== null &&
    typeof i.valueFallbackVars === 'object' &&
    i.valueFallbackVars !== null
  )
}
