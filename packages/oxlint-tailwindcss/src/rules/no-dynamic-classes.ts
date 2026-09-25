import { defineRule } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { createLazyLoader } from '../design-system/loader'
import type { DesignSystemCache } from '../design-system/cache'
import { softGetDS } from '../utils/fatal'
import { safeSourceCode } from '../utils/context'
import { SETTINGS_MESSAGE } from '../utils/settings-check'

// The first segment of every Tailwind utility that has one (`bg` for
// `bg-red-500`, `grid` for `grid-cols-2`), for when no design system is
// configured. Generated from Tailwind 4.3's class list; a test in
// tests/rules/no-dynamic-classes.test.ts fails when it drifts.
export const STATIC_UTILITY_ROOTS: readonly string[] = [
  '@container',
  'accent',
  'align',
  'animate',
  'appearance',
  'aspect',
  'auto',
  'backdrop',
  'backface',
  'basis',
  'bg',
  'block',
  'blur',
  'border',
  'bottom',
  'box',
  'break',
  'brightness',
  'caption',
  'caret',
  'clear',
  'col',
  'columns',
  'contain',
  'content',
  'contrast',
  'cursor',
  'decoration',
  'delay',
  'diagonal',
  'divide',
  'drop',
  'duration',
  'ease',
  'end',
  'field',
  'fill',
  'filter',
  'flex',
  'float',
  'flow',
  'font',
  'forced',
  'from',
  'gap',
  'grayscale',
  'grid',
  'grow',
  'h',
  'hue',
  'hyphens',
  'indent',
  'inline',
  'inset',
  'invert',
  'isolation',
  'items',
  'justify',
  'leading',
  'left',
  'line',
  'lining',
  'list',
  'm',
  'mask',
  'max',
  'mb',
  'mbe',
  'mbs',
  'me',
  'min',
  'mix',
  'ml',
  'mr',
  'ms',
  'mt',
  'mx',
  'my',
  'no',
  'normal',
  'not',
  'object',
  'oldstyle',
  'opacity',
  'order',
  'origin',
  'outline',
  'overflow',
  'overscroll',
  'p',
  'pb',
  'pbe',
  'pbs',
  'pe',
  'perspective',
  'pl',
  'place',
  'placeholder',
  'pointer',
  'pr',
  'proportional',
  'ps',
  'pt',
  'px',
  'py',
  'resize',
  'right',
  'ring',
  'rotate',
  'rounded',
  'row',
  'saturate',
  'scale',
  'scheme',
  'scroll',
  'scrollbar',
  'select',
  'self',
  'sepia',
  'shadow',
  'shrink',
  'size',
  'skew',
  'slashed',
  'snap',
  'space',
  'sr',
  'stacked',
  'start',
  'stroke',
  'subpixel',
  'tab',
  'table',
  'tabular',
  'text',
  'to',
  'top',
  'touch',
  'tracking',
  'transform',
  'transition',
  'translate',
  'underline',
  'via',
  'w',
  'whitespace',
  'will',
  'wrap',
  'z',
  'zoom',
]

// Tailwind 4.3's named variants, same provenance and test as above.
export const STATIC_VARIANTS: readonly string[] = [
  '*',
  '**',
  '2xl',
  'active',
  'after',
  'any-pointer-coarse',
  'any-pointer-fine',
  'any-pointer-none',
  'autofill',
  'backdrop',
  'before',
  'checked',
  'contrast-less',
  'contrast-more',
  'dark',
  'default',
  'details-content',
  'disabled',
  'empty',
  'enabled',
  'even',
  'file',
  'first',
  'first-letter',
  'first-line',
  'first-of-type',
  'focus',
  'focus-visible',
  'focus-within',
  'forced-colors',
  'hover',
  'in-range',
  'indeterminate',
  'inert',
  'invalid',
  'inverted-colors',
  'landscape',
  'last',
  'last-of-type',
  'lg',
  'ltr',
  'marker',
  'md',
  'motion-reduce',
  'motion-safe',
  'noscript',
  'odd',
  'only',
  'only-of-type',
  'open',
  'optional',
  'out-of-range',
  'placeholder',
  'placeholder-shown',
  'pointer-coarse',
  'pointer-fine',
  'pointer-none',
  'portrait',
  'print',
  'read-only',
  'required',
  'rtl',
  'selection',
  'sm',
  'starting',
  'target',
  'user-invalid',
  'user-valid',
  'valid',
  'visited',
  'xl',
]

// Functional variants take a value (`group-hover`, `data-[x]`, `aria-checked`),
// so their roots never appear in the list above.
const FUNCTIONAL_VARIANT_ROOTS = [
  'group',
  'peer',
  'data',
  'aria',
  'has',
  'not',
  'in',
  'nth',
  'supports',
  'min',
  'max',
  '@min',
  '@max',
]

const STATIC_ROOTS = new Set([
  ...STATIC_UTILITY_ROOTS,
  ...STATIC_VARIANTS,
  ...FUNCTIONAL_VARIANT_ROOTS,
])
const WHITESPACE = /\s/

/** Every `root-` a project's classes start with, plus its variants — per design system. */
const dsRootsMemo = new WeakMap<DesignSystemCache, Set<string>>()
function dsRoots(cache: DesignSystemCache): Set<string> {
  let roots = dsRootsMemo.get(cache)
  if (roots) return roots
  roots = new Set([...cache.variantNames(), ...FUNCTIONAL_VARIANT_ROOTS])
  for (const cls of cache.validClasses) {
    const u = cls.startsWith('-') ? cls.slice(1) : cls
    for (let i = u.indexOf('-'); i > 0; i = u.indexOf('-', i + 1)) roots.add(u.slice(0, i))
  }
  dsRootsMemo.set(cache, roots)
  return roots
}

/**
 * Whether the text glued in front of a `${}` starts a Tailwind class: its first
 * segment (after any `-` / `!`, and after each variant) is a utility or a
 * variant. `bg-` → `bg`; `md:bg-` → `md`; `w-[` → `w`; `hover:` → `hover`.
 */
function startsTailwindClass(fragment: string, roots: Set<string>, dsPrefixes: boolean): boolean {
  let f = fragment.replace(/^[!-]+/, '')
  // With a design system the fragment itself can be looked up (`bg-red-` for
  // `bg-red-${shade}`); without one only the first segment is known.
  const head = f.split(':')[0]
  if (head !== f) return roots.has(head.split('-')[0]) || roots.has(head)
  f = f.replace(/\[.*$/, '')
  if (dsPrefixes && roots.has(f.replace(/-$/, ''))) return true
  return roots.has(f.split('-')[0])
}

/**
 * The whole class a glued fragment starts, read from the source: from the
 * fragment to the first whitespace or backtick outside a `${…}` —
 * `bg-${active ? 'blue' : 'gray'}-500`.
 */
function classFrom(source: string, start: number): string {
  let depth = 0
  let i = start
  for (; i < source.length; i++) {
    const c = source[i]
    if (depth === 0) {
      if (c === '`' || WHITESPACE.test(c)) break
      if (c === '$' && source[i + 1] === '{') {
        depth = 1
        i++
      }
    } else if (c === '{') depth++
    else if (c === '}') depth--
  }
  return source.slice(start, i)
}

export const noDynamicClasses = defineRule({
  meta: {
    type: 'problem',
    docs: ruleDocs('no-dynamic-classes', {
      description:
        'Disallow Tailwind CSS class names built at runtime, which Tailwind cannot see and generates no CSS for',
      category: 'correctness',
      recommended: 'error',
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
      ...SETTINGS_MESSAGE,
      dynamicClass:
        '"{{className}}" is built at runtime, so Tailwind never sees it written out and generates no CSS for it. Write out the full class names (for example, a map from each value to its class) instead.',
    },
  },
  createOnce(context) {
    // DS-OPTIONAL (see `softGetDS`): with an entry point, the project's own
    // utilities and variants count as Tailwind roots; without one, Tailwind's.
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      let roots: Set<string> | null = null
      let dsPrefixes = false
      let source: string | undefined

      for (const loc of locations) {
        // A fragment glued to the next `${}`: the quasi's last token, with no
        // whitespace between it and the expression. Checking only the LEFT
        // fragment reports each runtime class once, however many expressions
        // it spans (`from-${a}-${b}`).
        if (!loc.preserveTrailingSpace || loc.value.length === 0) continue
        if (WHITESPACE.test(loc.value[loc.value.length - 1])) continue
        let tokenStart = loc.value.length
        while (tokenStart > 0 && !WHITESPACE.test(loc.value[tokenStart - 1])) tokenStart--
        const fragment = loc.value.slice(tokenStart)

        if (!roots) {
          const ds = locations.length > 0 ? softGetDS(getDS) : null
          roots = ds ? dsRoots(ds.cache) : STATIC_ROOTS
          dsPrefixes = ds !== null
        }
        if (!startsTailwindClass(fragment, roots, dsPrefixes)) continue

        source ??= safeSourceCode(context)?.text
        const start = loc.range[0] + tokenStart
        const className = source ? classFrom(source, start) : `${fragment}\${…}`
        context.report({ node: loc.node, messageId: 'dynamicClass', data: { className } })
      }
    }

    // Raw view: the glued fragments are exactly what this rule is about.
    return createExtractorVisitors(context, check, { raw: true })
  },
})
