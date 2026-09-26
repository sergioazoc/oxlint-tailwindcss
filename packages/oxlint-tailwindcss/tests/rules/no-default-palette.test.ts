import { resolve } from 'node:path'
import { afterAll, beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noDefaultPalette } from '../../src/rules/no-default-palette'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

const CUSTOM = resolve(__dirname, '../fixtures/custom-theme.css')
const SHADCN = resolve(__dirname, '../fixtures/shadcn.css')
const DEFAULT = resolve(__dirname, '../fixtures/default.css')

const palette = (className: string, color: string, colors = 'brand, brand-light') => ({
  messageId: 'defaultPalette',
  data: { className, color, colors },
})

describe('no-default-palette (a project with its own colors)', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(CUSTOM)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  runWithFixture(new RuleTester(), 'no-default-palette', noDefaultPalette, CUSTOM, {
    valid: [
      { code: '<div className="bg-brand text-brand-light" />', filename: 'test.tsx' },
      { code: '<div className="hover:bg-brand/50 border-brand" />', filename: 'test.tsx' },
      // Not palette colors.
      {
        code: '<div className="bg-transparent text-current bg-inherit fill-none" />',
        filename: 'test.tsx',
      },
      { code: '<div className="flex p-4 border shadow-sm" />', filename: 'test.tsx' },
      // A literal color is no-hardcoded-colors' business.
      { code: '<div className="bg-[#ff0000]" />', filename: 'test.tsx' },
      // Allowed by name, or by a `*` prefix.
      {
        code: '<div className="bg-white text-black" />',
        filename: 'test.tsx',
        options: [{ allow: ['white', 'black'] }],
      },
      {
        code: '<div className="bg-gray-100 text-gray-900" />',
        filename: 'test.tsx',
        options: [{ allow: ['gray-*'] }],
      },
    ],
    invalid: [
      {
        code: '<div className="bg-red-500" />',
        filename: 'test.tsx',
        errors: [palette('bg-red-500', 'red-500')],
      },
      {
        // Variants, opacity modifiers and any color utility read the same variable.
        code: '<div className="hover:text-blue-600 bg-red-500/50 from-emerald-400 ring-gray-200" />',
        filename: 'test.tsx',
        errors: [
          palette('hover:text-blue-600', 'blue-600'),
          palette('bg-red-500/50', 'red-500'),
          palette('from-emerald-400', 'emerald-400'),
          palette('ring-gray-200', 'gray-200'),
        ],
      },
      {
        code: '<div className="bg-[var(--color-red-500)]" />',
        filename: 'test.tsx',
        errors: [palette('bg-[var(--color-red-500)]', 'red-500')],
      },
      {
        code: '<div className="bg-white" />',
        filename: 'test.tsx',
        errors: [palette('bg-white', 'white')],
      },
      {
        code: 'cn("p-4 text-red-600")',
        filename: 'test.tsx',
        errors: [palette('text-red-600', 'red-600')],
      },
    ],
  })
})

describe('no-default-palette (shadcn/ui)', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(SHADCN)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  runWithFixture(new RuleTester(), 'no-default-palette (shadcn)', noDefaultPalette, SHADCN, {
    valid: [
      { code: '<div className="bg-primary text-primary-foreground" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="bg-red-500" />',
        filename: 'test.tsx',
        errors: [
          palette(
            'bg-red-500',
            'red-500',
            'accent, accent-foreground, background, border, card, card-foreground, chart-1, chart-2, chart-3, chart-4, chart-5, destructive (+19 more)',
          ),
        ],
      },
    ],
  })
})

describe('no-default-palette (stock Tailwind: the palette is the design system)', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(DEFAULT)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  runWithFixture(new RuleTester(), 'no-default-palette (default)', noDefaultPalette, DEFAULT, {
    valid: [{ code: '<div className="bg-red-500 text-white" />', filename: 'test.tsx' }],
    invalid: [],
  })
})

describe('no-default-palette (no entry point)', () => {
  beforeAll(() => {
    resetDesignSystem()
  })

  new RuleTester().run('no-default-palette (no DS)', noDefaultPalette, {
    valid: [],
    invalid: [
      {
        code: '<div className="bg-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'designSystemUnavailable' }],
      },
    ],
  })
})
