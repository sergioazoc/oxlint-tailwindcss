import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors, isFinalClassList, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import {
  extractVariants,
  extractUtility,
  isUserValued,
  splitImportant,
} from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { resolveDeclarationsSync } from '../design-system/declaration-service'
import { isFatalError, softGetDS } from '../utils/fatal'
import { debugLog } from '../design-system/debug'
import { createLazyOptions } from '../utils/context'
import type { CssDeclaration } from '../design-system/css-declarations'

interface Options {
  variants?: string[]
  entryPoint?: string
}

const DEFAULT_VARIANTS = ['dark']

// Multi-part prefixes, sorted longest-first so longer matches take priority
const KNOWN_PREFIXES = [
  'rounded-tl',
  'rounded-tr',
  'rounded-bl',
  'rounded-br',
  'rounded-ss',
  'rounded-se',
  'rounded-es',
  'rounded-ee',
  'ring-offset',
  'border-t',
  'border-b',
  'border-l',
  'border-r',
  'border-s',
  'border-e',
  'border-x',
  'border-y',
  'rounded-t',
  'rounded-b',
  'rounded-l',
  'rounded-r',
  'rounded-s',
  'rounded-e',
  'divide-x',
  'divide-y',
  'scroll-m',
  'scroll-p',
  'from',
  'via',
  'to',
]

// Utilities that set the SAME CSS property under different bare names, for when
// no design system is available. The prefix heuristic can't group these (`block`
// and `hidden` share no prefix), so `block dark:hidden` — the idiomatic "show in
// light, hide in dark" — would wrongly report a missing base (R-M5).
//
// With an entry point configured this is redundant: the properties each class
// declares are read from the design system, which covers these two groups and
// every other same-property pair a list like this would have to enumerate
// (`underline`/`no-underline`, `italic`/`not-italic`, `visible`/`invisible`,
// `uppercase`/`normal-case`, `truncate`/`text-clip`, `sr-only`/`not-sr-only`…).
const PROPERTY_GROUP_BY_UTILITY: Record<string, string> = {}
for (const u of [
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'flow-root',
  'contents',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-row',
  'table-row-group',
  'table-header-group',
  'table-footer-group',
  'table-column',
  'table-column-group',
  'list-item',
  'hidden',
]) {
  PROPERTY_GROUP_BY_UTILITY[u] = 'display'
}
for (const u of ['static', 'fixed', 'absolute', 'relative', 'sticky']) {
  PROPERTY_GROUP_BY_UTILITY[u] = 'position'
}

// ── What counts as colour ────────────────────────────────────────────────
//
// Only colour needs a light-mode base: a dark-only colour leaves light mode
// with whatever the element inherits, but a dark-only filter, display, width or
// opacity leaves light mode with the element's normal rendering — the intent.

/** `color`, `background-color`, `--tw-ring-color`, `fill`, the gradient stops… */
const COLOR_PROPERTY = /(^|-)color$|^(fill|stroke)$|^--tw-gradient-(from|via|to)$/
const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i

/** `var(--a, rgb(0 0 0))` → ``: a fallback inside `var()` is not what the class sets. */
function withoutVarGroups(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    if (value.startsWith('var(', i)) {
      let depth = 0
      for (; i < value.length; i++) {
        if (value[i] === '(') depth++
        else if (value[i] === ')' && --depth === 0) break
      }
      continue
    }
    out += value[i]
  }
  return out
}

/**
 * The colour property a class sets, read from the CSS it emits — a colour
 * property, a read of a `--color-*` theme variable, or a colour literal — or
 * null when it sets none. Descendant and pseudo-element declarations count
 * (`divide-*`, `placeholder-*` colour other boxes); `@media`-conditional ones
 * don't.
 */
function colorPropertyOf(decls: readonly CssDeclaration[]): string | null {
  const own = decls.filter((d) => !d.conditional)
  for (const d of own) if (COLOR_PROPERTY.test(d.prop)) return d.prop
  for (const d of own) {
    if (d.readsVars.some((v) => v.startsWith('--color-'))) return d.prop
    if (COLOR_LITERAL.test(withoutVarGroups(d.value))) return d.prop
  }
  return null
}

/** Utility roots that are never colour, for when no design system can tell. */
const NEVER_COLOR_ROOTS = [
  'blur',
  'brightness',
  'contrast',
  'drop-shadow',
  'grayscale',
  'hue-rotate',
  'invert',
  'saturate',
  'sepia',
  'filter',
  'backdrop',
  'opacity',
]
const NEVER_COLOR_EXACT = new Set(['sr-only', 'not-sr-only', 'visible', 'invisible', 'collapse'])
// Border / outline / ring / divide WIDTHS and STYLES: `border`, `border-r`, `border-2`,
// `border-[3px]`, `ring`, `outline-0`, `border-dashed`, `ring-inset`.
const WIDTH_OR_STYLE =
  /^(?:border|outline|ring|divide)(?:-[xytrblse])?(?:-(?:\d+(?:\.\d+)?|\[\d*\.?\d+(?:px|rem|em)?\]|solid|dashed|dotted|double|hidden|none|inset))?$/

/**
 * Without a design system: true for the families that are never colour, so only
 * they drop out of the prefix check — anything else is still reported.
 */
function isNeverColorStatic(bare: string): boolean {
  const u = bare.startsWith('-') ? bare.slice(1) : bare
  if (NEVER_COLOR_EXACT.has(u) || PROPERTY_GROUP_BY_UTILITY[u]) return true
  if (NEVER_COLOR_ROOTS.some((root) => u === root || u.startsWith(`${root}-`))) return true
  return WIDTH_OR_STYLE.test(u)
}

/**
 * Maps a utility to a key identifying the CSS property it sets, so a base and a
 * variant class for the same property group together. Exact-match equivalence
 * groups (display, position) win; otherwise fall back to the prefix heuristic
 * (e.g. "bg" from "bg-gray-900", "text" from "text-white").
 */
function getUtilityPrefix(utility: string): string {
  let u = splitImportant(utility).bare
  if (u.startsWith('-')) u = u.slice(1)

  const group = PROPERTY_GROUP_BY_UTILITY[u]
  if (group) return group

  for (const prefix of KNOWN_PREFIXES) {
    if (u === prefix || u.startsWith(`${prefix}-`)) return prefix
  }

  const dashIdx = u.indexOf('-')
  return dashIdx >= 0 ? u.slice(0, dashIdx) : u
}

export const noDarkWithoutLight = defineRule({
  meta: {
    type: 'problem',
    docs: ruleDocs('no-dark-without-light', {
      description: 'Require a base (light) utility when using dark: (or other scheme) variant',
      category: 'correctness',
      recommended: 'warn',
      designSystem: 'optional',
    }),
    schema: [
      {
        type: 'object',
        properties: {
          variants: { type: 'array', items: { type: 'string' } },
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ variants: DEFAULT_VARIANTS }],
    messages: {
      missingBase:
        '"{{className}}" uses the {{variant}} variant, but there is no base "{{prefix}}-*" class on this element.',
      missingBaseProperty:
        '"{{className}}" sets {{property}} only under the {{variant}} variant: no class on this element sets {{property}} without it, so the other mode shows whatever it inherits.',
    },
  },
  createOnce(context) {
    const getWatchedVariants = createLazyOptions<Options, Set<string>>(
      context,
      (o) => new Set(o?.variants ?? DEFAULT_VARIANTS),
    )

    // DS-OPTIONAL (see `softGetDS`): with an entry point the rule also groups by
    // the CSS properties each class declares, which is the only way to know that
    // `underline` and `no-underline` are the same concern. Without one it falls
    // back to the prefix heuristic alone, exactly as before.
    const getDS = createLazyLoader(context)

    const bareOf = (cls: string) => splitImportant(extractUtility(cls)).bare

    function check(locations: ClassLocation[]) {
      const watchedVariants = getWatchedVariants()
      const ds = softGetDS(getDS)
      const cache = ds ? ds.cache : null

      for (const loc of locations) {
        // Composition guard (issue #117): this relational check is only sound on
        // a final, self-contained class list — not on merge/component fragments.
        if (!isFinalClassList(loc)) continue

        const classes = splitClasses(loc.value)

        // Classes whose value the user wrote have no precomputed declarations;
        // resolving them keeps the property grouping from silently degrading to
        // prefix-only for `dark:bg-[#111]`. Allocates nothing when every class is
        // precomputed — this runs on every AST node.
        if (cache && ds) {
          let unresolved: string[] | null = null
          for (const cls of classes) {
            const bare = bareOf(cls)
            if (cache.getCssProperties(bare).length > 0 || !isUserValued(bare)) continue
            if (!unresolved) unresolved = []
            unresolved.push(bare)
          }
          if (unresolved) {
            try {
              resolveDeclarationsSync(ds.entryPoint, cache, unresolved)
            } catch (error) {
              // DS-OPTIONAL: this rule may never emit `designSystemUnavailable`,
              // so a dead worker degrades to prefix-only grouping for the classes
              // it could not resolve. Logged rather than swallowed, because the
              // difference is invisible from the diagnostics alone.
              if (!isFatalError(error)) throw error
              debugLog(`declaration service unavailable, grouping by prefix only: ${String(error)}`)
            }
          }
        }

        // A base is a class with no watched variant. Two ways to be the base for
        // a variant class: the same utility prefix (`bg-white` for
        // `dark:bg-black`), or the same declared CSS property (`underline` for
        // `dark:no-underline`, which share no prefix at all). The union is what
        // makes this strictly less trigger-happy than the prefix check alone.
        const basePrefixes = new Set<string>()
        const baseProperties = new Set<string>()
        const variantClasses: Array<{
          cls: string
          variant: string
          prefix: string
          properties: readonly string[]
          /** The colour property it sets (read from its CSS), or undefined without one. */
          colorProperty: string | undefined
        }> = []

        for (const cls of classes) {
          const variants = extractVariants(cls)
          const utility = extractUtility(cls)
          const prefix = getUtilityPrefix(utility)
          const bare = bareOf(cls)
          const properties = cache ? cache.getCssProperties(bare) : []

          const variant = variants.find((v) => watchedVariants.has(v))

          if (variant !== undefined) {
            // Only colour needs a base. With the class's CSS at hand, that is
            // read from it; without (no design system, or a class it can't
            // resolve), only the families that are never colour drop out.
            const decls = cache ? cache.getCssDeclarations(bare) : []
            let colorProperty: string | undefined
            if (decls.length > 0) {
              const found = colorPropertyOf(decls)
              if (found === null) continue
              colorProperty = found
            } else if (isNeverColorStatic(bare)) {
              continue
            }
            variantClasses.push({ cls, variant, prefix, properties, colorProperty })
          } else {
            basePrefixes.add(prefix)
            for (const property of properties) baseProperties.add(property)
          }
        }

        for (const { cls, variant, prefix, properties, colorProperty } of variantClasses) {
          if (basePrefixes.has(prefix)) continue
          if (properties.some((property) => baseProperties.has(property))) continue
          context.report(
            colorProperty
              ? {
                  node: loc.node,
                  messageId: 'missingBaseProperty',
                  data: { className: cls, variant, property: colorProperty },
                }
              : {
                  node: loc.node,
                  messageId: 'missingBase',
                  data: { className: cls, variant, prefix },
                },
          )
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
