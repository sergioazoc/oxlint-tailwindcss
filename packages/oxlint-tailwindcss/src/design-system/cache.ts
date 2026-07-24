import { type PrecomputedData } from './sync-loader'
import {
  type CssDeclaration,
  type CssDeclarationIndex,
  createDeclarationDecoder,
} from './css-declarations'
import { roundRemValue } from '../utils/floating-point'
import {
  extractUtility,
  extractVariants,
  hasArbitraryValue,
  splitImportant,
} from '../utils/class-parser'

const EMPTY_DECLARATIONS: readonly CssDeclaration[] = []

export class DesignSystemCache {
  private canonicalMap = new Map<string, string>()
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
  private variantOrderMap = new Map<string, number>()
  private arbitraryEquivMap = new Map<string, string>()
  private _validClasses: string[] = []
  private _knownPrefixes: Set<string> | null = null
  private _maxOrder = 0n
  // Tailwind v4 project prefix ('' when none). All maps store prefix-free names;
  // this is consulted to strip/re-apply the prefix at the public-method boundary.
  private _prefix = ''
  // Component classes (`@layer components`, `[class~]`) — valid WITH or WITHOUT
  // the prefix. Kept separate from validitySet so `classValidity` can tell a
  // Tailwind utility (prefix-required) apart from a user component class.
  private componentSet = new Set<string>()

  static fromPrecomputed(data: PrecomputedData): DesignSystemCache {
    const cache = new DesignSystemCache()

    cache._validClasses = data.validClasses
    for (const cls of data.validClasses) {
      cache.validitySet.add(cls)
    }

    for (const [from, to] of Object.entries(data.canonical)) {
      cache.canonicalMap.set(from, roundRemValue(to))
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

    if (data.componentClasses) {
      for (const cls of data.componentClasses) {
        cache.validitySet.add(cls)
        cache.componentSet.add(cls)
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

  private getKnownPrefixes(): Set<string> {
    if (!this._knownPrefixes) {
      this._knownPrefixes = new Set<string>()
      for (const cls of this._validClasses) {
        const dash = cls.lastIndexOf('-')
        if (dash > 0) this._knownPrefixes.add(cls.slice(0, dash))
      }
    }
    return this._knownPrefixes
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
      // Base has a known prefix + numeric value: aspect-3/2 → prefix "aspect" known + "3" numeric
      if (/^(.+)-(\d+\.?\d*)$/.test(base)) {
        const dashIdx = base.lastIndexOf('-')
        if (dashIdx > 0 && this.getKnownPrefixes().has(base.slice(0, dashIdx))) return true
      }
    }

    // Dynamic numeric values: w-45, min-h-17.5, gap-13, etc.
    // Tailwind v4 accepts any number for known utility prefixes
    const numericMatch = /^(.+)-(\d+\.?\d*)$/.exec(bare)
    if (numericMatch && this.getKnownPrefixes().has(numericMatch[1])) {
      return true
    }

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

    // Dynamic numeric values: underline-offset-3, gap-13, etc. → look up prefix
    if (baseOrder === undefined) {
      const stripped = splitImportant(utility).bare
      const numericMatch = /^(.+)-(\d+\.?\d*)$/.exec(stripped)
      if (numericMatch && this.getKnownPrefixes().has(numericMatch[1])) {
        baseOrder = this.findOrderByPrefix(numericMatch[1] + '-')
      }
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
