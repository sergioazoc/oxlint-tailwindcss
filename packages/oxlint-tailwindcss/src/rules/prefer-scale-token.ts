import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import {
  getArbitraryValue,
  reattachImportant,
  splitImportant,
  splitUtilityAndVariant,
  utilityHasDynamicValue,
} from '../utils/class-parser'
import { createLazyLoader, rootFontSizeFromSettings } from '../design-system/loader'
import type { DesignSystemCache } from '../design-system/cache'
import { createLazyOptions, safeSettings } from '../utils/context'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'

interface Options {
  entryPoint?: string
  step?: number
  allow?: string[]
}

/** A length or plain number. Anything else can't be compared arithmetically. */
const LENGTH_RE = /^(-?\d*\.?\d+)(rem|px|em)?$/

/**
 * Convert a CSS length to px. `em` is treated as `rem`, which is what it is at
 * the root and the only interpretation available without a layout.
 */
function toPx(value: string, rootFontSize: number): number | null {
  const match = LENGTH_RE.exec(value.trim())
  if (!match) return null
  const n = Number.parseFloat(match[1])
  if (!Number.isFinite(n)) return null
  switch (match[2]) {
    case 'rem':
    case 'em':
      return n * rootFontSize
    case 'px':
    case undefined:
      return n
    default:
      return null
  }
}

/** Same length, allowing for float noise (`0.875rem` × 16 = 13.999999999999998). */
function sameLength(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001
}

/**
 * Is `n` a whole number of `step`s? `10 / 0.5` is exact in binary, `0.3 / 0.1`
 * is not, so the remainder is compared with a tolerance rather than to zero.
 */
function isOnStep(n: number, step: number): boolean {
  if (step <= 0) return false
  const steps = n / step
  return Math.abs(steps - Math.round(steps)) < 0.0001
}

/** Trailing zeros make `p-2.50`, which is not what Tailwind calls the class. */
function formatStep(n: number): string {
  return String(Number.parseFloat(n.toFixed(4)))
}

export const preferScaleToken = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer the scale step or theme token a hardcoded value is numerically equal to',
    },
    // Deliberately NOT fixable. The equivalence is numeric, not textual: the
    // token resolves through `var()`, so a `:root` override or a different root
    // font size makes the two diverge. Autofixing that is the mistake #78 fixed;
    // this rule only ever suggests.
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          step: { type: 'number' },
          allow: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}],
    messages: {
      preferToken:
        '"{{className}}" is the same value as "{{replacement}}". Use the token — but check it first: the token resolves through a CSS variable, so the two are equal in this theme, not by construction.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)
    const getOptions = createLazyOptions<Options, { step: number | null; allow: string[] }>(
      context,
      (o) => ({ step: typeof o?.step === 'number' ? o.step : null, allow: o?.allow ?? [] }),
    )

    let _rem: number | null = null
    function rootFontSize(): number {
      if (_rem === null) _rem = rootFontSizeFromSettings(safeSettings(context))
      return _rem
    }

    /**
     * The class this literal could have been written as, or null.
     *
     * Two families, in order of preference: a named theme token whose value
     * matches (`rounded-[0.5rem]` → `rounded-lg`), then a step of the spacing
     * scale (`p-[10px]` → `p-2.5`). Both come from data the precompute derived
     * from the design system, so neither is a name table.
     */
    function equivalentOf(cache: DesignSystemCache, bare: string): string | null {
      const { step: stepOverride, allow } = getOptions()
      if (allow.some((prefix) => bare.startsWith(prefix))) return null

      // A byte-identical named form is `no-unnecessary-arbitrary-value`'s
      // business (and `enforce-canonical`'s, which rewrites exactly those). One
      // check keeps this rule off both.
      if (cache.getNamedEquivalent(bare)) return null

      const value = getArbitraryValue(bare)
      if (value === null) return null
      const px = toPx(value, rootFontSize())
      if (px === null) return null

      const open = bare.indexOf('[')
      if (open <= 0) return null
      const prefix = bare.slice(0, open - 1)
      if (!prefix) return null

      for (const [literal, className] of cache.tokenValuesFor(prefix)) {
        const tokenPx = toPx(literal, rootFontSize())
        if (tokenPx !== null && sameLength(px, tokenPx)) return className
      }

      if (!cache.readsScale(prefix)) return null
      const scale = cache.scale
      if (!scale) return null
      const unitPx = toPx(scale.unit, rootFontSize())
      if (unitPx === null || unitPx <= 0) return null

      const steps = px / unitPx
      if (steps < 0) return null
      // Tailwind compiles any number, so without a granularity every length
      // would have an "equivalent" and this would just be `no-arbitrary-value`.
      // The default is the granularity Tailwind's own enumerated steps use,
      // derived by the precompute; `step` only ever makes it finer.
      if (!isOnStep(steps, stepOverride ?? scale.step)) return null

      const candidate = `${prefix}-${formatStep(steps)}`
      return cache.isValid(candidate) ? candidate : null
    }

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache } = ds

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        for (const cls of split.classes) {
          if (!utilityHasDynamicValue(cls)) continue
          const { utility, variant } = splitUtilityAndVariant(cls)
          const { bare, position } = splitImportant(utility)

          const equivalent = equivalentOf(cache, bare)
          if (!equivalent) continue

          const replacement = variant + reattachImportant(equivalent, position)
          // Rebuilt through the splitter so the `\n` + indent
          // `enforce-consistent-line-wrapping` introduces survives the suggestion.
          const fixedValue = rebuildClassString(
            split,
            split.classes.map((c) => (c === cls ? replacement : c)),
          )

          context.report({
            node: loc.node,
            messageId: 'preferToken',
            data: { className: cls, replacement },
            suggest: [
              {
                messageId: 'suggestReplace',
                data: { className: cls, replacement },
                fix(fixer) {
                  return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
                },
              },
            ],
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
