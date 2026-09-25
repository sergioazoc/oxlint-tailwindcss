import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import {
  STATIC_UTILITY_ROOTS,
  STATIC_VARIANTS,
  noDynamicClasses,
} from '../../src/rules/no-dynamic-classes'
import { getLoadedDesignSystem } from '../../src/design-system/loader'
import { makeFixtureRunner } from '../utils/with-fixture'

const ruleTester = new RuleTester()
const DEFAULT = resolve(__dirname, '../fixtures/default.css')

const err = (className: string) => ({ messageId: 'dynamicClass' as const, data: { className } })

/**
 * Tailwind generates CSS for the class names it finds written out in your
 * source. `bg-${color}-500` is built at runtime, so no such name is ever
 * written and the class silently gets no CSS. Reported once per class, when
 * the text glued to the `${}` starts with a Tailwind utility or variant.
 */
ruleTester.run('no-dynamic-classes', noDynamicClasses, {
  valid: [
    { code: 'const className = `bg-red-500 p-2`', filename: 'test.tsx' },
    // Nothing glued: a whole class (or list) comes from the variable.
    { code: 'const className = `${base} p-4 ${extra}`', filename: 'test.tsx' },
    { code: '<div className={`${cls}`} />', filename: 'test.tsx' },
    // No Tailwind root to speak of.
    { code: 'const className = `${a}-${b}`', filename: 'test.tsx' },
    { code: 'const className = `icon-${name}`', filename: 'test.tsx' },
    // Limit, documented: a variant chosen at runtime AFTER the static text
    // isn't a fragment that starts a class.
    { code: 'const className = `${bp}:flex`', filename: 'test.tsx' },
    // The right way: full class names picked at runtime.
    { code: 'const className = cn(active ? "bg-blue-500" : "bg-gray-500")', filename: 'test.tsx' },
  ],
  invalid: [
    // bench/synthetic/08-dynamic.tsx, verbatim.
    {
      code: '<div className={`bg-${color}-500 p-2`} />',
      filename: 'test.tsx',
      errors: [err('bg-${color}-500')],
    },
    {
      code: 'const className = `text-${size} font-bold`',
      filename: 'test.tsx',
      errors: [err('text-${size}')],
    },
    // `+` builds the class just the same; the message writes it as a template.
    {
      code: '<div className={"bg-" + color + "-500"} />',
      filename: 'test.tsx',
      errors: [err('bg-${color}-500')],
    },
    {
      code: 'const className = `grid-cols-${n}`',
      filename: 'test.tsx',
      errors: [err('grid-cols-${n}')],
    },
    {
      code: 'const className = `w-[${width}px]`',
      filename: 'test.tsx',
      errors: [err('w-[${width}px]')],
    },
    { code: 'const className = `-mt-${gap}`', filename: 'test.tsx', errors: [err('-mt-${gap}')] },
    // Under a variant, and a variant built at runtime.
    { code: 'const className = `md:bg-${c}`', filename: 'test.tsx', errors: [err('md:bg-${c}')] },
    {
      code: 'const className = `hover:${cls}`',
      filename: 'test.tsx',
      errors: [err('hover:${cls}')],
    },
    {
      code: 'const className = `data-${state}:flex`',
      filename: 'test.tsx',
      errors: [err('data-${state}:flex')],
    },
    // An expression with spaces or braces inside is still one class.
    {
      code: "const className = `bg-${active ? 'blue' : 'gray'}-500`",
      filename: 'test.tsx',
      errors: [err("bg-${active ? 'blue' : 'gray'}-500")],
    },
    {
      code: 'const className = `p-${sizes[size]} m-${{ a: 1 }[k]}`',
      filename: 'test.tsx',
      errors: [err('p-${sizes[size]}'), err('m-${{ a: 1 }[k]}')],
    },
    // One report per class, however many expressions it takes.
    {
      code: 'const className = `from-${a}-${b} to-${c}`',
      filename: 'test.tsx',
      errors: [err('from-${a}-${b}'), err('to-${c}')],
    },
    // Every extraction site.
    { code: 'const x = cn(`p-${n}`)', filename: 'test.tsx', errors: [err('p-${n}')] },
    { code: 'const x = tw`m-${x}`', filename: 'test.tsx', errors: [err('m-${x}')] },
    {
      // DS-optional: an entry point that can't load degrades to the static roots.
      code: 'const className = `bg-${c}`',
      filename: 'test.tsx',
      settings: { tailwindcss: { entryPoint: '/nonexistent/for-no-dynamic-classes.css' } },
      errors: [err('bg-${c}')],
    },
  ],
})

describe('no-dynamic-classes with a design system', () => {
  // `bar-*` is a project utility (a theme namespace): only the design system
  // knows it is Tailwind's.
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/open-value-utility.css'))
  run('project utilities', noDynamicClasses, {
    valid: [{ code: 'const className = `icon-${name}`', filename: 'test.tsx' }],
    invalid: [
      {
        code: 'const className = `bar-${c}-500`',
        filename: 'test.tsx',
        errors: [err('bar-${c}-500')],
      },
      { code: 'const className = `bg-${c}`', filename: 'test.tsx', errors: [err('bg-${c}')] },
    ],
  })
})

ruleTester.run('no-dynamic-classes (static roots only know Tailwind)', noDynamicClasses, {
  valid: [{ code: 'const className = `bar-${c}-500`', filename: 'test.tsx' }],
  invalid: [],
})

describe('the static fallback lists match Tailwind', () => {
  // When Tailwind adds a utility family or a variant, this fails: regenerate
  // the lists in src/rules/no-dynamic-classes.ts from the output below.
  const { cache } = getLoadedDesignSystem(DEFAULT)

  it('utility roots', () => {
    const roots = new Set<string>()
    for (const c of cache.validClasses) {
      const u = c.startsWith('-') ? c.slice(1) : c
      const i = u.indexOf('-')
      if (i > 0) roots.add(u.slice(0, i))
    }
    expect([...STATIC_UTILITY_ROOTS].sort()).toEqual([...roots].sort())
  })

  it('variant names', () => {
    expect([...STATIC_VARIANTS].sort()).toEqual([...cache.variantNames()].sort())
  })
})
