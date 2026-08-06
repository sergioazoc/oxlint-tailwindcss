import { type PrecomputedData } from './sync-loader'
import {
  type CssDeclaration,
  type CssDeclarationIndex,
  createDeclarationDecoder,
  parseScopeToken,
} from './css-declarations'
import { roundRemValue } from '../utils/floating-point'
import { type VariantFacts } from '../utils/class-parser'
import {
  extractUtility,
  extractVariants,
  hasArbitraryValue,
  splitImportant,
} from '../utils/class-parser'

const EMPTY_DECLARATIONS: readonly CssDeclaration[] = []
const EMPTY_TOKEN_VALUES: readonly [string, string][] = []

/** Off-scale numeric value: `w-45`, `min-h-17.5`, `gap-13`. */
const DYNAMIC_NUMERIC_RE = /^(.+)-\d+\.?\d*$/
/**
 * Off-scale percentage: `from-33%`, `via-51%`, `mask-b-from-70%`. The integer is
 * not an accident — Tailwind compiles `from-33%` and does NOT compile
 * `from-33.5%`, so a decimal here would be tolerance with nothing behind it.
 */
const DYNAMIC_PERCENT_RE = /^(.+)-\d+%$/

export class DesignSystemCache {
  private canonicalMap = new Map<string, string>()
  private deprecatedMap = new Map<string, string>()
  private validitySet = new Set<string>()
  private orderMap = new Map<string, bigint | null>()
  // Raw interned tables plus a per-class memo. Nothing is decoded up front: a
  // linted file mentions hundreds of classes, not the 23 000 the design system
  // knows, and eagerly building a map cost ~6 ms per design system for nothing.
  private declIndex: CssDeclarationIndex | null = null
  private decodeDecls: ((packed: string | undefined) => readonly CssDeclaration[]) | null = null
  private declMemo = new Map<string, readonly CssDeclaration[]>()
  private propsMemo = new Map<string, string[]>()
  private partialSet = new Set<string>()
  // Reverse of `declIndex.values`, built on first lint-time interning, plus the
  // next id to hand out for a value the precompute never saw. Ids live here
  // rather than in the artifact — see `internDeclarations`.
  private valueIdByText: Map<string, number> | null = null
  private nextValueId = 0
  private variantOrderMap = new Map<string, number>()
  private variantFactsMap = new Map<string, VariantFacts>()
  private arbitraryEquivMap = new Map<string, string>()
  private _validClasses: string[] = []
  private _prefixSets: { known: Set<string>; percent: Set<string> } | null = null
  private _maxOrder = 0n
  // Tailwind v4 project prefix ('' when none). All maps store prefix-free names;
  // this is consulted to strip/re-apply the prefix at the public-method boundary.
  private _prefix = ''
  // Component classes (`@layer components`, `[class~]`) — valid WITH or WITHOUT
  // the prefix. Kept separate from validitySet so `classValidity` can tell a
  // Tailwind utility (prefix-required) apart from a user component class.
  private componentSet = new Set<string>()
  private themeRefs = new Map<string, string[]>()
  private definedVarSet = new Set<string>()
  // Utility prefix → [literal value, class]. Read by prefer-scale-token; see
  // `PrecomputedData.tokenValues` for why only single-declaration numeric tokens
  // are in here.
  private tokenValuesMap = new Map<string, readonly [string, string][]>()
  private scaleFacts: { unit: string; step: number; prefixes: Set<string> } | null = null

  static fromPrecomputed(data: PrecomputedData): DesignSystemCache {
    const cache = new DesignSystemCache()

    cache._validClasses = data.validClasses
    for (const cls of data.validClasses) {
      cache.validitySet.add(cls)
    }

    for (const [from, to] of Object.entries(data.canonical)) {
      cache.canonicalMap.set(from, roundRemValue(to))
    }

    if (data.deprecated) {
      for (const [from, to] of Object.entries(data.deprecated)) {
        cache.deprecatedMap.set(from, to)
      }
    }

    for (const [cls, val] of Object.entries(data.order)) {
      const order = BigInt(val)
      cache.orderMap.set(cls, order)
      if (order > cache._maxOrder) cache._maxOrder = order
    }

    // Stored by reference, decoded on demand. Guarded rather than assumed: a
    // cache artifact missing the field is rejected upstream by
    // `isPrecomputedData`, so reaching here without it means a hand-built
    // object, which should read as "no declarations known" instead of throwing.
    if (data.cssDeclarations) {
      cache.declIndex = data.cssDeclarations
      cache.decodeDecls = createDeclarationDecoder(data.cssDeclarations)
      for (const cls of data.cssDeclarations.partial ?? []) {
        cache.partialSet.add(cls)
      }
    }

    if (data.variantOrder) {
      for (const [name, index] of Object.entries(data.variantOrder)) {
        cache.variantOrderMap.set(name, index)
      }
    }

    for (const [name, facts] of Object.entries(data.variantFacts ?? {})) {
      cache.variantFactsMap.set(name, {
        pseudoElement: facts.p === 1,
        structural: facts.s === 1,
      })
    }

    if (data.componentClasses) {
      for (const cls of data.componentClasses) {
        cache.validitySet.add(cls)
        cache.componentSet.add(cls)
      }
    }

    for (const name of data.definedVars ?? []) {
      cache.definedVarSet.add(name)
    }

    if (data.themeRefs) {
      for (const [name, refs] of Object.entries(data.themeRefs)) {
        cache.themeRefs.set(name, refs)
      }
    }

    for (const [prefix, entries] of Object.entries(data.tokenValues ?? {})) {
      cache.tokenValuesMap.set(prefix, entries)
    }

    if (data.scale) {
      cache.scaleFacts = {
        unit: data.scale.unit,
        step: data.scale.step,
        prefixes: new Set(data.scale.prefixes),
      }
    }

    cache._prefix = data.prefix ?? ''

    if (data.arbitraryEquivalents) {
      for (const [arb, named] of Object.entries(data.arbitraryEquivalents)) {
        cache.arbitraryEquivMap.set(arb, named)
      }
    }

    return cache
  }

  get validClasses(): string[] {
    return this._validClasses
  }

  get maxOrder(): bigint {
    return this._maxOrder
  }

  /** Tailwind v4 project prefix (e.g. 'tw'); '' when none is configured. */
  get prefix(): string {
    return this._prefix
  }

  canonicalize(className: string): string {
    const cached = this.canonicalMap.get(className)
    if (cached !== undefined) return cached

    // For variant-prefixed classes, canonicalize the base utility
    const utility = extractUtility(className)
    if (utility !== className) {
      const canonicalUtility = this.canonicalMap.get(utility)
      if (canonicalUtility !== undefined) {
        const prefix = className.slice(0, className.length - utility.length)
        return prefix + canonicalUtility
      }
    }

    // Strip ! (important) — prefix or suffix — and retry
    const { bare, position } = splitImportant(utility)
    if (position) {
      const canonicalBare = this.canonicalMap.get(bare)
      if (canonicalBare !== undefined) {
        const variantPrefix = className.slice(0, className.length - utility.length)
        // Preserve the user's ! position — enforce-consistent-important-position handles normalization
        return position === 'prefix'
          ? variantPrefix + '!' + canonicalBare
          : variantPrefix + canonicalBare + '!'
      }
    }

    return className
  }

  /**
   * The v4 name of a class Tailwind renamed, or `null` if it isn't a renamed
   * spelling. Takes the BARE utility (no variants, no `!`) — the caller has
   * already split those off to rebuild the replacement around them.
   *
   * Derived by the precompute from what `canonicalizeCandidates` reports for the
   * v3 spellings, rather than from a map maintained by hand. Two rules read it:
   * `no-deprecated-classes`, which owns the diagnostic, and `enforce-canonical`,
   * which stays quiet about these so one class doesn't produce two identical
   * rewrites.
   */
  deprecatedReplacement(bareUtility: string): string | null {
    return this.deprecatedMap.get(this.stripProjectPrefix(bareUtility)) ?? null
  }

  /** Whether the precompute produced a deprecation map at all (older artifacts didn't). */
  get hasDeprecatedMap(): boolean {
    return this.deprecatedMap.size > 0
  }

  /**
   * Resolve a variant name to its priority in the CSS output order.
   * Named variants use the precomputed map. Arbitrary variants use pattern-based heuristics
   * to approximate their position relative to named variants.
   */
  private resolveVariantPriority(variant: string): number {
    // Direct lookup
    const direct = this.variantOrderMap.get(variant)
    if (direct !== undefined) return direct

    // Strip named slots: group-hover/sidebar → group-hover
    if (variant.includes('/')) {
      const stripped = variant.slice(0, variant.indexOf('/'))
      const p = this.variantOrderMap.get(stripped)
      if (p !== undefined) return p
    }

    // group-* / peer-* compound: extract inner variant and resolve it
    if (variant.startsWith('group-') || variant.startsWith('peer-')) {
      const prefix = variant.startsWith('group-') ? 'group-' : 'peer-'
      const inner = variant.slice(prefix.length)
      const innerClean = inner.includes('/') ? inner.slice(0, inner.indexOf('/')) : inner
      return this.resolveVariantPriority(innerClean)
    }

    // data-* arbitrary variants: data-[state=open], data-panel-open → near data-open
    if (variant.startsWith('data-')) {
      return this.variantOrderMap.get('data-open') ?? 121
    }

    // Arbitrary selector: [&>svg], [& .class], [&_p] → sort after all named variants
    if (variant.startsWith('[')) {
      return (this.variantOrderMap.get('data-ending-style') ?? 124) + 10
    }

    // has-[...] / not-[...] → functional pseudo-classes, sort after state pseudo-classes
    if (variant.startsWith('has-') || variant.startsWith('not-') || variant.startsWith('in-')) {
      return (this.variantOrderMap.get('inert') ?? 48) + 1
    }

    // aria-* variants: aria-expanded, aria-invalid, etc. → after state pseudo-classes
    if (variant.startsWith('aria-')) {
      return (this.variantOrderMap.get('inert') ?? 48) + 2
    }

    return 0
  }

  // Lazily built map from every dash-bounded prefix (with and without
  // trailing dash) to the order of the FIRST class in iteration order that
  // exposes that prefix. Replaces a linear scan in the hot path of
  // `enforce-sort-order` (which calls `findOrderByPrefix` for every dynamic
  // utility — `bg-[#fff]`, `gap-13`, `h-(--var)`, etc.).
  private _prefixOrderMap: Map<string, bigint> | null = null

  private buildPrefixOrderMap(): Map<string, bigint> {
    const index = new Map<string, bigint>()
    for (const [cls, order] of this.orderMap) {
      if (order === null) continue
      // For `underline-offset-3` produce: `underline`, `underline-`,
      // `underline-offset`, `underline-offset-`. Insertion order in
      // `orderMap` is preserved, so the first class hitting a prefix wins.
      for (let i = cls.indexOf('-'); i >= 0; i = cls.indexOf('-', i + 1)) {
        const p = cls.slice(0, i)
        if (!index.has(p)) index.set(p, order)
        const pd = p + '-'
        if (!index.has(pd)) index.set(pd, order)
      }
    }
    return index
  }

  /** Find the order of the first class matching a prefix (e.g. "max-w-" → order of "max-w-0") */
  private findOrderByPrefix(prefix: string): bigint | undefined {
    // Try prefix without trailing dash first (e.g. "border-" → "border")
    const withoutDash = prefix.endsWith('-') ? prefix.slice(0, -1) : null
    if (withoutDash) {
      const order = this.orderMap.get(withoutDash)
      if (order != null) return order
    }
    if (!this._prefixOrderMap) this._prefixOrderMap = this.buildPrefixOrderMap()
    return this._prefixOrderMap.get(prefix)
  }

  /**
   * The two prefix sets the off-scale heuristics need, derived in ONE pass over
   * the ~23 600 valid class names.
   *
   * `known` is every dash-bounded prefix. `percent` is the subset that has at
   * least one enumerated class ending in `%`, and it exists because Tailwind
   * enumerates only 21 of the 101 percentages it compiles (0, 5, …, 100): a
   * `from-33%` is as real as a `w-45`, and was reported as a typo of `from-35%`
   * — a quick-fix that silently moves the gradient stop.
   *
   * The narrower set is the point. Accepting `<any known prefix>-N%` would reach
   * the ~1 780 prefixes Tailwind has, when only 22 take a percentage, and the
   * directional rules guard their replacements with `isValid` alone (no design
   * system to refute them), so `ml-33%` → `ms-33%` would start being reported and
   * autofixed from one dead class to another. Derived rather than listed: it
   * self-extends when a plugin enumerates percentage classes and self-prunes when
   * Tailwind stops emitting them.
   */
  private prefixSets(): { known: Set<string>; percent: Set<string> } {
    if (!this._prefixSets) {
      const known = new Set<string>()
      const percent = new Set<string>()
      for (const cls of this._validClasses) {
        const dash = cls.lastIndexOf('-')
        if (dash <= 0) continue
        const prefix = cls.slice(0, dash)
        known.add(prefix)
        if (cls.endsWith('%')) percent.add(prefix)
      }
      this._prefixSets = { known, percent }
    }
    return this._prefixSets
  }

  private getKnownPrefixes(): Set<string> {
    return this.prefixSets().known
  }

  /**
   * The utility prefix of an off-scale dynamic value, or null when the shape
   * doesn't match or the prefix doesn't take that kind of value. Shared by
   * `isValid` and `getOrder` so the two can't drift on what "dynamic" means.
   */
  private dynamicValuePrefix(bare: string): string | null {
    const numeric = DYNAMIC_NUMERIC_RE.exec(bare)
    if (numeric) return this.getKnownPrefixes().has(numeric[1]) ? numeric[1] : null
    const percent = DYNAMIC_PERCENT_RE.exec(bare)
    if (percent) return this.prefixSets().percent.has(percent[1]) ? percent[1] : null
    return null
  }

  /**
   * Is this class name in the precomputed set VERBATIM?
   *
   * `isValid` is deliberately tolerant: it accepts anything shaped like a dynamic
   * value (`w-45`, `bg-red-5000`, `bg-red-500/foo`) because there used to be no
   * way to ask the design system at lint time. That tolerance is what let
   * `no-unknown-classes` accept classes Tailwind compiles to nothing. This is the
   * exact answer, so a rule can tell "known to produce CSS" from "shaped like it
   * might" and ask the design system about the difference.
   */
  isKnownClass(className: string): boolean {
    return this.validitySet.has(this.stripProjectPrefix(className))
  }

  /**
   * Is this a NAMED group/peer marker — `group/menu-item`, `peer/menu-button`?
   *
   * A marker binds a variant to one specific ancestor or sibling, and the
   * consumer's compiled selector hard-codes it as a class selector:
   * `group-hover/menu-item:underline` emits
   * `:is(:where(.group\/menu-item):hover *)`. A class selector matches whole
   * tokens, so bare `group` does not satisfy it — the named marker is required
   * markup. Tailwind emits no CSS for the marker itself, which is why
   * `no-unknown-classes` cannot ask "does it compile?" about one.
   *
   * Derived, not listed: the base must be a precomputed class that emits ZERO
   * declarations, which across every fixture resolves to exactly `group` and
   * `peer` (2 of ~23.6k). It self-prunes if Tailwind drops the variants,
   * self-extends if a new CSS-less marker appears, and excludes `@container/main`
   * for free — that one HAS declarations. The component set is subtracted
   * because a class referenced only through `[class~="…"]` (`not-prose`) also has
   * no declarations of its own, and `not-prose/x` is not Tailwind syntax.
   *
   * The name is user-chosen and Tailwind never checks that it exists, so any
   * NON-EMPTY name is accepted — including the shapes only an arbitrary modifier
   * can reach (`group/*`, `group/a/b`, `peer//x`), which is why this splits at
   * the FIRST slash rather than the last one `isValid` uses. The empty name is
   * the one genuinely dead spelling: `group-hover/` compiles to nothing.
   */
  isMarkerClass(className: string): boolean {
    const bare = this.stripProjectPrefix(className)
    const slash = bare.indexOf('/')
    if (slash <= 0 || slash === bare.length - 1) return false
    const base = bare.slice(0, slash)
    return (
      this.validitySet.has(base) &&
      !this.componentSet.has(base) &&
      this.getCssDeclarations(base).length === 0
    )
  }

  /** Variant names the design system reports, for suggesting a typo's neighbour. */
  variantNames(): string[] {
    return [...this.variantOrderMap.keys()]
  }

  /**
   * The numeric theme tokens this utility prefix can be written with, as
   * `[literal value, class]`. Empty when the prefix has none.
   */
  tokenValuesFor(prefix: string): readonly [string, string][] {
    return this.tokenValuesMap.get(this.stripProjectPrefix(prefix)) ?? EMPTY_TOKEN_VALUES
  }

  /**
   * The spacing scale as the design system describes it: the resolved value of
   * `--spacing`, the granularity Tailwind's own enumerated steps use, and whether
   * a given prefix reads it. `null` when the theme has no `--spacing`.
   */
  get scale(): { unit: string; step: number } | null {
    return this.scaleFacts ? { unit: this.scaleFacts.unit, step: this.scaleFacts.step } : null
  }

  readsScale(prefix: string): boolean {
    return this.scaleFacts?.prefixes.has(this.stripProjectPrefix(prefix)) ?? false
  }

  isValid(className: string): boolean {
    if (this.validitySet.has(className)) return true

    // Strip variants and check base utility
    const utility = extractUtility(className)
    if (utility !== className && this.validitySet.has(utility)) return true

    // Strip ! (important) for validation
    const { bare } = splitImportant(utility)
    if (bare !== utility && this.validitySet.has(bare)) return true

    // Slash modifier: bg-black/80 (opacity), aspect-3/2 (ratio), w-1/2 (fraction)
    const slashIdx = bare.lastIndexOf('/')
    if (slashIdx > 0) {
      const base = bare.slice(0, slashIdx)
      // Base is a known valid class: bg-black/80 → bg-black valid
      if (this.validitySet.has(base)) return true
      // Base has a known prefix + numeric value: aspect-3/2 → prefix "aspect" known + "3" numeric.
      // Numeric only, deliberately: Tailwind compiles neither a percentage base
      // (`from-33%/50`) nor a percentage modifier (`bg-black/50%`).
      const numericBase = DYNAMIC_NUMERIC_RE.exec(base)
      if (numericBase && this.getKnownPrefixes().has(numericBase[1])) return true
    }

    // Dynamic values off the enumerated scale: w-45, min-h-17.5, gap-13, from-33%.
    if (this.dynamicValuePrefix(bare) !== null) return true

    // Arbitrary values: bracket syntax [200px] or variable shorthand (--var)
    if (hasArbitraryValue(className)) return true
    if (bare.includes('(') && bare.includes(')')) return true

    return false
  }

  /**
   * Strict validity for `no-unknown-classes`, prefix-aware.
   *
   * - `'valid'`         — usable as written.
   * - `'missing-prefix'`— a real Tailwind utility written WITHOUT the required
   *   project prefix (`flex` under `prefix(tw)`); generates no CSS.
   * - `'unknown'`       — not a recognized class.
   *
   * When no prefix is configured this collapses to the tolerant `isValid`
   * behavior. `isValid` itself stays tolerant (other rules call it with
   * prefix-free candidates), so the strict check lives here.
   */
  classValidity(className: string): 'valid' | 'missing-prefix' | 'unknown' {
    if (!this._prefix) return this.isValid(className) ? 'valid' : 'unknown'

    const tag = this._prefix + ':'
    const hadPrefix = className.startsWith(tag)
    const body = hadPrefix ? className.slice(tag.length) : className

    // Base utility (no variants, no important, no slash modifier) to classify
    // component-vs-utility. Component classes are valid with or without prefix.
    let baseUtility = splitImportant(extractUtility(body)).bare
    const slashIdx = baseUtility.lastIndexOf('/')
    if (slashIdx > 0) baseUtility = baseUtility.slice(0, slashIdx)
    if (this.componentSet.has(baseUtility)) return 'valid'

    // Tailwind utility? Validate the unprefixed body via the tolerant path,
    // reusing the dynamic-numeric / arbitrary / slash / important logic.
    if (this.isValid(body)) return hadPrefix ? 'valid' : 'missing-prefix'

    return 'unknown'
  }

  getOrder(className: string): bigint | null {
    // Strip the project prefix so the variant-synthesis below sees the real
    // variant chain. Otherwise `tw` counts as the first variant and distorts
    // the synthesized order for prefixed classes (orderMap is prefix-free).
    if (this._prefix && className.startsWith(this._prefix + ':')) {
      className = className.slice(this._prefix.length + 1)
    }

    const cached = this.orderMap.get(className)
    if (cached !== undefined) return cached

    const utility = extractUtility(className)
    const hasVariant = utility !== className

    // Resolve the base utility order through fallback chain
    let baseOrder: bigint | undefined = this.orderMap.get(utility) ?? undefined

    // Strip ! (important) and retry
    if (baseOrder === undefined) {
      const { bare, position } = splitImportant(utility)
      if (position) {
        baseOrder = this.orderMap.get(bare) ?? undefined
      }
    }

    // Strip slash modifier: bg-muted/50 → bg-muted
    if (baseOrder === undefined) {
      const slashIdx = utility.lastIndexOf('/')
      if (slashIdx > 0) {
        const base = utility.slice(0, slashIdx)
        baseOrder = this.orderMap.get(base) ?? undefined
        // Also try stripping ! from the base before slash
        if (baseOrder === undefined) {
          const { bare, position } = splitImportant(base)
          if (position) {
            baseOrder = this.orderMap.get(bare) ?? undefined
          }
        }
      }
    }

    // Arbitrary values: max-w-[200px] → look up prefix "max-w-" in order map
    if (baseOrder === undefined) {
      const stripped = splitImportant(utility).bare
      const bracketIdx = stripped.indexOf('[')
      if (bracketIdx > 0) {
        const prefix = stripped.slice(0, bracketIdx)
        baseOrder = this.findOrderByPrefix(prefix)
      }
    }

    // CSS function syntax: h-(--cell-size), rounded-(--radius) → look up prefix "h-", "rounded-"
    if (baseOrder === undefined) {
      const stripped = splitImportant(utility).bare
      const parenIdx = stripped.indexOf('(')
      if (parenIdx > 0) {
        const prefix = stripped.slice(0, parenIdx)
        baseOrder = this.findOrderByPrefix(prefix)
      }
    }

    // Dynamic values off the scale: underline-offset-3, gap-13, from-33% → prefix
    if (baseOrder === undefined) {
      const prefix = this.dynamicValuePrefix(splitImportant(utility).bare)
      if (prefix) baseOrder = this.findOrderByPrefix(prefix + '-')
    }

    if (baseOrder === undefined) return null

    // No variant prefix → just the base order
    if (!hasVariant) return baseOrder

    // Synthesize order for variant-prefixed classes.
    // Variant classes must sort AFTER all base classes, grouped by variant priority.
    // Use the first variant's priority as primary key; sub-variants are tie-breakers.
    const variants = extractVariants(className)
    const firstPriority = this.resolveVariantPriority(variants[0]) + 1
    let subPriority = 0
    for (let i = 1; i < variants.length; i++) {
      subPriority += this.resolveVariantPriority(variants[i]) + 1
    }

    const bucketSize = this._maxOrder + 1n
    const SUB_MULTIPLIER = 1000n
    return (
      BigInt(firstPriority) * SUB_MULTIPLIER * bucketSize +
      BigInt(subPriority) * bucketSize +
      baseOrder
    )
  }

  /**
   * Whether the stylesheet order for this exact class is known, as opposed to
   * approximated from a prefix sibling. Callers that name a winner must not do
   * so from an approximation: `w-[10px]` and `w-[20px]` both borrow the order of
   * the first `w-*` class, which says nothing about their real positions.
   */
  hasExactOrder(className: string): boolean {
    const key = this.stripProjectPrefix(className)
    if (this.orderMap.get(key) != null) return true
    const { bare, position } = splitImportant(key)
    return position !== null && this.orderMap.get(bare) != null
  }

  getClassOrder(classes: string[]): [string, bigint | null][] {
    return classes.map((cls) => [cls, this.getOrder(cls)])
  }

  /**
   * Every declaration the class emits, in emission order, not deduplicated.
   * Includes declarations on pseudo-elements and (for classes that style only
   * their descendants, like `space-x-*`) on descendants — each tagged with its
   * scope, so callers never mistake one box for another.
   */
  getCssDeclarations(className: string): readonly CssDeclaration[] {
    const key = this.stripProjectPrefix(className)
    const memo = this.declMemo.get(key)
    if (memo) return memo
    const byClass = this.declIndex?.byClass
    let packed = byClass?.[key]
    if (packed === undefined) {
      const { bare, position } = splitImportant(key)
      if (position) packed = byClass?.[bare]
    }
    const decoded = this.decodeDecls?.(packed) ?? EMPTY_DECLARATIONS
    this.declMemo.set(key, decoded)
    return decoded
  }

  /**
   * Adds declarations resolved at lint time (for classes the precompute never
   * saw — arbitrary values, slash modifiers, off-scale numbers) and memoizes
   * them like any other class.
   *
   * Values are interned against the SAME table the precompute filled, which is
   * the point: `p-4`'s value id has to be comparable with `p-[1rem]`'s, or the
   * two could never be told apart from a genuine conflict.
   */
  internDeclarations(
    className: string,
    raws: readonly (readonly [string, string, string])[],
    valueFacts: Record<string, { p: string[]; f: string[]; u: boolean }>,
  ): readonly CssDeclaration[] {
    const index = this.declIndex
    if (!index) return EMPTY_DECLARATIONS
    if (!this.valueIdByText) {
      this.valueIdByText = new Map(index.values.map((value, id) => [value, id]))
      this.nextValueId = index.values.length
    }
    const decls: CssDeclaration[] = []
    let hasElement = false
    let hasDescendant = false
    let hasConditional = false
    for (const [scopeToken, prop, value] of raws) {
      let valueId = this.valueIdByText.get(value)
      if (valueId === undefined) {
        // Numbered above the precomputed range but NOT appended to
        // `index.values`: that array belongs to the cache artifact, which is
        // shared by reference. Two caches built from the same artifact would
        // each push into it while holding their own text→id map, so the same
        // value would end up with two different ids — and `decidePair` compares
        // ids, so two identical values would read as a conflict. Nothing reads
        // ids back out of the array (the decoder only resolves ids that came
        // from `index.table`, all precomputed), so keeping them local is free.
        valueId = this.nextValueId++
        this.valueIdByText.set(value, valueId)
      }
      const facts = valueFacts[value]
      const { scope, pseudo, conditional } = parseScopeToken(scopeToken)
      if (conditional) hasConditional = true
      else if (scope === 'element') hasElement = true
      else if (scope === 'descendant') hasDescendant = true
      decls.push({
        prop,
        value,
        valueId,
        scope,
        pseudo,
        conditional,
        readsVars: facts?.p ?? [],
        readsFallbackVars: facts?.f ?? [],
        pureVarRead: facts?.u ?? false,
      })
    }
    const key = this.stripProjectPrefix(className)
    // Same decision the precompute makes for the classes it knows: CSS we did
    // not model in full must never be reported as redundant.
    if (hasConditional || (hasElement && hasDescendant)) this.partialSet.add(key)
    this.declMemo.set(key, decls)
    this.propsMemo.delete(key)
    return decls
  }

  /**
   * True when the class emits CSS we deliberately did not model in full
   * (descendant rules alongside its own, or `@media`/`@supports` blocks). Such a
   * class must never be reported as redundant.
   */
  isPartial(className: string): boolean {
    return this.partialSet.has(this.stripProjectPrefix(className))
  }

  /**
   * Property names the class declares on its OWN box, unconditionally.
   * Deduplicated, in emission order.
   */
  getCssProperties(className: string): string[] {
    const key = this.stripProjectPrefix(className)
    const memo = this.propsMemo.get(key)
    if (memo) return memo
    const seen = new Set<string>()
    const props: string[] = []
    for (const decl of this.getCssDeclarations(key)) {
      if (decl.scope !== 'element' || decl.conditional) continue
      if (seen.has(decl.prop)) continue
      seen.add(decl.prop)
      props.push(decl.prop)
    }
    this.propsMemo.set(key, props)
    return props
  }

  /** Strips the Tailwind project prefix (`tw:flex` → `flex`), if configured. */
  private stripProjectPrefix(className: string): string {
    if (this._prefix && className.startsWith(this._prefix + ':')) {
      return className.slice(this._prefix.length + 1)
    }
    return className
  }

  /**
   * Whether `varName` resolves to `target` through theme indirection.
   *
   * `@theme inline { --color-primary: var(--primary) }` makes `bg-primary` and
   * `bg-(--primary)` the same declaration; a literal `--color-primary: oklch(…)`
   * makes them different colours. Only the theme table can tell those apart.
   */
  themeVarResolvesTo(varName: string, target: string, depth = 4): boolean {
    if (varName === target) return true
    if (depth <= 0) return false
    const refs = this.themeRefs.get(varName)
    if (!refs) return false
    return refs.some((ref) => this.themeVarResolvesTo(ref, target, depth - 1))
  }

  /** Whether the project defines this custom property (theme or plain CSS). */
  definesVar(varName: string): boolean {
    return this.definedVarSet.has(varName) || this.themeRefs.has(varName)
  }

  /**
   * What the variant's selector does, derived from the design system. `undefined`
   * means "no information" — the caller falls back to its static predicates,
   * which is what keeps the variant rules working without an entry point.
   *
   * Compound variants (`group-hover/name`, `peer-checked`) resolve through the
   * same normalisation the priority lookup uses.
   */
  getVariantFacts(variant: string): VariantFacts | undefined {
    const direct = this.variantFactsMap.get(variant)
    if (direct) return direct
    const slash = variant.indexOf('/')
    if (slash > 0) return this.variantFactsMap.get(variant.slice(0, slash))
    return undefined
  }

  getVariantPriority(variant: string): number | null {
    return this.variantOrderMap.get(variant) ?? null
  }

  hasVariantOrder(): boolean {
    return this.variantOrderMap.size > 0
  }

  getNamedEquivalent(className: string): string | null {
    const result = this.arbitraryEquivMap.get(className)
    if (result) return result
    const { bare, position } = splitImportant(className)
    if (position) return this.arbitraryEquivMap.get(bare) ?? null
    return null
  }
}
