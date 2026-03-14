import { resolve } from 'node:path'
import { beforeAll, afterAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { consistentVariantOrder } from '../../src/rules/consistent-variant-order'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

describe('consistent-variant-order (static fallback)', () => {
  beforeAll(() => {
    resetDesignSystem()
  })

  const ruleTester = new RuleTester()

  // Default order
  ruleTester.run('consistent-variant-order', consistentVariantOrder, {
    valid: [
      { code: '<div className="flex items-center" />', filename: 'test.tsx' },
      { code: '<div className="hover:flex" />', filename: 'test.tsx' },
      { code: '<div className="sm:hover:flex" />', filename: 'test.tsx' },
      { code: '<div className="md:focus:bg-blue-500" />', filename: 'test.tsx' },
      { code: '<div className="dark:hover:text-white" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="hover:sm:flex" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="sm:hover:flex" />',
      },
      {
        code: '<div className="hover:dark:text-white" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="dark:hover:text-white" />',
      },
      {
        code: '<div className="focus:md:bg-blue-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="md:focus:bg-blue-500" />',
      },
      // Template literal: preserve trailing space before expression
      {
        code: '<div className={`hover:sm:flex ${x}`} />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className={`sm:hover:flex ${x}`} />',
      },
      // Template literal: preserve leading space after expression
      {
        code: '<div className={`${base} hover:sm:flex`} />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className={`${base} sm:hover:flex`} />',
      },
    ],
  })

  // Custom order: hover before dark (reversed from default)
  ruleTester.run('consistent-variant-order (custom order)', consistentVariantOrder, {
    valid: [
      {
        code: '<div className="hover:dark:text-white" />',
        filename: 'test.tsx',
        options: [{ order: ['hover', 'focus', 'dark'] }],
      },
    ],
    invalid: [
      {
        code: '<div className="dark:hover:text-white" />',
        filename: 'test.tsx',
        options: [{ order: ['hover', 'focus', 'dark'] }],
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="hover:dark:text-white" />',
      },
    ],
  })
})

describe('consistent-variant-order (design system)', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })

  afterAll(() => {
    resetDesignSystem()
  })

  const dsRuleTester = new RuleTester()

  // DS order: hover(39) < sm(50), focus(40) < md(51), hover(39) < dark(59)
  dsRuleTester.run('consistent-variant-order (DS order)', consistentVariantOrder, {
    valid: [
      { code: '<div className="hover:sm:flex" />', filename: 'test.tsx' },
      { code: '<div className="hover:dark:text-white" />', filename: 'test.tsx' },
      { code: '<div className="focus:md:bg-blue-500" />', filename: 'test.tsx' },
      { code: '<div className="hover:flex" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="sm:hover:flex" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="hover:sm:flex" />',
      },
      {
        code: '<div className="md:focus:bg-blue-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="focus:md:bg-blue-500" />',
      },
      {
        code: '<div className="dark:hover:text-white" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="hover:dark:text-white" />',
      },
    ],
  })

  // User-specified order should override DS order
  dsRuleTester.run('consistent-variant-order (user order overrides DS)', consistentVariantOrder, {
    valid: [
      {
        code: '<div className="sm:hover:flex" />',
        filename: 'test.tsx',
        options: [{ order: ['sm', 'md', 'hover', 'focus', 'dark'] }],
      },
    ],
    invalid: [
      {
        code: '<div className="hover:sm:flex" />',
        filename: 'test.tsx',
        options: [{ order: ['sm', 'md', 'hover', 'focus', 'dark'] }],
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="sm:hover:flex" />',
      },
    ],
  })
})
