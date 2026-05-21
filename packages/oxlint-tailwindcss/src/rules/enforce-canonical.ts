import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { utilityHasDynamicValue } from '../utils/class-parser'
import { createLazyLoader, rootFontSizeFromSettings } from '../design-system/loader'
import { canonicalizeClassesSync } from '../design-system/canonicalize-service'
import { safeSettings } from '../types'
import { safeGetDS } from '../utils/fatal'

/**
 * Preserve the user's ! position after canonicalization.
 * canonicalizeCandidates always normalizes ! to suffix, but
 * enforce-consistent-important-position handles that separately.
 */
function preserveImportantPosition(original: string, canonicalized: string): string {
  const origHasPrefix = original.startsWith('!') || /^[a-z0-9[\]*@-]*:!/.test(original)
  const origHasSuffix = original.endsWith('!') && !origHasPrefix

  if (!origHasPrefix && !origHasSuffix) {
    // Original has no ! — strip any ! the canonicalizer added
    return canonicalized.replace(/!/g, '')
  }

  // Strip ! from canonicalized, then re-add in original position
  const bare = canonicalized.replace(/!/g, '')
  if (origHasPrefix) {
    // Re-add ! after variant prefix (e.g. "hover:!p-0.5")
    const variantPrefix = bare.slice(0, bare.length - bare.replace(/^[a-z0-9[\]*@-]*:/g, '').length)
    return variantPrefix + '!' + bare.slice(variantPrefix.length)
  }
  // Suffix
  return bare + '!'
}

export const enforceCanonical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce canonical Tailwind CSS class names using canonicalizeCandidates()',
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
    hasSuggestions: true,
    defaultOptions: [{}],
    messages: {
      nonCanonical: '"{{className}}" can be written as "{{canonical}}". Use the canonical form.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
      designSystemUnavailable: '{{message}}',
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    let _rem: number | null = null
    function getRem(): number {
      if (_rem === null) {
        const settings = safeSettings(context)
        _rem = rootFontSizeFromSettings(settings)
      }
      return _rem
    }

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache, entryPoint } = ds

      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes

        // Split the location into two buckets:
        //   - named classes → precomputed `canonicalMap` is ground truth,
        //     resolved via `cache.canonicalize` (sync, sub-microsecond).
        //   - classes with arbitrary/CSS-var values in the utility
        //     (`p-[2px]`, `bg-(--c)`) → need the async DS to canonicalize,
        //     routed through the worker.
        //
        // Keeping named classes out of the worker call avoids the round-trip
        // entirely for the majority of locations, and shrinks the payload for
        // the rest. The local cache preserves `!` position, so no
        // preserveImportantPosition step is needed on that path.
        const canonicals: string[] = Array.from({ length: classes.length })
        const arbitraryIdx: number[] = []
        const arbitrary: string[] = []

        for (let i = 0; i < classes.length; i++) {
          if (utilityHasDynamicValue(classes[i])) {
            arbitraryIdx.push(i)
            arbitrary.push(classes[i])
          } else {
            canonicals[i] = cache.canonicalize(classes[i])
          }
        }

        if (arbitrary.length > 0) {
          const rem = getRem()
          const dynamic = canonicalizeClassesSync(entryPoint, arbitrary, rem)
          if (dynamic) {
            for (let k = 0; k < arbitrary.length; k++) {
              canonicals[arbitraryIdx[k]] = preserveImportantPosition(arbitrary[k], dynamic[k])
            }
          } else {
            for (let k = 0; k < arbitrary.length; k++) {
              canonicals[arbitraryIdx[k]] = cache.canonicalize(arbitrary[k])
            }
          }
        }

        let firstNonCanonical = true

        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i]
          const canonical = canonicals[i]
          if (canonical === cls) continue

          if (firstNonCanonical) {
            firstNonCanonical = false
            const fixedValue = rebuildClassString(split, canonicals)
            context.report({
              node: loc.node,
              messageId: 'nonCanonical',
              data: { className: cls, canonical },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            const fixedValue = rebuildClassString(split, canonicals)
            context.report({
              node: loc.node,
              messageId: 'nonCanonical',
              data: { className: cls, canonical },
              suggest: [
                {
                  messageId: 'suggestReplace',
                  data: { className: cls, replacement: canonical },
                  fix(fixer) {
                    return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
                  },
                },
              ],
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
