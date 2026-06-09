import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { extractUtility, getVariantPrefix, splitImportant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'
import { COMPLEMENTARY_GROUPS, COMPOSITION_PAIRS } from './no-conflicting-classes/spec'

export { COMPLEMENTARY_GROUPS, COMPOSITION_PAIRS } from './no-conflicting-classes/spec'

/**
 * Two utilities compose via CSS custom properties if both define their own
 * --tw-* properties that don't overlap — they each contribute to a shared
 * shorthand (e.g. `shadow` and `ring` both end up in `box-shadow` via
 * different intermediate vars).
 */
export function isCompositionViaCssVars(
  propsA: readonly string[],
  propsB: readonly string[],
): boolean {
  const customA = propsA.filter((p) => p.startsWith('--'))
  const customB = propsB.filter((p) => p.startsWith('--'))
  if (customA.length === 0 || customB.length === 0) return false
  return !customA.some((p) => customB.includes(p))
}

/**
 * Detect a narrowing override: the later class's CSS properties are a strict
 * subset of the earlier class's, so the later class refines one of the
 * shorthand's properties (size-4 h-6, rounded-t-lg rounded-tl-sm, truncate
 * text-clip). Direction-sensitive: the inverse means the wider later class
 * clobbers a prior narrower override.
 */
export function isNarrowingOverride(
  propsEarlier: readonly string[],
  propsLater: readonly string[],
): boolean {
  if (propsLater.length === 0 || propsLater.length >= propsEarlier.length) return false
  const setEarlier = new Set(propsEarlier)
  return propsLater.every((p) => setEarlier.has(p))
}

/**
 * Returns true if two classes (within the same variant) should NOT be reported
 * as conflicting despite sharing CSS properties. Pure: regex tables are passed
 * in (or default to the module-level constants).
 */
export function shouldSkipPair(
  a: string,
  b: string,
  propsA: readonly string[],
  propsB: readonly string[],
  rules: {
    complementaryGroups?: readonly RegExp[]
    compositionPairs?: readonly (readonly [RegExp, RegExp])[]
  } = {},
): boolean {
  if (isCompositionViaCssVars(propsA, propsB)) return true
  // Narrowing override (shorthand → longhand on one of its props)
  if (isNarrowingOverride(propsA, propsB)) return true

  const ua = splitImportant(extractUtility(a)).bare
  const ub = splitImportant(extractUtility(b)).bare

  const groups: readonly { pattern: RegExp }[] =
    rules.complementaryGroups !== undefined
      ? rules.complementaryGroups.map((pattern) => ({ pattern }))
      : COMPLEMENTARY_GROUPS
  for (const { pattern: re } of groups) {
    const ma = ua.match(re)
    const mb = ub.match(re)
    if (!ma || !mb) continue
    // No capture group: always compose within group (e.g. prose)
    if (ma[1] === undefined) return true
    // Different prefix: compose; same prefix: fall through to overlap check
    if (ma[1] !== mb[1]) return true
  }

  const pairs: readonly { a: RegExp; b: RegExp }[] =
    rules.compositionPairs !== undefined
      ? rules.compositionPairs.map(([a, b]) => ({ a, b }))
      : COMPOSITION_PAIRS
  for (const { a: reA, b: reB } of pairs) {
    if ((reA.test(ua) && reB.test(ub)) || (reA.test(ub) && reB.test(ua))) return true
  }
  return false
}

export const noConflictingClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Tailwind CSS classes that generate conflicting CSS properties',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}],
    messages: {
      // Don't claim the later class in the attribute "wins": CSS precedence is
      // decided by order in the generated stylesheet, not by order in the class
      // attribute (R-M3). Tell the user to remove one instead.
      conflict:
        '"{{classA}}" and "{{classB}}" both affect {{properties}}. Only one applies — which wins depends on the generated stylesheet order, not the attribute order. Remove one.',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache } = ds
      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        if (classes.length < 2) continue

        // Group classes by variant prefix (bracket-aware)
        const byVariant = new Map<string, string[]>()
        for (const cls of classes) {
          const variant = getVariantPrefix(cls)
          const existing = byVariant.get(variant) ?? []
          existing.push(cls)
          byVariant.set(variant, existing)
        }

        for (const [, variantClasses] of byVariant) {
          if (variantClasses.length < 2) continue

          // For each pair of classes in the same variant, compare CSS properties
          const propsMap = new Map<string, string[]>()
          for (const cls of variantClasses) {
            const props = cache.getCssProperties(splitImportant(extractUtility(cls)).bare)
            propsMap.set(cls, props)
          }

          // Detect conflicts
          for (let i = 0; i < variantClasses.length; i++) {
            const classA = variantClasses[i]
            const propsA = propsMap.get(classA) ?? []

            for (let j = i + 1; j < variantClasses.length; j++) {
              const classB = variantClasses[j]
              // An exact duplicate isn't a conflict with itself — that's
              // no-duplicate-classes' job (R-B9). Skip it here.
              if (classA === classB) continue
              const propsB = propsMap.get(classB) ?? []

              // Skip pairs that share CSS properties but target different elements/roles
              if (shouldSkipPair(classA, classB, propsA, propsB)) continue

              const propsBSet = new Set(propsB)
              const overlap = propsA.filter((p) => propsBSet.has(p))
              if (overlap.length > 0) {
                const propList =
                  overlap.length <= 3
                    ? `"${overlap.join('", "')}"`
                    : `${overlap.length} CSS properties`

                context.report({
                  node: loc.node,
                  messageId: 'conflict',
                  data: {
                    classA,
                    classB,
                    properties: propList,
                  },
                })
              }
            }
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
