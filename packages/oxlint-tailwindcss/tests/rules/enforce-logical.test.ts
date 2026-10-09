import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import {
  convertDirectional,
  enforceLogical,
  PHYSICAL_TO_LOGICAL_MAPPINGS,
  type AxisMapping,
} from '../../src/rules/enforce-logical'
import { DesignSystemCache } from '../../src/design-system/cache'
import { makeDeclarations } from '../utils/declarations'
import { makeFixtureRunner } from '../utils/with-fixture'

const ruleTester = new RuleTester()

/** One table entry as a class: `exact` entries take no value, insets take `-0`. */
function sample({ from, exact }: AxisMapping): string {
  const suffix = exact ? '' : /left|right|top|bottom/.test(from) ? '-0' : '-4'
  return `${from}${suffix}`
}
const swap = (cls: string, { from }: AxisMapping, to: string) => to + cls.slice(from.length)
const messageIdOf = ({ axis }: AxisMapping) =>
  axis === 'inline' ? ('useLogical' as const) : ('useLogicalWritingMode' as const)

/** The entries that apply without the `sizing` option. */
const UNSIZED = PHYSICAL_TO_LOGICAL_MAPPINGS.filter((m) => !m.sizing)

ruleTester.run('enforce-logical', enforceLogical, {
  valid: [
    { code: '<div className="ms-4" />', filename: 'test.tsx' },
    { code: '<div className="me-4" />', filename: 'test.tsx' },
    { code: '<div className="ps-4 pe-4" />', filename: 'test.tsx' },
    { code: '<div className="start-0 end-0" />', filename: 'test.tsx' },
    { code: '<div className="inset-s-0 inset-bs-0 mbs-4" />', filename: 'test.tsx' },
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    // Sizes are only converted with `sizing: true`.
    { code: '<div className="w-4 h-4 size-4" />', filename: 'test.tsx' },
    // No `inline-dvh` or `max-inline-prose` to suggest, and without a design
    // system nothing else would say so.
    {
      code: '<div className="w-dvh max-w-prose max-w-screen-sm h-svw size-lvh" />',
      filename: 'test.tsx',
      options: [{ sizing: true }],
    },
    // `direction: 'inline'` leaves the block axis alone.
    {
      code: '<div className="mt-4 top-0" />',
      filename: 'test.tsx',
      options: [{ direction: 'inline' }],
    },
  ],
  invalid: [
    // Generated from the mapping table — every entry is covered. Without a design
    // system a Tailwind 4.2 target can't be checked: an entry with a `fallback`
    // writes it (`left-0` → `start-0`, which every v4 has), and one without is
    // only suggested.
    ...UNSIZED.map((m) => {
      const cls = sample(m)
      const code = `<div className="${cls}" />`
      const messageId = messageIdOf(m)
      const to = m.to as string
      if (m.since && !m.fallback) {
        return {
          code,
          filename: 'test.tsx',
          errors: [
            {
              messageId,
              suggestions: [
                {
                  messageId: 'suggestReplace' as const,
                  output: `<div className="${swap(cls, m, to)}" />`,
                },
              ],
            },
          ],
        }
      }
      return {
        code,
        filename: 'test.tsx',
        errors: [{ messageId }],
        output: `<div className="${swap(cls, m, m.fallback ?? to)}" />`,
      }
    }),
    // With variant
    {
      code: '<div className="hover:ml-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="hover:ms-4" />',
    },
    // R-M4: negative utilities keep their leading `-` through the conversion
    {
      code: '<div className="-ml-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="-ms-2" />',
    },
    {
      code: '<div className="-left-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="-start-4" />',
    },
    {
      code: '<div className="hover:-scroll-ml-3" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="hover:-scroll-ms-3" />',
    },
    // Multiple physical properties in same string
    {
      code: '<div className="ml-4 mr-4 flex" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'useLogical' },
        {
          messageId: 'useLogical',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'mr-4', replacement: 'me-4' },
              output: '<div className="ms-4 me-4 flex" />',
            },
          ],
        },
      ],
      output: '<div className="ms-4 me-4 flex" />',
    },
    // A fixable class next to one that is only suggested: the autofix carries
    // the first alone, and the suggestion replaces its own class only.
    {
      code: '<div className="ml-2 mt-2" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'useLogical' },
        {
          messageId: 'useLogicalWritingMode',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'mt-2', replacement: 'mbs-2' },
              output: '<div className="ml-2 mbs-2" />',
            },
          ],
        },
      ],
      output: '<div className="ms-2 mt-2" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex ml-4 ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className={`flex ms-4 ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} ml-4`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className={`${base} ms-4`} />',
    },
    // ! important modifier
    {
      code: '<div className="!ml-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="!ms-4" />',
    },
    // Sizes, suggested only for the same reason as the block axis.
    {
      code: '<div className="size-4" />',
      filename: 'test.tsx',
      options: [{ sizing: true }],
      errors: [
        {
          messageId: 'useLogicalWritingMode',
          suggestions: [
            { messageId: 'suggestReplace', output: '<div className="inline-4 block-4" />' },
          ],
        },
      ],
    },
  ],
})

/**
 * With a design system on Tailwind 4.2+ (the repo's 4.3.3), every target exists:
 * the block axis and `inset-s`/`inset-e` are autofixed.
 */
describe('with a design system', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/default.css'))

  run('enforce-logical (Tailwind 4.3)', enforceLogical, {
    valid: [
      // Not a block-axis border: `border-t-` needs the dash.
      { code: '<div className="border-transparent border-black" />', filename: 'test.tsx' },
      // Values with no logical counterpart, even with `sizing`.
      {
        code: '<div className="w-dvh max-w-prose max-w-screen-sm h-svw size-dvh" />',
        filename: 'test.tsx',
        options: [{ sizing: true }],
      },
      // `size` sets both axes, so it waits until both are in scope.
      {
        code: '<div className="size-4" />',
        filename: 'test.tsx',
        options: [{ direction: 'inline', sizing: true }],
      },
      // Display utilities are not sizes.
      {
        code: '<div className="inline-flex block" />',
        filename: 'test.tsx',
        options: [{ sizing: true }],
      },
    ],
    invalid: [
      ...UNSIZED.map((m) => {
        const cls = sample(m)
        return {
          code: `<div className="${cls}" />`,
          filename: 'test.tsx',
          errors: [{ messageId: messageIdOf(m) }],
          output: `<div className="${swap(cls, m, m.to as string)}" />`,
        }
      }),
      {
        code: '<div className="-left-4 hover:-top-2 mt-auto" />',
        filename: 'test.tsx',
        errors: [
          { messageId: 'useLogical' },
          { messageId: 'useLogicalWritingMode' },
          { messageId: 'useLogicalWritingMode' },
        ],
        output: '<div className="-inset-s-4 hover:-inset-bs-2 mbs-auto" />',
      },
      {
        code: '<div className="border-t-red-500 border-b-[3px]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'useLogicalWritingMode' }, { messageId: 'useLogicalWritingMode' }],
        output: '<div className="border-bs-red-500 border-be-[3px]" />',
      },
      {
        code: '<div className="w-4 h-1/2 min-w-0 max-h-full w-[10px] w-screen" />',
        filename: 'test.tsx',
        options: [{ sizing: true }],
        errors: [
          { messageId: 'useLogicalWritingMode' },
          { messageId: 'useLogicalWritingMode' },
          { messageId: 'useLogicalWritingMode' },
          { messageId: 'useLogicalWritingMode' },
          { messageId: 'useLogicalWritingMode' },
          { messageId: 'useLogicalWritingMode' },
        ],
        output:
          '<div className="inline-4 block-1/2 min-inline-0 max-block-full inline-[10px] inline-screen" />',
      },
      {
        code: '<div className="size-4 md:!size-8" />',
        filename: 'test.tsx',
        options: [{ sizing: true }],
        errors: [{ messageId: 'useLogicalWritingMode' }, { messageId: 'useLogicalWritingMode' }],
        output: '<div className="inline-4 block-4 md:!inline-8 md:!block-8" />',
      },
    ],
  })

  run('enforce-logical (direction)', enforceLogical, {
    valid: [
      { code: '<div className="ml-4" />', filename: 'test.tsx', options: [{ direction: 'block' }] },
      {
        code: '<div className="mt-4" />',
        filename: 'test.tsx',
        options: [{ direction: 'inline' }],
      },
    ],
    invalid: [
      {
        code: '<div className="mt-4 ml-4" />',
        filename: 'test.tsx',
        options: [{ direction: 'block' }],
        errors: [{ messageId: 'useLogicalWritingMode' }],
        output: '<div className="mbs-4 ml-4" />',
      },
    ],
  })
})

/**
 * Sizes read different theme namespaces: `w-*` reads `--width-*`, `inline-*`
 * only `--container-*`. A named value is converted only when the two declare the
 * same thing.
 */
describe('sizing across theme namespaces', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/axis-namespaces.css'))

  run('enforce-logical (sizing namespaces)', enforceLogical, {
    valid: [
      // `--width-xs` is 10rem, `--container-xs` is 20rem: both classes exist.
      { code: '<div className="w-xs" />', filename: 'test.tsx', options: [{ sizing: true }] },
      // `inline-brand` doesn't exist: only `--width-brand` does.
      { code: '<div className="w-brand" />', filename: 'test.tsx', options: [{ sizing: true }] },
    ],
    invalid: [
      // Same namespace for a container size, and the shared spacing scale.
      {
        code: '<div className="max-w-md w-4" />',
        filename: 'test.tsx',
        options: [{ sizing: true }],
        errors: [{ messageId: 'useLogicalWritingMode' }, { messageId: 'useLogicalWritingMode' }],
        output: '<div className="max-inline-md inline-4" />',
      },
    ],
  })
})

/**
 * With a design system, a rewrite has to land on a class that exists.
 *
 * The mapping table is pure name arithmetic: `ml-*` → `ms-*`. A project that
 * defines its own `@utility ml-huge` got an autofix to `ms-huge`, which emits
 * nothing at all — the margin silently disappeared.
 */
describe('replacement validity', () => {
  const run = makeFixtureRunner(resolve(__dirname, '../fixtures/custom-utility.css'))

  run('enforce-logical (validated replacement)', enforceLogical, {
    valid: [
      // `ms-huge` does not exist, so there is nothing to suggest.
      { code: '<div className="ml-huge" />', filename: 'test.tsx' },
      // Same guard, percentage edition. `ms-*` takes no percentage — only the 22
      // gradient/mask/font-stretch prefixes do — so widening the off-scale
      // heuristic to every known prefix would have this rewrite one dead class
      // into another.
      { code: '<div className="ml-33%" />', filename: 'test.tsx' },
    ],
    invalid: [
      // The scale utilities are unaffected: `ms-4` exists.
      {
        code: '<div className="ml-4" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'useLogical' }],
        output: '<div className="ms-4" />',
      },
      {
        code: '<div className="float-left text-right" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'useLogical' }, { messageId: 'useLogical' }],
        output: '<div className="float-start text-end" />',
      },
    ],
  })
})

/**
 * Tailwind 4.1 has none of the 4.2 utilities, and `cache.isValid` can't tell:
 * it accepts an arbitrary value on any prefix, and `inline-flex` makes `inline`
 * look like a known prefix. The conversion probes `<to>-0` instead. A design
 * system with 4.1's classes, built by hand (the engine smoke runs the real 4.1).
 */
describe('on Tailwind 4.1 (no 4.2 utilities)', () => {
  const cache = DesignSystemCache.fromPrecomputed({
    validClasses: ['ml-4', 'ms-4', 'mt-4', 'left-4', 'start-0', 'start-4', 'w-4', 'inline-flex'],
    canonical: {},
    order: {},
    cssDeclarations: makeDeclarations({}),
    variantOrder: {},
    componentClasses: [],
    arbitraryEquivalents: {},
    prefix: '',
  })
  const options = { allowlist: [], direction: 'both' as const, sizing: true }
  const convert = (cls: string) =>
    convertDirectional(cls, PHYSICAL_TO_LOGICAL_MAPPINGS, options, cache)?.replacement ?? null

  it('falls back to start/end where 4.1 has them', () => {
    expect(convert('left-4')).toBe('start-4')
    expect(convert('left-[3px]')).toBe('start-[3px]')
  })

  it('leaves the block axis and sizes alone', () => {
    expect(convert('mt-4')).toBeNull()
    expect(convert('mt-[3px]')).toBeNull()
    expect(convert('w-[10px]')).toBeNull()
  })

  it('still converts what 4.1 has', () => {
    expect(convert('ml-4')).toBe('ms-4')
  })
})
