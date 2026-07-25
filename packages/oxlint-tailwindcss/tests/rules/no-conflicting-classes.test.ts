import { resolve } from 'node:path'
import { beforeAll, describe, it, test, expect } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import {
  noConflictingClasses,
  neededVars,
  resolveWinner,
  shouldSkipPair,
} from '../../src/rules/no-conflicting-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { loadDesignSystemSync } from '../../src/design-system/sync-loader'
import { DesignSystemCache } from '../../src/design-system/cache'
import { runWithFixture } from '../utils/with-fixture'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const PROSE_ENTRY = resolve(__dirname, '../fixtures/with-typography.css')
const LETTER_SPACING_ENTRY = resolve(__dirname, '../fixtures/with-letter-spacing.css')
const ANIMATE_ENTRY = resolve(__dirname, '../fixtures/with-tailwindcss-animate.css')
const TW_ANIMATE_CSS_ENTRY = resolve(__dirname, '../fixtures/with-tw-animate-css.css')

// --- Default design system tests ---

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

runWithFixture(ruleTester, 'no-conflicting-classes', noConflictingClasses, ENTRY_POINT, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="p-4 m-2" />', filename: 'test.tsx' },
    // Different variants = no conflict
    { code: '<div className="hover:bg-red-500 focus:bg-blue-500" />', filename: 'test.tsx' },
    // Gradient utilities are complementary, not conflicting
    { code: '<div className="from-white to-transparent" />', filename: 'test.tsx' },
    { code: '<div className="from-blue-500 via-purple-500 to-pink-500" />', filename: 'test.tsx' },
    // divide-* targets children (> * + *), border-* targets the element itself
    { code: '<div className="divide-border border-input" />', filename: 'test.tsx' },
    // shadow-* and ring-* compose via CSS custom properties in box-shadow
    { code: '<div className="shadow-sm ring-2" />', filename: 'test.tsx' },
    { code: '<div className="shadow-lg ring-1 ring-offset-2" />', filename: 'test.tsx' },
    // inset-ring-* and inset-shadow-* compose with shadow/ring (#3)
    { code: '<div className="inset-ring-1 shadow-md" />', filename: 'test.tsx' },
    { code: '<div className="inset-shadow-sm shadow-lg" />', filename: 'test.tsx' },
    { code: '<div className="inset-ring-2 ring-2" />', filename: 'test.tsx' },
    { code: '<div className="inset-shadow-xs ring-1 shadow-sm" />', filename: 'test.tsx' },
    {
      code: '<div className="inset-ring-1 inset-shadow-sm shadow-md ring-2 ring-offset-2" />',
      filename: 'test.tsx',
    },
    // text-* sets line-height as default, leading-* overrides it
    { code: '<div className="text-sm leading-relaxed" />', filename: 'test.tsx' },
    { code: '<div className="text-xs leading-tight" />', filename: 'test.tsx' },
    // transition-* + duration-*/ease-*/delay-* compose
    { code: '<div className="transition-all duration-500 ease-out" />', filename: 'test.tsx' },
    { code: '<div className="transition-colors duration-150" />', filename: 'test.tsx' },
    // border width + border style compose
    { code: '<div className="border border-dashed" />', filename: 'test.tsx' },
    // outline width + outline style compose: outline-<n> READS --tw-outline-style
    // (outline-style: var(--tw-outline-style)), outline-dashed WRITES it (#80-adjacent)
    { code: '<div className="outline-1 outline-dashed" />', filename: 'test.tsx' },
    { code: '<div className="outline-2 outline-solid" />', filename: 'test.tsx' },
    { code: '<div className="outline-dashed outline-4" />', filename: 'test.tsx' },
    // outline-none/outline-hidden WRITE --tw-outline-style (: none); outline-<n>
    // READS it — same writer/reader shape, so they intentionally compose (#81
    // follow-up: locks this behavior change down).
    { code: '<div className="outline-none outline-1" />', filename: 'test.tsx' },
    { code: '<div className="outline-1 outline-hidden" />', filename: 'test.tsx' },
    { code: '<div className="border-2 border-dotted" />', filename: 'test.tsx' },
    // transform axes compose (x + y are independent)
    { code: '<div className="translate-x-2 -translate-y-2" />', filename: 'test.tsx' },
    { code: '<div className="scale-x-50 scale-y-75" />', filename: 'test.tsx' },
    // backdrop-filter utilities compose via CSS custom properties
    { code: '<div className="backdrop-blur-lg backdrop-brightness-50" />', filename: 'test.tsx' },
    {
      code: '<div className="backdrop-blur-sm backdrop-contrast-100 backdrop-saturate-150" />',
      filename: 'test.tsx',
    },
    // filter utilities compose via CSS custom properties
    { code: '<div className="blur-lg brightness-50" />', filename: 'test.tsx' },
    { code: '<div className="blur-sm drop-shadow-md contrast-100" />', filename: 'test.tsx' },
    // contain-* utilities compose via CSS custom properties
    { code: '<div className="contain-layout contain-paint" />', filename: 'test.tsx' },
    { code: '<div className="contain-size contain-style" />', filename: 'test.tsx' },
    // font-variant-numeric utilities compose
    { code: '<div className="lining-nums tabular-nums" />', filename: 'test.tsx' },
    { code: '<div className="ordinal slashed-zero" />', filename: 'test.tsx' },
    // touch-action utilities compose
    { code: '<div className="touch-pan-x touch-pan-y" />', filename: 'test.tsx' },
    { code: '<div className="touch-pan-x touch-pinch-zoom" />', filename: 'test.tsx' },
    // border-spacing axis composition
    { code: '<div className="border-spacing-x-2 border-spacing-y-4" />', filename: 'test.tsx' },
    // rounded (4 corners) → side (2) / corner (1): no property NAME is shared
    // (border-radius is not border-top-left-radius), so nothing to compare.
    { code: '<div className="rounded-lg rounded-t-sm" />', filename: 'test.tsx' },
    { code: '<div className="rounded-lg rounded-tl-sm" />', filename: 'test.tsx' },
    // Same corner, same radius: whoever wins, the corner is the same.
    { code: '<div className="rounded-t-lg rounded-l-lg" />', filename: 'test.tsx' },
    // Pseudo-element and descendant boxes are not the element's box.
    { code: '<div className="text-gray-900 placeholder-gray-400" />', filename: 'test.tsx' },
    { code: '<div className="ms-2 space-x-4" />', filename: 'test.tsx' },
    { code: '<div className="space-x-4 ms-2" />', filename: 'test.tsx' },
    { code: '<div className="mbs-2 space-y-4" />', filename: 'test.tsx' },
    { code: '<div className="divide-y-2 border-t-2" />', filename: 'test.tsx' },
    // Documented compositions the rule now derives from the emitted CSS.
    { code: '<div className="mask-b-from-50% mask-b-from-black" />', filename: 'test.tsx' },
    { code: '<div className="drop-shadow-xl drop-shadow-indigo-500" />', filename: 'test.tsx' },
    { code: '<div className="scale-3d scale-x-110" />', filename: 'test.tsx' },
    { code: '<div className="translate-3d translate-x-4" />', filename: 'test.tsx' },
    { code: '<div className="transform-gpu rotate-x-45" />', filename: 'test.tsx' },
    { code: '<div className="rotate-x-45 transform-gpu" />', filename: 'test.tsx' },
    { code: '<div className="scale-150 transform-gpu" />', filename: 'test.tsx' },
    // Native Tailwind scrollbar colours: identical `scrollbar-color` declaration.
    {
      code: '<div className="scrollbar-thumb-red-500 scrollbar-track-gray-100" />',
      filename: 'test.tsx',
    },
    {
      code: '<div className="scrollbar-thin scrollbar-thumb-red-500 scrollbar-track-gray-100" />',
      filename: 'test.tsx',
    },
    // Mask gradient utilities are designed to compose across stops, families, axes, and edges.
    // Source: https://tailwindcss.com/docs/mask-image
    { code: '<div className="mask-l-from-50% mask-l-to-90%" />', filename: 'test.tsx' },
    {
      code: '<div className="mask-linear-50 mask-linear-from-60% mask-linear-to-80%" />',
      filename: 'test.tsx',
    },
    {
      code: '<div className="-mask-linear-50 mask-linear-from-60% mask-linear-to-80%" />',
      filename: 'test.tsx',
    },
    { code: '<div className="mask-b-from-50% mask-radial-from-80%" />', filename: 'test.tsx' },
    {
      code: '<div className="mask-r-from-80% mask-b-from-80% mask-radial-from-70% mask-radial-to-85%" />',
      filename: 'test.tsx',
    },
    { code: '<div className="mask-x-from-50% mask-x-to-90%" />', filename: 'test.tsx' },
    { code: '<div className="mask-radial-from-75% mask-radial-at-left" />', filename: 'test.tsx' },
    { code: '<div className="mask-add mask-linear-from-20%" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      // Two WRITERS of --tw-outline-style — a genuine conflict
      code: '<div className="outline-dashed outline-solid" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      // Two readers, but both also declare outline-width directly — conflict
      code: '<div className="outline-1 outline-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      // font-weight has the same --tw-* shape, but font-bold and font-normal
      // both WRITE --tw-font-weight (two writers) — a genuine conflict that the
      // composition exclusion must NOT suppress (#81 follow-up regression).
      code: '<div className="font-bold font-normal" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="text-red-500 text-blue-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Same longhand properties conflict
    {
      code: '<div className="mt-2 mt-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Three-way conflict
    {
      code: '<div className="text-red-500 text-blue-500 text-green-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }, { messageId: 'conflict' }, { messageId: 'conflict' }],
    },
    // Same variant conflict
    {
      code: '<div className="hover:bg-red-500 hover:bg-blue-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // ! important modifier conflict
    {
      code: '<div className="!text-red-500 !text-blue-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Same-utility conflicts within composition groups must still be detected
    {
      code: '<div className="shadow-sm shadow-lg" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Same mask slot (family + role) with different values still conflicts.
    {
      code: '<div className="mask-linear-from-50% mask-linear-from-80%" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="mask-l-from-50% mask-l-from-80%" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Two mask composite modes conflict on mask-composite.
    {
      code: '<div className="mask-add mask-subtract" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="blur-sm blur-lg" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="backdrop-blur-sm backdrop-blur-lg" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="ring-1 ring-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="inset-ring-1 inset-ring-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="skew-x-1 skew-x-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Asymmetry guard: subset-override only skips when the later class is narrower.
    {
      code: '<div className="h-6 size-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="rounded-tl-sm rounded-t-lg" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Container-type marking utilities all set `container-type`, so combining
    // two of them conflicts. @container-size is absent from getClassList() (#37)
    // but must behave like its @container / @container-normal siblings.
    {
      code: '<div className="@container @container-size" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
  ],
})

// --- Descendant selector filtering (prose-like classes from @tailwindcss/typography) ---

describe('descendant selector filtering', () => {
  test('prose root properties should NOT include descendant selector properties', () => {
    const data = loadDesignSystemSync(PROSE_ENTRY)
    expect(data).not.toBeNull()
    const cache = DesignSystemCache.fromPrecomputed(data!)
    const proseProps = cache.getCssProperties('prose')
    // prose root element sets: color, max-width
    // It should NOT include overflow-x (from :where(pre)),
    // font-weight (from :where(h1/a/code)), text-decoration (from :where(a)), etc.
    expect(proseProps).toContain('color')
    expect(proseProps).toContain('max-width')
    expect(proseProps).not.toContain('overflow-x')
    expect(proseProps).not.toContain('text-decoration')
  })

  test('not-prose should be recognized as a valid class', () => {
    const data = loadDesignSystemSync(PROSE_ENTRY)
    expect(data).not.toBeNull()
    const cache = DesignSystemCache.fromPrecomputed(data!)
    // not-prose is referenced via [class~="not-prose"] in typography CSS output
    expect(cache.isValid('not-prose')).toBe(true)
  })
})

// --- text-* + tracking-* composition when theme defines letter-spacing (#8) ---

describe('text + tracking composition with letter-spacing', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(LETTER_SPACING_ENTRY)
  })

  const trackingTester = new RuleTester()

  runWithFixture(
    trackingTester,
    'no-conflicting-classes (text + tracking)',
    noConflictingClasses,
    LETTER_SPACING_ENTRY,
    {
      valid: [
        // text-* sets letter-spacing as default, tracking-* overrides it (#8)
        { code: '<div className="text-base tracking-tight" />', filename: 'test.tsx' },
        { code: '<div className="text-lg tracking-wide" />', filename: 'test.tsx' },
        { code: '<div className="text-base tracking-normal" />', filename: 'test.tsx' },
      ],
      invalid: [],
    },
  )
})

// --- Unit tests for the pure composition heuristics ---

describe('neededVars', () => {
  const decl = (readsVars: string[], readsFallbackVars: string[] = []) =>
    ({
      prop: 'line-height',
      value: 'var(--tw-leading, var(--text-sm--line-height))',
      valueId: 0,
      scope: 'element',
      pseudo: '',
      conditional: false,
      readsVars,
      readsFallbackVars,
      pureVarRead: true,
    }) as const

  it('ignores the fallback when the group supplies the direct read', () => {
    // `var(--tw-leading, …)`: once leading-* writes --tw-leading the fallback is
    // dead CSS, so text-sm does not "need" the size token.
    const needed = neededVars(
      decl(['--tw-leading'], ['--text-sm--line-height']),
      new Set(['--tw-leading']),
    )
    expect(needed).toEqual(['--tw-leading'])
  })

  it('keeps the fallback when the direct read is unsupplied', () => {
    const needed = neededVars(decl(['--tw-leading'], ['--text-sm--line-height']), new Set())
    expect(needed).toEqual(['--tw-leading', '--text-sm--line-height'])
  })
})

describe('resolveWinner', () => {
  const facts = (className: string, order: bigint | null, important = false) => ({
    className,
    decls: new Map(),
    writes: new Map(),
    order,
    important,
    partial: false,
  })

  it('gives the later stylesheet position the win', () => {
    const a = facts('p-4', 10n)
    const b = facts('p-6', 20n)
    expect(resolveWinner(a, b)).toMatchObject({ winner: b, loser: a, orderKnown: true })
    expect(resolveWinner(b, a)).toMatchObject({ winner: b, loser: a, orderKnown: true })
  })

  it('lets ! beat stylesheet order', () => {
    const plain = facts('text-red-500', 99n)
    const important = facts('!text-blue-500', 1n, true)
    expect(resolveWinner(plain, important)).toMatchObject({
      winner: important,
      loser: plain,
      orderKnown: true,
    })
  })

  it('reports an unknown order rather than guessing from the attribute', () => {
    expect(resolveWinner(facts('a', null), facts('b', 5n)).orderKnown).toBe(false)
    expect(resolveWinner(facts('a', 5n), facts('b', 5n)).orderKnown).toBe(false)
  })
})

describe('shouldSkipPair', () => {
  it('skips the documented non-derivable exceptions', () => {
    // prose + prose-sm: same properties, different values, composition by plugin
    // design — invisible in the emitted CSS.
    expect(shouldSkipPair('prose', 'prose-sm')).toBe(true)
    expect(shouldSkipPair('prose', 'max-w-none')).toBe(true)
    expect(shouldSkipPair('mask-add', 'mask-linear-from-20%')).toBe(true)
    expect(shouldSkipPair('mask-linear-from-20%', 'mask-add')).toBe(true)
  })

  it('does not skip pairs the CSS comparison is expected to judge', () => {
    expect(shouldSkipPair('bg-red-500', 'bg-blue-500')).toBe(false)
    expect(shouldSkipPair('from-red-500', 'to-blue-500')).toBe(false)
    expect(shouldSkipPair('text-sm', 'leading-tight')).toBe(false)
    expect(shouldSkipPair('divide-x-2', 'border-2')).toBe(false)
    expect(shouldSkipPair('animate-in', 'fade-in')).toBe(false)
  })

  it('strips ! before matching, in either position', () => {
    expect(shouldSkipPair('!prose', 'prose-sm')).toBe(true)
    expect(shouldSkipPair('prose!', 'prose-sm')).toBe(true)
  })

  it('accepts injected tables', () => {
    expect(
      shouldSkipPair('prose', 'prose-sm', { complementaryGroups: [], compositionPairs: [] }),
    ).toBe(false)
  })
})

describe('tailwindcss-animate composition', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ANIMATE_ENTRY)
  })

  const animateTester = new RuleTester()

  runWithFixture(
    animateTester,
    'no-conflicting-classes (tailwindcss-animate)',
    noConflictingClasses,
    ANIMATE_ENTRY,
    {
      valid: [
        {
          code: '<div className="animate-in fade-in zoom-in slide-in-from-top" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="animate-in fade-in-50 zoom-in-95 slide-in-from-bottom-48" />',
          filename: 'test.tsx',
        },
        { code: '<div className="animate-out slide-out-to-top" />', filename: 'test.tsx' },
        {
          code: '<div className="animate-out fade-out zoom-out slide-out-to-right-96" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="animate-bounce duration-300 delay-150 ease-in-out" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="animate-bounce direction-reverse fill-mode-both repeat-infinite running" />',
          filename: 'test.tsx',
        },
      ],
      invalid: [
        {
          code: '<div className="fade-in fade-in-50" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'conflict' }],
        },
        {
          code: '<div className="running paused" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'conflict' }],
        },
      ],
    },
  )
})

// --- tw-animate-css utilities compose through CSS custom properties ---

describe('values that are the same number written two ways', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(TW_ANIMATE_CSS_ENTRY)
  })

  runWithFixture(
    new RuleTester(),
    'no-conflicting-classes (calc(1 * x))',
    noConflictingClasses,
    TW_ANIMATE_CSS_ENTRY,
    {
      valid: [],
      invalid: [
        {
          // `slide-in-from-left` declares `--tw-enter-translate-x: -100%` and
          // `slide-in-from-left-full` declares `calc(1 * -100%)`: the same value,
          // so one of the two is redundant rather than in conflict.
          code: '<div className="slide-in-from-left slide-in-from-left-full" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'redundant' }],
        },
      ],
    },
  )
})

describe('tw-animate-css composition', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(TW_ANIMATE_CSS_ENTRY)
  })

  const tester = new RuleTester()

  runWithFixture(
    tester,
    'no-conflicting-classes (tw-animate-css)',
    noConflictingClasses,
    TW_ANIMATE_CSS_ENTRY,
    {
      valid: [
        {
          code: '<div className="animate-in fade-in zoom-in slide-in-from-top" />',
          filename: 'test.tsx',
        },
        {
          code: '<div className="animate-out fade-out zoom-out slide-out-to-right" />',
          filename: 'test.tsx',
        },
        { code: '<div className="animate-in fade-in blur-in" />', filename: 'test.tsx' },
        { code: '<div className="animate-out fade-out blur-out" />', filename: 'test.tsx' },
        { code: '<div className="animate-in slide-in-from-start" />', filename: 'test.tsx' },
        { code: '<div className="animate-out slide-out-to-end-8" />', filename: 'test.tsx' },
        { code: '<div className="animate-accordion-down" />', filename: 'test.tsx' },
        { code: '<div className="animate-collapsible-up" />', filename: 'test.tsx' },
        { code: '<div className="animate-caret-blink" />', filename: 'test.tsx' },
      ],
      invalid: [
        {
          code: '<div className="running play-state-initial" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'conflict' }],
        },
      ],
    },
  )
})

// --- Decisions the rule now derives from the emitted CSS ---

describe('derived from generated CSS', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  const invalid = (classes: string, messageId = 'conflict') => ({
    code: `<div className="${classes}" />`,
    filename: 'test.tsx',
    errors: [{ messageId }],
  })

  runWithFixture(
    new RuleTester(),
    'no-conflicting-classes (derived)',
    noConflictingClasses,
    ENTRY_POINT,
    {
      valid: [],
      invalid: [
        // A narrower utility layered over a shorthand used to be waved through by
        // a directional heuristic: `size-4 h-6` was valid and `h-6 size-4` was
        // not, even though both compile to identical CSS. The stylesheet order
        // decides, and it always puts `h-*`/`w-*` after `size-*`, so the
        // attribute order was never the point.
        invalid('size-4 h-6'),
        invalid('size-4 w-6'),
        invalid('rounded-t-lg rounded-tl-sm'),
        invalid('rounded-s-lg rounded-ss-sm'),
        invalid('truncate text-clip'),
        // Same shape, and it used to be a FALSE NEGATIVE: not-sr-only's
        // properties are a strict subset of sr-only's, so the heuristic silently
        // accepted a pair that clobbers seven declarations.
        invalid('sr-only not-sr-only'),

        // Pairs within one non-element box still compete.
        invalid('space-x-4 space-x-2'),
        invalid('placeholder-red-500 placeholder-blue-500'),

        // Both write --tw-mask-linear with different values: one silently kills
        // the other. The old mask table hid this.
        invalid('mask-linear-from-20% mask-b-from-50%'),

        // Bare utilities recovered outside getClassList() had no precomputed
        // data at all, so these were never compared.
        invalid('rounded rounded-lg'),
        invalid('blur blur-sm'),

        // `!` wins regardless of stylesheet position, so it is the winner named.
        invalid('!text-blue-500 text-red-500'),
      ],
    },
  )
})

describe('redundant classes', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  const redundant = (classes: string) => ({
    code: `<div className="${classes}" />`,
    filename: 'test.tsx',
    errors: [{ messageId: 'redundant' }],
  })

  runWithFixture(
    new RuleTester(),
    'no-conflicting-classes (redundant)',
    noConflictingClasses,
    ENTRY_POINT,
    {
      valid: [
        // Opting out silences redundancy without touching conflict detection.
        {
          code: '<div className="shadow shadow-sm" />',
          filename: 'test.tsx',
          options: [{ reportRedundant: false }],
        },
      ],
      invalid: [
        // Same declaration from both sides: not a conflict, but one of them is
        // dead weight — and no other rule reports these (the design system
        // canonicalizes them to themselves).
        redundant('shadow shadow-sm'),
        redundant('ring ring-1'),
        redundant('grayscale grayscale-100'),
        redundant('block line-clamp-none'),
        redundant('h-4 size-4'),
        redundant('-m-0 m-0'),
        // `transform` is a v3 compatibility no-op: byte-identical chain.
        redundant('transform rotate-x-45'),
        // `w-full` adds nothing to `container`, but `container` itself is never
        // named: its breakpoint max-widths live in @media and are not modelled.
        redundant('container w-full'),
      ],
    },
  )
})

// --- User escape hatch ---

describe('allow option', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  runWithFixture(
    new RuleTester(),
    'no-conflicting-classes (allow)',
    noConflictingClasses,
    ENTRY_POINT,
    {
      valid: [
        // A bare pattern silences everything involving a matching class — the
        // answer to "my plugin composes in a way you cannot derive".
        {
          code: '<div className="flex-row flex-col" />',
          filename: 'test.tsx',
          options: [{ allow: ['^flex-'] }],
        },
        // A two-element pattern silences just that combination.
        {
          code: '<div className="p-4 p-6" />',
          filename: 'test.tsx',
          options: [{ allow: [['^p-4$', '^p-6$']] }],
        },
        // Orientation does not matter.
        {
          code: '<div className="p-6 p-4" />',
          filename: 'test.tsx',
          options: [{ allow: [['^p-4$', '^p-6$']] }],
        },
      ],
      invalid: [
        // An unrelated allow entry must not silence anything else.
        {
          code: '<div className="w-4 w-8" />',
          filename: 'test.tsx',
          options: [{ allow: ['^flex-'] }],
          errors: [{ messageId: 'conflict' }],
        },
        // A pair entry is not a licence for either class on its own.
        {
          code: '<div className="p-4 p-8" />',
          filename: 'test.tsx',
          options: [{ allow: [['^p-4$', '^p-6$']] }],
          errors: [{ messageId: 'conflict' }],
        },
        // An invalid regex is skipped, not thrown, and silences nothing.
        {
          code: '<div className="w-4 w-8" />',
          filename: 'test.tsx',
          options: [{ allow: ['[unclosed'] }],
          errors: [{ messageId: 'conflict' }],
        },
      ],
    },
  )
})

// --- Guards for defects found reviewing this change ---

describe('regressions found in review', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  runWithFixture(
    new RuleTester(),
    'no-conflicting-classes (review)',
    noConflictingClasses,
    ENTRY_POINT,
    {
      valid: [
        // `space-x-4` writes the reverse flag as its registered default and
        // `space-x-reverse` flips it: this is the documented way to space a
        // reversed flex row, not a clobber.
        {
          code: '<div className="flex-row-reverse space-x-4 space-x-reverse" />',
          filename: 'test.tsx',
        },
        { code: '<div className="divide-y-4 divide-y-reverse" />', filename: 'test.tsx' },
        // `prose` sets typographic defaults the plugin means you to override.
        { code: '<div className="prose text-red-500" />', filename: 'test.tsx' },
        { code: '<div className="prose leading-8" />', filename: 'test.tsx' },
        // The other side of the reset rule — a class that clears variables AND
        // declares substance of its own, so losing the reset is free — is
        // `animate-in`, covered in the tailwindcss-animate block below.
      ],
      invalid: [
        // A `*-none` reset IS the utility: everything else it declares is a pure
        // var() conduit, so losing the reset loses the only thing asked for.
        // This reported before the rewrite and must keep reporting.
        {
          code: '<div className="blur-lg blur-none" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'conflict' }],
        },
        {
          code: '<div className="drop-shadow-xl drop-shadow-none" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'conflict' }],
        },
      ],
    },
  )
})

describe('declarations under an unmodelled selector condition', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(TW_ANIMATE_CSS_ENTRY)
  })

  runWithFixture(
    new RuleTester(),
    'no-conflicting-classes (ambiguous keys)',
    noConflictingClasses,
    TW_ANIMATE_CSS_ENTRY,
    {
      valid: [
        // `slide-in-from-start` emits `&:dir(ltr)` and `&:dir(rtl)` blocks that
        // both classify as the element's own box, so the model cannot say which
        // value applies. Staying quiet is the honest answer; keeping only the
        // last declaration would have told the user to remove the class and
        // silently reversed the LTR animation.
        {
          code: '<div className="slide-in-from-start slide-in-from-right" />',
          filename: 'test.tsx',
        },
        { code: '<div className="slide-in-from-end slide-in-from-left" />', filename: 'test.tsx' },
      ],
      invalid: [],
    },
  )
})
