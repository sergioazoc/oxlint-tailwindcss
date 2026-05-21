import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { rebuildClassString, splitClassesWithSeparators } from '../utils/class-splitter'
import { splitUtilityAndVariant } from '../utils/class-parser'
import { safeOptions } from '../types'

export type Direction = 'inline' | 'block' | 'both'

interface Options {
  allowlist?: string[]
  direction?: Direction
}

/**
 * Each entry maps a physical Tailwind utility prefix to its logical equivalent
 * and tags the writing-mode axis it affects. v1 added the `axis` field so the
 * rule's `direction` option can filter by inline-only (LTR horizontal)
 * vs block-only (vertical) — today every entry is `inline` because Tailwind
 * has no block-axis logical-vs-physical pair, but the shape is in place.
 */
export interface LogicalMapping {
  physical: string
  logical: string
  axis: 'inline' | 'block'
}

export const PHYSICAL_TO_LOGICAL_MAPPINGS: LogicalMapping[] = [
  { physical: 'ml', logical: 'ms', axis: 'inline' },
  { physical: 'mr', logical: 'me', axis: 'inline' },
  { physical: 'pl', logical: 'ps', axis: 'inline' },
  { physical: 'pr', logical: 'pe', axis: 'inline' },
  { physical: 'left', logical: 'start', axis: 'inline' },
  { physical: 'right', logical: 'end', axis: 'inline' },
  { physical: 'border-l', logical: 'border-s', axis: 'inline' },
  { physical: 'border-r', logical: 'border-e', axis: 'inline' },
  { physical: 'rounded-l', logical: 'rounded-s', axis: 'inline' },
  { physical: 'rounded-r', logical: 'rounded-e', axis: 'inline' },
  { physical: 'rounded-tl', logical: 'rounded-ss', axis: 'inline' },
  { physical: 'rounded-tr', logical: 'rounded-se', axis: 'inline' },
  { physical: 'rounded-bl', logical: 'rounded-es', axis: 'inline' },
  { physical: 'rounded-br', logical: 'rounded-ee', axis: 'inline' },
  { physical: 'scroll-ml', logical: 'scroll-ms', axis: 'inline' },
  { physical: 'scroll-mr', logical: 'scroll-me', axis: 'inline' },
  { physical: 'scroll-pl', logical: 'scroll-ps', axis: 'inline' },
  { physical: 'scroll-pr', logical: 'scroll-pe', axis: 'inline' },
]

/** Kept for backward compatibility with existing imports (e.g. enforce-physical). */
export const PHYSICAL_TO_LOGICAL: Record<string, string> = Object.fromEntries(
  PHYSICAL_TO_LOGICAL_MAPPINGS.map((m) => [m.physical, m.logical]),
)

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

export const enforceLogical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce logical (RTL-friendly) Tailwind CSS properties instead of physical ones',
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
      useLogical:
        '"{{className}}" uses a physical property. Use "{{replacement}}" for LTR/RTL support.',
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

      for (const { physical, logical, axis } of PHYSICAL_TO_LOGICAL_MAPPINGS) {
        if (direction !== 'both' && direction !== axis) continue
        if (bareUtility === physical || bareUtility.startsWith(`${physical}-`)) {
          const suffix = bareUtility.slice(physical.length)
          return `${variant}${hasImportantPrefix ? '!' : ''}${logical}${suffix}${hasImportantSuffix ? '!' : ''}`
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
              messageId: 'useLogical',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'useLogical',
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
