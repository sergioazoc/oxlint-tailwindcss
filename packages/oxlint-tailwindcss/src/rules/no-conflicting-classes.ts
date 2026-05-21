import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { extractUtility, getVariantPrefix } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { safeGetDS } from '../utils/fatal'
import {
  COMPLEMENTARY_GROUPS as SPEC_COMPLEMENTARY_GROUPS,
  COMPOSITION_PAIRS as SPEC_COMPOSITION_PAIRS,
} from './no-conflicting-classes/spec'

// Backward-compatible exports: the rule keeps consuming bare regex tables,
// while `./no-conflicting-classes/spec.ts` is the authoritative source the
// docs site imports for its rendered explanations.
export const COMPLEMENTARY_GROUPS: readonly RegExp[] = SPEC_COMPLEMENTARY_GROUPS.map((g) => g.pattern)
export const COMPOSITION_PAIRS: readonly (readonly [RegExp, RegExp])[] = SPEC_COMPOSITION_PAIRS.map(
  (p) => [p.a, p.b] as const,
)
export {
  COMPLEMENTARY_GROUPS as COMPLEMENTARY_GROUPS_WITH_REASONS,
  COMPOSITION_PAIRS as COMPOSITION_PAIRS_WITH_REASONS,
} from './no-conflicting-classes/spec'

function stripImportant(utility: string): string {
  if (utility.startsWith('!')) return utility.slice(1)
  if (utility.endsWith('!')) return utility.slice(0, -1)
  return utility
}

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

  const ua = stripImportant(extractUtility(a))
  const ub = stripImportant(extractUtility(b))

  const groups = rules.complementaryGroups ?? COMPLEMENTARY_GROUPS
  for (const re of groups) {
    const ma = ua.match(re)
    const mb = ub.match(re)
    if (!ma || !mb) continue
    // No capture group: always compose within group (e.g. prose)
    if (ma[1] === undefined) return true
    // Different prefix: compose; same prefix: fall through to overlap check
    if (ma[1] !== mb[1]) return true
  }

  const pairs = rules.compositionPairs ?? COMPOSITION_PAIRS
  for (const [reA, reB] of pairs) {
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
      conflict:
        '"{{classA}}" and "{{classB}}" affect {{properties}}. "{{winner}}" takes precedence (appears later).',
      designSystemUnavailable: '{{message}}',
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
            const props = cache.getCssProperties(stripImportant(extractUtility(cls)))
            propsMap.set(cls, props)
          }

          // Detect conflicts
          for (let i = 0; i < variantClasses.length; i++) {
            const classA = variantClasses[i]
            const propsA = propsMap.get(classA) ?? []

            for (let j = i + 1; j < variantClasses.length; j++) {
              const classB = variantClasses[j]
              const propsB = propsMap.get(classB) ?? []

              // Skip pairs that share CSS properties but target different elements/roles
              if (shouldSkipPair(classA, classB, propsA, propsB)) continue

              const overlap = propsA.filter((p) => propsB.includes(p))
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
                    winner: classB,
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
