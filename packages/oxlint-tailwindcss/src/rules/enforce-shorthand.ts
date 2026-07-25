import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import {
  type ImportantPosition,
  reattachImportant,
  splitImportant,
  splitUtilityAndVariant,
} from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { softGetDS } from '../utils/fatal'
import type { DesignSystemCache } from '../design-system/cache'

/**
 * One collapsible group: every `parts` utility carrying the SAME value can be
 * written as `to` with that value.
 *
 * These are utility PREFIXES, not classes — the value is appended by the rule.
 * The table is a static fact about Tailwind's utility layout, and
 * `tests/integration/shorthand-families.test.ts` proves each entry against the
 * real design system: the properties `to` writes must be exactly the union of
 * the properties the parts write, expanded through the CSS shorthands. Adding an
 * entry without that test passing is how you ship a fix that changes the CSS.
 */
export interface ShorthandFamily {
  parts: string[]
  to: string
  /**
   * Set when the parts read DIFFERENT theme namespaces, so the same token can
   * mean different things per part. `w-*` reads `--width-*`/`--container-*`,
   * `h-*` reads `--height-*`, `size-*` reads `--size-*`: with
   * `@theme { --width-brand: 10rem; --height-brand: 20rem }`, merging
   * `w-brand h-brand` into `size-brand` either changes both axes or — when
   * `--size-brand` doesn't exist — deletes the width and the height outright.
   *
   * Every other family in this table draws from a single namespace
   * (`--spacing-*`, `--margin-*`, `--radius-*`, `--inset-*`, `--color-*`), which
   * is why they are safe to collapse without asking the design system.
   */
  perAxisNamespaces?: true
}

/**
 * The `m`/`p` shape, shared by `margin`, `padding`, `scroll-margin` and
 * `scroll-padding`: four sides, each axis, and the logical inline pair (`ms`+`me`
 * IS `margin-inline`, so that one is property-identical rather than merely
 * equivalent).
 */
function boxFamilies(p: string): ShorthandFamily[] {
  return [
    { parts: [`${p}t`, `${p}r`, `${p}b`, `${p}l`], to: p },
    { parts: [`${p}t`, `${p}b`], to: `${p}y` },
    { parts: [`${p}l`, `${p}r`], to: `${p}x` },
    { parts: [`${p}s`, `${p}e`], to: `${p}x` },
    { parts: [`${p}x`, `${p}y`], to: p },
  ]
}

export const SHORTHAND_FAMILIES: ShorthandFamily[] = [
  ...boxFamilies('m'),
  ...boxFamilies('p'),
  ...boxFamilies('scroll-m'),
  ...boxFamilies('scroll-p'),

  { parts: ['w', 'h'], to: 'size', perAxisNamespaces: true },

  // Corners. `rounded-s` is the INLINE-START side — `border-start-start-radius`
  // plus `border-end-start-radius` — which is `ss` + `es`, not `ss` + `se`.
  {
    parts: ['rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl'],
    to: 'rounded',
  },
  { parts: ['rounded-ss', 'rounded-se', 'rounded-ee', 'rounded-es'], to: 'rounded' },
  { parts: ['rounded-tl', 'rounded-tr'], to: 'rounded-t' },
  { parts: ['rounded-bl', 'rounded-br'], to: 'rounded-b' },
  { parts: ['rounded-tl', 'rounded-bl'], to: 'rounded-l' },
  { parts: ['rounded-tr', 'rounded-br'], to: 'rounded-r' },
  { parts: ['rounded-ss', 'rounded-es'], to: 'rounded-s' },
  { parts: ['rounded-se', 'rounded-ee'], to: 'rounded-e' },
  { parts: ['rounded-t', 'rounded-b'], to: 'rounded' },
  { parts: ['rounded-l', 'rounded-r'], to: 'rounded' },
  { parts: ['rounded-s', 'rounded-e'], to: 'rounded' },

  // Widths and colours both, since the check compares emitted values rather
  // than the shape of the token: `border-t-2 border-r-2 …` and
  // `border-t-red-500 border-r-red-500 …` collapse through the same entry.
  { parts: ['border-t', 'border-r', 'border-b', 'border-l'], to: 'border' },
  { parts: ['border-t', 'border-b'], to: 'border-y' },
  { parts: ['border-l', 'border-r'], to: 'border-x' },
  { parts: ['border-s', 'border-e'], to: 'border-x' },
  { parts: ['border-x', 'border-y'], to: 'border' },

  { parts: ['top', 'right', 'bottom', 'left'], to: 'inset' },
  { parts: ['top', 'bottom'], to: 'inset-y' },
  { parts: ['left', 'right'], to: 'inset-x' },
  { parts: ['start', 'end'], to: 'inset-x' },
  { parts: ['inset-x', 'inset-y'], to: 'inset' },

  { parts: ['gap-x', 'gap-y'], to: 'gap' },
  { parts: ['overflow-x', 'overflow-y'], to: 'overflow' },
  { parts: ['overscroll-x', 'overscroll-y'], to: 'overscroll' },
  { parts: ['border-spacing-x', 'border-spacing-y'], to: 'border-spacing' },
  { parts: ['translate-x', 'translate-y'], to: 'translate' },
  // `scale-x`+`scale-y` is deliberately absent: `scale-110` also writes
  // `--tw-scale-z`, which `scale-3d` reads, so the merge changes how
  // `scale-x-110 scale-y-110 scale-3d` renders. Locked down by the matrix test.
]

/**
 * Largest merges first, so four sides collapse to `m-2` instead of also
 * reporting the `my-2`/`mx-2` halves — three diagnostics for one problem, which
 * is what this rule used to emit. `sort` is stable, so same-size families keep
 * their declaration order and the choice stays deterministic.
 */
const FAMILIES_BY_SIZE = [...SHORTHAND_FAMILIES].sort((a, b) => b.parts.length - a.parts.length)

/**
 * `^<part>-<value>$`, longest prefix first so `rounded-tl-lg` is read as
 * `rounded-tl` + `lg` and never as `rounded-t` + `l-lg`.
 */
const VALUE_RE = (() => {
  const prefixes = [...new Set(SHORTHAND_FAMILIES.flatMap((f) => f.parts))].sort(
    (a, b) => b.length - a.length,
  )
  return new RegExp(`^(${prefixes.join('|')})-(.+)$`)
})()

/** A plain number or fraction: always the shared numeric/`--spacing` scale. */
const NUMERIC_VALUE_RE = /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/

/**
 * Core keywords whose per-axis forms are known to agree, for when no design
 * system is available to check. Deliberately excludes `screen` (`w-screen` is
 * `100vw`, `h-screen` is `100vh`) and every named theme token, which is the case
 * that can only be settled by looking at the emitted CSS.
 */
const AXIS_SAFE_KEYWORDS = new Set([
  'full',
  'auto',
  'min',
  'max',
  'fit',
  'px',
  'dvw',
  'dvh',
  'lvw',
  'lvh',
  'svw',
  'svh',
])

/** The value is a literal the user wrote, injected verbatim into every part. */
function isWrittenValue(value: string): boolean {
  return value.startsWith('[') || value.startsWith('(')
}

/**
 * Values the class declares on its own box, unconditionally. `null` when the
 * class produces nothing — which for a named token means it does not exist.
 */
function declaredValues(cache: DesignSystemCache, cls: string): Set<string> | null {
  const values = new Set<string>()
  for (const decl of cache.getCssDeclarations(cls)) {
    if (decl.conditional) continue
    values.add(decl.value)
  }
  return values.size > 0 ? values : null
}

function sameValues(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

/**
 * Would collapsing this family at this value keep the CSS identical?
 *
 * With a design system this is answered from the emitted declarations. Without
 * one it falls back to what is safe by construction, which is everything except
 * a named token on the one family whose parts read different namespaces.
 */
function mergeIsSafe(
  family: ShorthandFamily,
  value: string,
  cache: DesignSystemCache | null,
): boolean {
  const structurallySafe = NUMERIC_VALUE_RE.test(value) || isWrittenValue(value)

  if (!cache) {
    if (!family.perAxisNamespaces) return true
    return structurallySafe || AXIS_SAFE_KEYWORDS.has(value)
  }

  if (!cache.isValid(`${family.to}-${value}`)) return false
  if (structurallySafe) return true

  const expected = declaredValues(cache, `${family.parts[0]}-${value}`)
  if (!expected) return false
  for (let i = 1; i < family.parts.length; i++) {
    const actual = declaredValues(cache, `${family.parts[i]}-${value}`)
    if (!actual || !sameValues(expected, actual)) return false
  }
  const replacement = declaredValues(cache, `${family.to}-${value}`)
  return replacement !== null && sameValues(expected, replacement)
}

/** Classes sharing a variant chain, `!` position and value, keyed by part prefix. */
interface CandidateGroup {
  variant: string
  position: ImportantPosition
  value: string
  byPart: Map<string, string>
}

export const enforceShorthand = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce shorthand Tailwind CSS classes when all axes have the same value',
    },
    fixable: 'code',
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
      shorthand: '{{parts}} can be simplified to "{{replacement}}".',
    },
  },
  createOnce(context) {
    // DS-OPTIONAL (see `softGetDS`): with an entry point the rule verifies each
    // merge against the CSS Tailwind emits; without one it keeps the merges that
    // are safe whatever the theme says. It must never report
    // `designSystemUnavailable` — this rule worked with no configuration first.
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      const ds = softGetDS(getDS)
      const cache = ds ? ds.cache : null

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        if (classes.length < 2) continue

        // Bucket by (variant chain, `!` position, value): parts only collapse
        // when all three agree, so `hover:mt-2 mb-2` and `!mt-2 mr-2` never do.
        const groups = new Map<string, CandidateGroup>()
        for (const cls of classes) {
          const { utility, variant } = splitUtilityAndVariant(cls)
          const { bare, position } = splitImportant(utility)
          const match = VALUE_RE.exec(bare)
          if (!match) continue
          const [, part, value] = match
          const key = `${variant}\0${position ?? ''}\0${value}`
          let group = groups.get(key)
          if (!group) {
            group = { variant, position, value, byPart: new Map() }
            groups.set(key, group)
          }
          group.byPart.set(part, cls)
        }

        for (const group of groups.values()) {
          if (group.byPart.size < 2) continue
          const consumed = new Set<string>()

          for (const family of FAMILIES_BY_SIZE) {
            if (family.parts.some((part) => !group.byPart.has(part) || consumed.has(part))) continue
            if (!mergeIsSafe(family, group.value, cache)) continue

            const matched = family.parts.map((part) => group.byPart.get(part)!)
            const replacement =
              group.variant + reattachImportant(`${family.to}-${group.value}`, group.position)
            const remaining = classes.filter((cls) => !matched.includes(cls))
            remaining.push(replacement)
            for (const part of family.parts) consumed.add(part)

            context.report({
              node: loc.node,
              messageId: 'shorthand',
              data: {
                parts: matched.map((p) => `"${p}"`).join(', '),
                replacement,
              },
              fix(fixer) {
                return fixer.replaceTextRange(
                  loc.range,
                  preserveSpaces(loc, rebuildClassString(split, remaining)),
                )
              },
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
