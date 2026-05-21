import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'
import {
  PHYSICAL_TO_LOGICAL_MAPPINGS,
  type Direction,
  type LogicalMapping,
} from './enforce-logical'
import { safeOptions } from '../types'

interface Options {
  allowlist?: string[]
  direction?: Direction
}

// Invert the mapping: logical → physical, preserving axis tags.
const LOGICAL_TO_PHYSICAL_MAPPINGS: LogicalMapping[] = PHYSICAL_TO_LOGICAL_MAPPINGS.map((m) => ({
  physical: m.logical,
  logical: m.physical,
  axis: m.axis,
}))

function compileAllowlist(patterns?: string[]): RegExp[] {
  if (!patterns || patterns.length === 0) return []
  const compiled: RegExp[] = []
  for (const p of patterns) {
    try {
      compiled.push(new RegExp(p))
    } catch {
      // Skip invalid regex sources rather than blowing up the lint.
    }
  }
  return compiled
}

function isAllowlisted(cls: string, allowlist: readonly RegExp[]): boolean {
  return allowlist.some((re) => re.test(cls))
}

export const enforcePhysical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce physical Tailwind CSS properties instead of logical ones for consistency in LTR-only projects',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowlist: { type: 'array', items: { type: 'string' } },
          direction: { type: 'string', enum: ['inline', 'block', 'both'] },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    defaultOptions: [{ allowlist: [], direction: 'both' }],
    messages: {
      usePhysical:
        '"{{className}}" uses a logical property. Use "{{replacement}}" for consistency.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    let _state: { allowlist: RegExp[]; direction: Direction } | null = null
    function getState() {
      if (!_state) {
        const opts = safeOptions<Options>(context)
        _state = {
          allowlist: compileAllowlist(opts?.allowlist),
          direction: opts?.direction ?? 'both',
        }
      }
      return _state
    }

    function convertClass(cls: string): string | null {
      const { allowlist, direction } = getState()
      if (isAllowlisted(cls, allowlist)) return null

      const { utility, variant } = splitUtilityAndVariant(cls)

      const hasImportantPrefix = utility.startsWith('!')
      const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
      const bareUtility = hasImportantPrefix
        ? utility.slice(1)
        : hasImportantSuffix
          ? utility.slice(0, -1)
          : utility

      // Note: `physical` field on a LOGICAL_TO_PHYSICAL_MAPPINGS entry holds the
      // logical prefix (the input), and `logical` holds the physical target.
      // We swap names on inversion but keep the property layout to minimize churn.
      for (const { physical: logicalPrefix, logical: physicalTarget, axis } of LOGICAL_TO_PHYSICAL_MAPPINGS) {
        if (direction !== 'both' && direction !== axis) continue
        if (bareUtility === logicalPrefix || bareUtility.startsWith(`${logicalPrefix}-`)) {
          const suffix = bareUtility.slice(logicalPrefix.length)
          return `${variant}${hasImportantPrefix ? '!' : ''}${physicalTarget}${suffix}${hasImportantSuffix ? '!' : ''}`
        }
      }
      return null
    }

    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        const split = splitClassesWithSeparators(loc.value)
        const classes = split.classes
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          const converted = convertClass(cls)
          if (converted) offending.push({ cls, replacement: converted })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = rebuildClassString(
          split,
          classes.map((cls) => replacements.get(cls) ?? cls),
        )

        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId: 'usePhysical',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'usePhysical',
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
    }

    return createExtractorVisitors(context, check)
  },
})
