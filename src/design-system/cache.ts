import { type PrecomputedData } from './sync-loader'
import { roundRemValue } from '../utils/floating-point'
import { extractUtility, extractVariants, hasArbitraryValue } from '../utils/class-parser'

/** Strip `!` modifier from start or end: `!flex` → `flex`, `flex!` → `flex` */
function stripImportant(cls: string): { bare: string; important: boolean } {
  if (cls.startsWith('!')) return { bare: cls.slice(1), important: true }
  if (cls.endsWith('!')) return { bare: cls.slice(0, -1), important: true }
  return { bare: cls, important: false }
}

export class DesignSystemCache {
  private canonicalMap = new Map<string, string>()
  private validitySet = new Set<string>()
  private orderMap = new Map<string, bigint | null>()
  private cssPropsMap = new Map<string, string[]>()
  private variantOrderMap = new Map<string, number>()
  private arbitraryEquivMap = new Map<string, string>()
  private _validClasses: string[] = []
  private _knownPrefixes: Set<string> | null = null
  private _maxOrder = 0n

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

    for (const [cls, props] of Object.entries(data.cssProps)) {
      cache.cssPropsMap.set(cls, props)
    }

    if (data.variantOrder) {
      for (const [name, index] of Object.entries(data.variantOrder)) {
        cache.variantOrderMap.set(name, index)
      }
    }

    if (data.componentClasses) {
      for (const cls of data.componentClasses) {
        cache.validitySet.add(cls)
      }
    }

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
    const { bare, important } = stripImportant(utility)
    if (important) {
      const canonicalBare = this.canonicalMap.get(bare)
      if (canonicalBare !== undefined) {
        const variantPrefix = className.slice(0, className.length - utility.length)
        // Preserve the user's ! position — enforce-consistent-important-position handles normalization
        const isPrefix = utility.startsWith('!')
        return isPrefix
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

  /** Find the order of the first class matching a prefix (e.g. "max-w-" → order of "max-w-0") */
  private findOrderByPrefix(prefix: string): bigint | undefined {
    // Try prefix without trailing dash first (e.g. "border-" → "border")
    const withoutDash = prefix.endsWith('-') ? prefix.slice(0, -1) : null
    if (withoutDash) {
      const order = this.orderMap.get(withoutDash)
      if (order != null) return order
    }
    // Find first matching class in the order map
    for (const [cls, order] of this.orderMap) {
      if (cls.startsWith(prefix) && order != null) return order
    }
    return undefined
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
    const { bare } = stripImportant(utility)
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

  getOrder(className: string): bigint | null {
    const cached = this.orderMap.get(className)
    if (cached !== undefined) return cached

    const utility = extractUtility(className)
    const hasVariant = utility !== className

    // Resolve the base utility order through fallback chain
    let baseOrder: bigint | undefined = this.orderMap.get(utility) ?? undefined

    // Strip ! (important) and retry
    if (baseOrder === undefined) {
      const { bare, important } = stripImportant(utility)
      if (important) {
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
          const { bare, important } = stripImportant(base)
          if (important) {
            baseOrder = this.orderMap.get(bare) ?? undefined
          }
        }
      }
    }

    // Arbitrary values: max-w-[200px] → look up prefix "max-w-" in order map
    if (baseOrder === undefined) {
      const stripped = stripImportant(utility).bare
      const bracketIdx = stripped.indexOf('[')
      if (bracketIdx > 0) {
        const prefix = stripped.slice(0, bracketIdx)
        baseOrder = this.findOrderByPrefix(prefix)
      }
    }

    // CSS function syntax: h-(--cell-size), rounded-(--radius) → look up prefix "h-", "rounded-"
    if (baseOrder === undefined) {
      const stripped = stripImportant(utility).bare
      const parenIdx = stripped.indexOf('(')
      if (parenIdx > 0) {
        const prefix = stripped.slice(0, parenIdx)
        baseOrder = this.findOrderByPrefix(prefix)
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

  getCssProperties(className: string): string[] {
    const result = this.cssPropsMap.get(className)
    if (result) return result
    const { bare, important } = stripImportant(className)
    if (important) return this.cssPropsMap.get(bare) ?? []
    return []
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
    const { bare, important } = stripImportant(className)
    if (important) return this.arbitraryEquivMap.get(bare) ?? null
    return null
  }
}
