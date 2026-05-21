import { resolve } from 'node:path'
import { beforeAll, describe, it, test, expect } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import {
  noConflictingClasses,
  isCompositionViaCssVars,
  isNarrowingOverride,
  shouldSkipPair,
} from '../../src/rules/no-conflicting-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { loadDesignSystemSync } from '../../src/design-system/sync-loader'
import { DesignSystemCache } from '../../src/design-system/cache'

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

ruleTester.run('no-conflicting-classes', noConflictingClasses, {
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
    // size-* sets {width,height}; later h-*/w-* narrows one axis (subset-override)
    { code: '<div className="size-4 h-6" />', filename: 'test.tsx' },
    { code: '<div className="size-4 w-6" />', filename: 'test.tsx' },
    // rounded-{side} (2 corners) → rounded-{corner} (1) refines one corner
    { code: '<div className="rounded-t-lg rounded-tl-sm" />', filename: 'test.tsx' },
    { code: '<div className="rounded-s-lg rounded-ss-sm" />', filename: 'test.tsx' },
    // rounded (4 corners) → side (2) → corner (1) — both subset layers compose
    { code: '<div className="rounded-lg rounded-t-sm" />', filename: 'test.tsx' },
    { code: '<div className="rounded-lg rounded-tl-sm" />', filename: 'test.tsx' },
    // truncate sets {overflow,text-overflow,white-space}; text-clip refines text-overflow
    { code: '<div className="truncate text-clip" />', filename: 'test.tsx' },
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

  trackingTester.run('no-conflicting-classes (text + tracking)', noConflictingClasses, {
    valid: [
      // text-* sets letter-spacing as default, tracking-* overrides it (#8)
      { code: '<div className="text-base tracking-tight" />', filename: 'test.tsx' },
      { code: '<div className="text-lg tracking-wide" />', filename: 'test.tsx' },
      { code: '<div className="text-base tracking-normal" />', filename: 'test.tsx' },
    ],
    invalid: [],
  })
})

// --- Unit tests for the pure composition heuristics ---

describe('isCompositionViaCssVars', () => {
  it('returns true when both sides define disjoint --tw-* properties', () => {
    // shadow and ring both contribute to box-shadow via different vars
    expect(
      isCompositionViaCssVars(['box-shadow', '--tw-shadow'], ['box-shadow', '--tw-ring-shadow']),
    ).toBe(true)
  })

  it('returns false when both sides share a --tw-* property', () => {
    expect(
      isCompositionViaCssVars(['box-shadow', '--tw-shadow'], ['box-shadow', '--tw-shadow']),
    ).toBe(false)
  })

  it('returns false when one side has no custom properties', () => {
    expect(
      isCompositionViaCssVars(['background-color'], ['background-color', '--tw-bg-opacity']),
    ).toBe(false)
  })

  it('returns false when neither side has custom properties', () => {
    expect(isCompositionViaCssVars(['color'], ['color'])).toBe(false)
  })
})

describe('isNarrowingOverride', () => {
  it('returns true when later is a strict subset of earlier (size + h)', () => {
    // size-4 sets {width, height}; h-6 sets {height} — narrows one axis
    expect(isNarrowingOverride(['width', 'height'], ['height'])).toBe(true)
  })

  it('returns true for shorthand → corner (rounded + corner)', () => {
    // rounded-t sets {border-top-left-radius, border-top-right-radius};
    // rounded-tl sets {border-top-left-radius} — refines one corner
    expect(
      isNarrowingOverride(
        ['border-top-left-radius', 'border-top-right-radius'],
        ['border-top-left-radius'],
      ),
    ).toBe(true)
  })

  it('returns false when the inverse (wider later clobbers narrower earlier)', () => {
    // h-6 then size-4: later is wider, not a refinement — must report conflict
    expect(isNarrowingOverride(['height'], ['width', 'height'])).toBe(false)
  })

  it('returns false when sets are equal (no strict subset)', () => {
    // mt-2 vs mt-4: same property set — overlap check should still fire
    expect(isNarrowingOverride(['margin-top'], ['margin-top'])).toBe(false)
  })

  it('returns false when later is disjoint from earlier', () => {
    // padding-left is not in {color}, so no narrowing — different concern entirely
    expect(isNarrowingOverride(['color'], ['padding-left'])).toBe(false)
  })

  it('returns false when later is empty', () => {
    expect(isNarrowingOverride(['width', 'height'], [])).toBe(false)
  })

  it('returns true for multi-property shorthand narrowing (truncate + text-clip)', () => {
    // truncate sets {overflow, text-overflow, white-space}; text-clip refines text-overflow
    expect(
      isNarrowingOverride(['overflow', 'text-overflow', 'white-space'], ['text-overflow']),
    ).toBe(true)
  })

  it('returns false when later has same length as earlier (not strict subset)', () => {
    // Same length means not strictly smaller — even if subset relation holds, this
    // is redundancy, not refinement
    expect(isNarrowingOverride(['color', 'background'], ['color', 'background'])).toBe(false)
  })
})

describe('shouldSkipPair', () => {
  it('skips pairs that compose via disjoint --tw-* vars', () => {
    expect(
      shouldSkipPair(
        'shadow-md',
        'ring-2',
        ['box-shadow', '--tw-shadow'],
        ['box-shadow', '--tw-ring-shadow'],
      ),
    ).toBe(true)
  })

  it('skips pairs in the same complementary group (gradient stops)', () => {
    expect(shouldSkipPair('from-red-500', 'to-blue-500', [], [])).toBe(true)
  })

  it('skips transform axes via disjoint --tw-* vars', () => {
    // translate-x and translate-y are same captured prefix ("translate"),
    // so they fall through the complementary-group check. With real DS props
    // they have disjoint --tw-translate-{x,y} vars and compose via vars.
    expect(
      shouldSkipPair(
        'translate-x-2',
        'translate-y-4',
        ['translate', '--tw-translate-x'],
        ['translate', '--tw-translate-y'],
      ),
    ).toBe(true)
  })

  it('does NOT skip same-axis transforms (same captured prefix conflict)', () => {
    // translate-x-1 vs translate-x-2: same prefix → fall through → overlap → conflict
    expect(
      shouldSkipPair(
        'translate-x-1',
        'translate-x-2',
        ['translate', '--tw-translate-x'],
        ['translate', '--tw-translate-x'],
      ),
    ).toBe(false)
  })

  it('skips composition pair text-* + leading-*', () => {
    expect(shouldSkipPair('text-sm', 'leading-tight', [], [])).toBe(true)
  })

  it('skips composition pair in either order (leading-* + text-*)', () => {
    expect(shouldSkipPair('leading-tight', 'text-sm', [], [])).toBe(true)
  })

  it('does NOT skip true conflicts on the same property', () => {
    expect(
      shouldSkipPair('bg-red-500', 'bg-blue-500', ['background-color'], ['background-color']),
    ).toBe(false)
  })

  it('strips ! (prefix) before regex matching', () => {
    expect(shouldSkipPair('!from-red-500', '!to-blue-500', [], [])).toBe(true)
  })

  it('strips ! (suffix) before regex matching', () => {
    expect(shouldSkipPair('from-red-500!', 'to-blue-500!', [], [])).toBe(true)
  })

  it('accepts injected rule tables', () => {
    // With empty rule tables nothing should be skipped via regex
    expect(
      shouldSkipPair('from-red-500', 'to-blue-500', [], [], {
        complementaryGroups: [],
        compositionPairs: [],
      }),
    ).toBe(false)
  })
})

// --- tailwindcss-animate utilities compose through CSS custom properties ---

describe('tailwindcss-animate composition', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ANIMATE_ENTRY)
  })

  const animateTester = new RuleTester()

  animateTester.run('no-conflicting-classes (tailwindcss-animate)', noConflictingClasses, {
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
  })
})

// --- tw-animate-css utilities compose through CSS custom properties ---

describe('tw-animate-css composition', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(TW_ANIMATE_CSS_ENTRY)
  })

  const tester = new RuleTester()

  tester.run('no-conflicting-classes (tw-animate-css)', noConflictingClasses, {
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
  })
})
