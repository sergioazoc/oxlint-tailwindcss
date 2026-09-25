import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors, isFinalClassList, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import {
  type VariantFacts,
  changesTarget,
  extractUtility,
  extractVariants,
  splitImportant,
} from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { softGetDS } from '../utils/fatal'

// Static fallback for the CSS property a utility declares, used when no entry
// point is configured (this rule is DS-OPTIONAL). Only the closed, stable groups
// where "which property does this touch?" is unambiguous without the design
// system: `display` and `visibility`. With an entry point, `getCssProperties`
// supersedes this and extends coverage to every property. Composite utilities
// that touch more than their nominal property (`sr-only`/`not-sr-only`) are
// deliberately omitted — the static claim has to be exact.
const STATIC_PROP_GROUPS = new Map<string, string>([
  ['block', 'display'],
  ['inline-block', 'display'],
  ['inline', 'display'],
  ['flex', 'display'],
  ['inline-flex', 'display'],
  ['grid', 'display'],
  ['inline-grid', 'display'],
  ['table', 'display'],
  ['inline-table', 'display'],
  ['table-caption', 'display'],
  ['table-cell', 'display'],
  ['table-column', 'display'],
  ['table-column-group', 'display'],
  ['table-footer-group', 'display'],
  ['table-header-group', 'display'],
  ['table-row-group', 'display'],
  ['table-row', 'display'],
  ['flow-root', 'display'],
  ['contents', 'display'],
  ['list-item', 'display'],
  ['hidden', 'display'],
  ['visible', 'visibility'],
  ['invisible', 'visibility'],
  ['collapse', 'visibility'],
])

export const noContradictingVariants = defineRule({
  meta: {
    type: 'suggestion',
    docs: ruleDocs('no-contradicting-variants', {
      description:
        'Disallow variant-prefixed classes that are redundant because the base class already applies unconditionally',
      category: 'correctness',
      recommended: 'warn',
      designSystem: 'optional',
    }),
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
      redundantVariant:
        '"{{variantClass}}" is redundant because "{{baseClass}}" already applies unconditionally.',
    },
  },
  createOnce(context) {
    // DS-OPTIONAL, like consistent-variant-order. With an entry point the rule
    // asks the design system what each variant's selector does, which is the only
    // way to know that a project's `@custom-variant thumb (&::-webkit-slider-thumb)`
    // targets another box. Without one it falls back to the static predicates, so
    // configuring nothing keeps working exactly as before — this rule never
    // emitted `designSystemUnavailable` and must not start.
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      const ds = softGetDS(getDS)
      const cache = ds ? ds.cache : null
      const factsFor = (v: string): VariantFacts | undefined =>
        ds ? ds.cache.getVariantFacts(v) : undefined

      // The CSS property names a bare utility declares on its own box. Prefers
      // the design system (covers every property + project-defined utilities);
      // falls back to the static display/visibility groups so the rule keeps
      // working without an entry point.
      const propsOf = (bare: string): readonly string[] => {
        if (cache) {
          const props = cache.getCssProperties(bare)
          if (props.length > 0) return props
        }
        const group = STATIC_PROP_GROUPS.get(bare)
        return group ? [group] : []
      }

      for (const loc of locations) {
        // Composition guard (issue #117): this relational check is only sound on
        // a final, self-contained class list — not on merge/component fragments.
        if (!isFinalClassList(loc)) continue

        const classes = splitClasses(loc.value)

        // Collect base classes (no variants) — store their full utility string
        const baseUtilities = new Set<string>()
        for (const cls of classes) {
          const variants = extractVariants(cls)
          if (variants.length === 0) {
            baseUtilities.add(cls)
          }
        }

        // Check variant classes against base classes
        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i]
          const variants = extractVariants(cls)
          if (variants.length === 0) continue

          // Skip if any variant changes the selector target
          if (variants.some((v) => changesTarget(v, factsFor(v)))) continue

          const utility = extractUtility(cls)
          // Only report if the exact same utility exists as a base class
          if (!baseUtilities.has(utility)) continue

          // Responsive-reset guard (issue #150): the base only "applies
          // unconditionally" if nothing else overrides its property. When a
          // sibling with a DIFFERENT utility writes an overlapping CSS property,
          // this variant is re-establishing it (`block md:hidden lg:block`), so
          // it's load-bearing, not redundant. Strictly report-reducing.
          const bare = splitImportant(utility).bare
          const candidateProps = propsOf(bare)
          if (candidateProps.length > 0) {
            const overridden = classes.some((other, j) => {
              if (j === i) return false
              // A sibling on another box (pseudo-element/child selector) can't
              // override this element's property.
              const otherVariants = extractVariants(other)
              if (otherVariants.some((v) => changesTarget(v, factsFor(v)))) return false
              const otherBare = splitImportant(extractUtility(other)).bare
              // Same utility (the base itself, or another variant of it) is not
              // an override — it computes to the same value.
              if (otherBare === bare) return false
              const otherProps = propsOf(otherBare)
              return otherProps.some((p) => candidateProps.includes(p))
            })
            if (overridden) continue
          }

          context.report({
            node: loc.node,
            messageId: 'redundantVariant',
            data: { variantClass: cls, baseClass: utility },
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
