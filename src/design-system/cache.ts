import { type PrecomputedData } from './sync-loader'
import { roundRemValue } from '../utils/floating-point'
import { extractUtility, hasArbitraryValue } from '../utils/class-parser'

export class DesignSystemCache {
  private canonicalMap = new Map<string, string>()
  private validitySet = new Set<string>()
  private orderMap = new Map<string, bigint | null>()
  private cssPropsMap = new Map<string, string[]>()
  private variantOrderMap = new Map<string, number>()
  private arbitraryEquivMap = new Map<string, string>()
  private _validClasses: string[] = []

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
      cache.orderMap.set(cls, BigInt(val))
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

    return className
  }

  isValid(className: string): boolean {
    if (this.validitySet.has(className)) return true

    // Strip variants and check base utility
    const utility = extractUtility(className)
    if (utility !== className && this.validitySet.has(utility)) return true

    // Arbitrary values (bracket syntax) are considered valid
    if (hasArbitraryValue(className)) return true

    return false
  }

  getOrder(className: string): bigint | null {
    const cached = this.orderMap.get(className)
    if (cached !== undefined) return cached

    // Fallback: use base utility order for variant-prefixed classes
    const utility = extractUtility(className)
    if (utility !== className) {
      const baseOrder = this.orderMap.get(utility)
      if (baseOrder !== undefined) return baseOrder
    }

    return null
  }

  getClassOrder(classes: string[]): [string, bigint | null][] {
    return classes.map((cls) => [cls, this.getOrder(cls)])
  }

  getCssProperties(className: string): string[] {
    return this.cssPropsMap.get(className) ?? []
  }

  getVariantPriority(variant: string): number | null {
    return this.variantOrderMap.get(variant) ?? null
  }

  hasVariantOrder(): boolean {
    return this.variantOrderMap.size > 0
  }

  getNamedEquivalent(className: string): string | null {
    return this.arbitraryEquivMap.get(className) ?? null
  }
}
