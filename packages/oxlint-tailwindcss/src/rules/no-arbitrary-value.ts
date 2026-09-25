import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { utilityHasDynamicValue, extractUtility, splitImportant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { createLazyLoader } from '../design-system/loader'
import { softGetDS } from '../utils/fatal'

type AllowVariables = 'none' | 'runtime' | 'all'

interface Options {
  allow?: string[]
  allowVariables?: AllowVariables
  entryPoint?: string
}

interface Compiled {
  allow: string[]
  allowVariables: AllowVariables
}

// `bg-(--x)`, `text-(length:--x)`, `bg-(--x)/50`
const SHORTHAND_VAR = /^-?[a-z][\w-]*?-\((?:[a-z-]+:)?(--[\w-]+)\)(?:\/.+)?$/
// `w-[var(--x)]`, `w-[length:var(--x)]`, `w-[var(--x,16rem)]`, `bg-[var(--x)]/50`
const EXPLICIT_VAR = /^-?[a-z][\w-]*?-\[(?:[a-z-]+:)?var\((--[\w-]+)(?:,[^\]]*)?\)\](?:\/.+)?$/

/**
 * The variable a utility's value is nothing but — `w-(--sidebar-width)`,
 * `h-[var(--radix-select-trigger-height)]` → `--…` — or null when the value is
 * anything more (`w-[calc(var(--x)*2)]`, `w-[200px]`).
 */
export function pureVariableOf(bareUtility: string): string | null {
  return SHORTHAND_VAR.exec(bareUtility)?.[1] ?? EXPLICIT_VAR.exec(bareUtility)?.[1] ?? null
}

export const noArbitraryValue = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow arbitrary values in Tailwind CSS classes',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
          allowVariables: { type: 'string', enum: ['none', 'runtime', 'all'] },
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allow: [], allowVariables: 'none' }],
    messages: {
      noArbitrary:
        '"{{className}}" uses an arbitrary value. Use a design token or extend your theme instead.',
    },
  },
  createOnce(context) {
    const getOptions = createLazyOptions<Options, Compiled>(context, (o) => ({
      allow: o?.allow ?? [],
      allowVariables: o?.allowVariables ?? 'none',
    }))

    // DS-OPTIONAL (see `softGetDS`), and only for `allowVariables: 'runtime'`:
    // the design system says which variables the stylesheet defines. It is
    // loaded the first time a pure variable reference turns up, never for a
    // file without one. Without it nothing can be proven undefined, so the
    // reference is reported — the safe side for a restriction rule.
    const getDS = createLazyLoader(context)

    function variableAllowed(variable: string, mode: AllowVariables): boolean {
      if (mode === 'all') return true
      if (mode === 'none') return false
      const ds = softGetDS(getDS)
      return ds !== null && !ds.cache.definesVar(variable)
    }

    function check(locations: ClassLocation[]) {
      const { allow, allowVariables } = getOptions()
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        for (const cls of classes) {
          // Both spellings of an arbitrary value count. `bg-(--x)` is sugar for
          // `bg-[var(--x)]` and only the second used to be reported, which
          // `enforce-consistent-variable-syntax` turned into a laundry service:
          // its `shorthand` autofix rewrote the reported form into the unreported
          // one and the violation vanished.
          if (!utilityHasDynamicValue(cls)) continue

          const utility = splitImportant(extractUtility(cls)).bare
          if (allow.some((prefix) => utility.startsWith(prefix))) continue

          if (allowVariables !== 'none') {
            const variable = pureVariableOf(utility)
            if (variable && variableAllowed(variable, allowVariables)) continue
          }

          context.report({
            node: loc.node,
            messageId: 'noArbitrary',
            data: { className: cls },
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
