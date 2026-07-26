import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { hasArbitraryValue, getArbitraryValue } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { containsColorLiteral } from '../utils/color-literal'

interface Options {
  allow?: string[]
}

const VAR_REF_RE = /var\(\s*--[\w-]+/i

/**
 * Does the arbitrary value the user wrote carry a hardcoded colour?
 *
 * This used to be a set of `^`-anchored regexes plus a list of "colour-bearing
 * utility prefixes", and both halves leaked. The anchoring meant only a value
 * that IS a colour matched, so `shadow-[0_1px_2px_#000]` passed. The prefix list
 * had `ring` but not `inset-ring`, `shadow` but not `inset-shadow`, and no way to
 * spell an arbitrary property at all (`[color:#f00]`, `[--brand:#f00]`).
 *
 * Neither is needed: the value carries the colour or it doesn't, whatever utility
 * it is attached to. `containsColorLiteral` skips quoted strings and `url()`
 * contents, which is what keeps `content-['#fff']` and `fill-[url(#gradient)]` out.
 */
function isHardcodedColor(value: string): boolean {
  const trimmed = value.trim()
  // A value that reaches for a CSS variable is design-system indirection, not a
  // literal. The check stays shallow on purpose (documented behaviour): one
  // `var()` anywhere exempts the whole value.
  if (VAR_REF_RE.test(trimmed)) return false
  return containsColorLiteral(trimmed)
}

export const noHardcodedColors = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hardcoded color values in Tailwind CSS classes',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allow: [] }],
    messages: {
      noHardcoded:
        '"{{className}}" uses a hardcoded color value. Use a design token from your theme instead.',
    },
  },
  createOnce(context) {
    const getAllowlist = createLazyOptions<Options, Set<string>>(
      context,
      (o) => new Set(o?.allow ?? []),
    )

    function check(locations: ClassLocation[]) {
      const allowlist = getAllowlist()
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        for (const cls of classes) {
          if (allowlist.has(cls)) continue
          if (!hasArbitraryValue(cls)) continue

          const value = getArbitraryValue(cls)
          if (!value) continue

          if (isHardcodedColor(value)) {
            context.report({
              node: loc.node,
              messageId: 'noHardcoded',
              data: { className: cls },
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
