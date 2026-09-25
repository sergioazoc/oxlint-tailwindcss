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
import { createLazyOptions, createLazySettings } from '../utils/context'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'
import { arbitraryPrefix, formatStep, isOnStep, measure, sameMeasure } from '../utils/measure'

interface Options {
  entryPoint?: string
  step?: number
  allow?: string[]
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

    // Per file: a nested .oxlintrc.json can set its own `rootFontSize`.
    const rootFontSize = createLazySettings(context, rootFontSizeFromSettings)

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
      const written = measure(value, rootFontSize())
      if (written === null) return null

      const prefix = arbitraryPrefix(bare)
      if (!prefix) return null

      for (const [literal, className] of cache.tokenValuesFor(prefix)) {
        const token = measure(literal, rootFontSize())
        if (token !== null && sameMeasure(written, token)) return className
      }

      if (!cache.readsScale(prefix)) return null
      const scale = cache.scale
      if (!scale) return null
      const unit = measure(scale.unit, rootFontSize())
      // Same kind of quantity on both sides, or the division is meaningless:
      // `p-[10]` is `padding: 10`, which is not 2.5 × `0.25rem`.
      if (unit === null || unit.px <= 0 || unit.unitless !== written.unitless) return null

      const steps = written.px / unit.px
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
