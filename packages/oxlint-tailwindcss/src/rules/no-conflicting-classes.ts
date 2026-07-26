import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import {
  extractUtility,
  getVariantPrefix,
  isUserValued,
  splitImportant,
} from '../utils/class-parser'
import { type CssDeclaration } from '../design-system/css-declarations'
import { resolveDeclarationsSync } from '../design-system/declaration-service'
import { createLazyLoader } from '../design-system/loader'
import { createLazyOptions } from '../utils/context'
import { compileRegexList, matchesAny } from '../utils/allowlist'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'
import { COMPLEMENTARY_GROUPS, COMPOSITION_PAIRS } from './no-conflicting-classes/spec'
import {
  type ClassFacts,
  type DeclKey,
  collectFacts,
  decidePair,
  declKey,
  isImportant,
  keyProp,
  keyScopeLabel,
  redundantSide,
} from './no-conflicting-classes/decide'

export { COMPLEMENTARY_GROUPS, COMPOSITION_PAIRS } from './no-conflicting-classes/spec'
export {
  decidePair,
  loserOnlyForwards,
  neededVars,
  resolveWinner,
  winnerAbsorbsLoser,
} from './no-conflicting-classes/decide'

interface Options {
  entryPoint?: string
  reportRedundant?: boolean
  allow?: (string | [string, string])[]
}

interface CompiledOptions {
  reportRedundant: boolean
  /** Classes to never report at all. */
  allowClasses: RegExp[]
  /** Pairs declared as composing by the user. */
  allowPairs: [RegExp, RegExp][]
}

/**
 * Compiles the `allow` option.
 *
 * A bare pattern silences every pair involving a matching class; a two-element
 * pattern silences that specific combination. This is the supported way to teach
 * the rule about a stack we cannot derive — nobody should have to wait for a
 * release of this plugin to silence a combination their own plugins produce.
 */
function compileAllow(
  allow: Options['allow'],
): Pick<CompiledOptions, 'allowClasses' | 'allowPairs'> {
  const allowClasses: string[] = []
  const allowPairs: [RegExp, RegExp][] = []
  for (const entry of allow ?? []) {
    if (typeof entry === 'string') {
      allowClasses.push(entry)
      continue
    }
    const [a, b] = compileRegexList(entry)
    // Both sides must compile, or the pair would silence more than it says.
    if (a && b) allowPairs.push([a, b])
  }
  return { allowClasses: compileRegexList(allowClasses), allowPairs }
}

/**
 * Returns true if two classes (within the same variant) should NOT be compared
 * at all, despite sharing CSS properties. Pure: regex tables are passed in (or
 * default to the module-level constants).
 *
 * These tables are the exception, not the mechanism: everything a comparison of
 * the generated CSS can decide is decided in `decide.ts`. What survives here is
 * plugin intent that no CSS comparison can see — see `spec.ts` for why each
 * entry cannot be derived.
 */
export function shouldSkipPair(
  a: string,
  b: string,
  rules: {
    complementaryGroups?: readonly RegExp[]
    compositionPairs?: readonly (readonly [RegExp, RegExp])[]
  } = {},
): boolean {
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
    // Different prefix: compose; same prefix: fall through to the CSS comparison
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

/** Whether the user's `allow` option silences this pair. */
function isAllowed(
  a: string,
  b: string,
  allowClasses: readonly RegExp[],
  allowPairs: readonly [RegExp, RegExp][],
): boolean {
  if (matchesAny(a, allowClasses) || matchesAny(b, allowClasses)) return true
  return allowPairs.some(
    ([reA, reB]) => (reA.test(a) && reB.test(b)) || (reA.test(b) && reB.test(a)),
  )
}

/**
 * `"color"` / `"color", "width"` / `3 CSS properties`, naming the box when it
 * isn't the element. A pair can clash on several boxes at once (a plugin utility
 * that styles itself and a `::-webkit-scrollbar` pseudo-element), so the label
 * goes per property unless every property shares the same box.
 */
function formatProperties(keys: readonly DeclKey[]): string {
  const scopes = new Set(keys.map(keyScopeLabel))
  if (scopes.size > 1) {
    const labelled = [
      ...new Set(
        keys.map((key) => {
          const scope = keyScopeLabel(key)
          return scope ? `"${keyProp(key)}" (${scope})` : `"${keyProp(key)}"`
        }),
      ),
    ]
    return labelled.length <= 3 ? labelled.join(', ') : `${labelled.length} CSS properties`
  }
  const props = [...new Set(keys.map(keyProp))]
  const list = props.length <= 3 ? `"${props.join('", "')}"` : `${props.length} CSS properties`
  const scope = [...scopes][0]
  return scope ? `${list} (${scope})` : list
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
          reportRedundant: { type: 'boolean' },
          allow: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
              ],
            },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ reportRedundant: true }],
    messages: {
      // The design system tells us the physical order of the generated
      // stylesheet, and that order — not the order of the class attribute —
      // decides the winner. So the message names it instead of hedging (R-M3).
      conflict:
        '"{{winner}}" overrides "{{loser}}" on {{properties}}. "{{winner}}" comes later in the generated stylesheet, so it wins no matter how the class attribute is ordered. Remove one.',
      // Fallback for when the design system cannot place one of the two classes
      // in the stylesheet: the clash is visible, the winner is not.
      conflictUnordered:
        '"{{classA}}" and "{{classB}}" both affect {{properties}}. Only one applies — which wins depends on the generated stylesheet order, not the attribute order. Remove one.',
      redundant:
        '"{{loser}}" has no effect: "{{winner}}" declares {{properties}} with the same value. Remove "{{loser}}".',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)
    const getOptions = createLazyOptions<Options, CompiledOptions>(context, (o) => ({
      reportRedundant: o?.reportRedundant ?? true,
      ...compileAllow(o?.allow),
    }))

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache } = ds
      const { reportRedundant, allowClasses, allowPairs } = getOptions()

      for (const loc of locations) {
        const classes = splitClasses(loc.value)
        if (classes.length < 2) continue

        // Group by variant prefix (bracket-aware): classes under different
        // variants apply in different states and never compete.
        const byVariant = new Map<string, string[]>()
        for (const cls of classes) {
          const variant = getVariantPrefix(cls)
          const existing = byVariant.get(variant) ?? []
          existing.push(cls)
          byVariant.set(variant, existing)
        }

        for (const [, variantClasses] of byVariant) {
          if (variantClasses.length < 2) continue

          // Classes whose value the user wrote are absent from the precompute.
          // Resolve them from the design system once per entry point, batched.
          const unknown = variantClasses
            .map((cls) => splitImportant(extractUtility(cls)).bare)
            .filter((bare) => cache.getCssDeclarations(bare).length === 0 && isUserValued(bare))
          if (unknown.length > 0) resolveDeclarationsSync(ds.entryPoint, cache, unknown)

          const facts: ClassFacts[] = variantClasses.map((cls) => {
            const utility = extractUtility(cls)
            const bare = splitImportant(utility).bare
            const declarations = cache.getCssDeclarations(bare)
            const decls = new Map<DeclKey, CssDeclaration>()
            const writes = new Map<string, number>()
            const ambiguousKeys = new Set<DeclKey>()
            for (const decl of declarations) {
              // Conditional declarations (`@media`, `@supports`) are not
              // comparable: they apply under conditions we don't model.
              if (decl.conditional) continue
              const key = declKey(decl)
              const previous = decls.get(key)
              // Same key twice with a different value means the two live under
              // selector conditions we don't model (`&:dir(ltr)` / `&:dir(rtl)`).
              // Flag it instead of letting the last one stand for the class.
              if (previous && previous.valueId !== decl.valueId) ambiguousKeys.add(key)
              // Last one wins, which is CSS semantics inside a rule.
              decls.set(key, decl)
              if (decl.prop.startsWith('--')) writes.set(decl.prop, decl.valueId)
            }
            return {
              className: cls,
              decls,
              writes,
              // An order synthesised from a prefix sibling cannot name a winner,
              // so it is reported as unknown and the diagnostic stays honest.
              order: cache.hasExactOrder(utility) ? cache.getOrder(cls) : null,
              important: isImportant(utility),
              partial: cache.isPartial(bare),
              ambiguousKeys,
            }
          })

          const group = collectFacts(facts)

          for (let i = 0; i < facts.length; i++) {
            for (let j = i + 1; j < facts.length; j++) {
              const a = facts[i]
              const b = facts[j]
              // An exact duplicate isn't a conflict with itself — that's
              // no-duplicate-classes' job (R-B9).
              if (a.className === b.className) continue
              if (shouldSkipPair(a.className, b.className)) continue
              if (isAllowed(a.className, b.className, allowClasses, allowPairs)) continue

              const verdict = decidePair(a, b, group)

              if (verdict.conflicts.length > 0) {
                const properties = formatProperties(verdict.conflicts)
                context.report(
                  verdict.orderKnown
                    ? {
                        node: loc.node,
                        messageId: 'conflict',
                        data: {
                          winner: verdict.winner.className,
                          loser: verdict.loser.className,
                          properties,
                        },
                      }
                    : {
                        node: loc.node,
                        messageId: 'conflictUnordered',
                        data: {
                          classA: a.className,
                          classB: b.className,
                          properties,
                        },
                      },
                )
                continue
              }

              if (!reportRedundant) continue
              const dead = redundantSide(verdict)
              if (dead) {
                context.report({
                  node: loc.node,
                  messageId: 'redundant',
                  data: {
                    loser: dead.loser.className,
                    winner: dead.winner.className,
                    properties: formatProperties(verdict.duplicates),
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
