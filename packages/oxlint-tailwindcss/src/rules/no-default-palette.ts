import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { splitImportant, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyOptions } from '../utils/context'
import { createLazyLoader } from '../design-system/loader'
import type { DesignSystemCache } from '../design-system/cache'
import { resolveDeclarationsSync } from '../design-system/declaration-service'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'
import { SETTINGS_MESSAGE } from '../utils/settings-check'
import { themeColorList } from '../utils/theme-colors'

interface Options {
  entryPoint?: string
  allow?: string[]
}

const COLOR_VAR = '--color-'

/** `white`, `gray-*` → a test on palette color names. */
function compileAllow(allow: string[]): (color: string) => boolean {
  const exact = new Set(allow.filter((a) => !a.endsWith('*')))
  const prefixes = allow.filter((a) => a.endsWith('*')).map((a) => a.slice(0, -1))
  return (color) => exact.has(color) || prefixes.some((p) => color.startsWith(p))
}

/** The palette color a class reads (`red-500`), or `null`. */
function paletteColorOf(cls: string, cache: DesignSystemCache, entryPoint: string): string | null {
  const { bare } = splitImportant(splitUtilityAndVariant(cls).utility)
  // The opacity modifier doesn't change which color is read: `bg-red-500/50`
  // reads what `bg-red-500` does, and only the latter is precomputed.
  const base = bare.replace(/\/[^/\]]+$/, '')
  let decls = cache.getCssDeclarations(base)
  if (decls.length === 0 && base.includes(`var(${COLOR_VAR}`)) {
    resolveDeclarationsSync(entryPoint, cache, [base])
    decls = cache.getCssDeclarations(base)
  }
  for (const decl of decls) {
    for (const read of decl.readsVars) {
      if (cache.isPaletteVar(read)) return read.slice(COLOR_VAR.length)
    }
  }
  return null
}

export const noDefaultPalette = defineRule({
  meta: {
    type: 'suggestion',
    docs: ruleDocs('no-default-palette', {
      description:
        "Disallow colors from Tailwind CSS's default palette in a project that defines its own theme colors",
      category: 'design-system',
      recommended: false,
      designSystem: 'required',
    }),
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          allow: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allow: [] }],
    messages: {
      ...SETTINGS_MESSAGE,
      defaultPalette:
        '"{{className}}" uses {{color}} from Tailwind\'s default palette, not one of your theme colors: {{colors}}.',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)
    const getAllow = createLazyOptions<Options, (color: string) => boolean>(context, (o) =>
      compileAllow(o?.allow ?? []),
    )

    function check(locations: ClassLocation[]) {
      if (locations.length === 0) return
      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const { cache, entryPoint } = ds
      // Without colors of its own, the palette IS the project's design system.
      const colors = themeColorList(cache)
      if (colors === '') return
      const allow = getAllow()

      for (const loc of locations) {
        for (const cls of splitClassesWithSeparators(loc.value).classes) {
          const color = paletteColorOf(cls, cache, entryPoint)
          if (color === null || allow(color)) continue
          context.report({
            node: loc.node,
            messageId: 'defaultPalette',
            data: { className: cls, color, colors },
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
