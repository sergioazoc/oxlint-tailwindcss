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
      // Child/descendant selectors with arbitrary variants must preserve order
      { code: '<div className="*:[a]:underline" />', filename: 'test.tsx' },
      { code: '<div className="**:[div]:flex" />', filename: 'test.tsx' },
      { code: '<div className="*:[svg:not([class*=size-])]:size-6" />', filename: 'test.tsx' },
      { code: '<div className="*:[img:first-child]:rounded-t-sm" />', filename: 'test.tsx' },
      // Pseudo-elements must stay after element-selecting variants (#12)
      { code: '<div className="[&>svg]:before:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="[&>*[data-role=user]]:after:right-0" />', filename: 'test.tsx' },
      { code: '<div className="[&_p]:after:underline" />', filename: 'test.tsx' },
      { code: '<div className="[&:nth-child(2)]:before:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="has-[.active]:before:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="not-[.disabled]:after:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="aria-expanded:after:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="data-[state=open]:before:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="open:before:text-red-500" />', filename: 'test.tsx' },
      // Triple variants: pseudo-element stays innermost
      { code: '<div className="sm:[&>svg]:after:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="hover:[&>svg]:before:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="dark:has-[.active]:before:text-red-500" />', filename: 'test.tsx' },
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
      // Pseudo-element incorrectly before element-selecting variant (#12)
      {
        code: '<div className="before:[&>svg]:text-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="[&>svg]:before:text-red-500" />',
      },
      {
        code: '<div className="after:has-[.active]:text-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="has-[.active]:after:text-red-500" />',
      },
      {
        code: '<div className="before:aria-expanded:text-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="aria-expanded:before:text-red-500" />',
      },
      {
        code: '<div className="before:open:text-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="open:before:text-red-500" />',
      },
      {
        code: '<div className="sm:after:[&>svg]:text-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="sm:[&>svg]:after:text-red-500" />',
      },
      // Multiple misordered variants in same string
      {
        code: '<div className="hover:sm:flex focus:md:block" />',
        filename: 'test.tsx',
        errors: [
          { messageId: 'wrongOrder' },
          {
            messageId: 'wrongOrder',
            suggestions: [
              {
                messageId: 'suggestReplace',
                data: { className: 'focus:md:block', replacement: 'md:focus:block' },
                output: '<div className="sm:hover:flex md:focus:block" />',
              },
            ],
          },
        ],
        output: '<div className="sm:hover:flex md:focus:block" />',
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
      // Child/descendant selectors with arbitrary variants must preserve order (DS)
      { code: '<div className="*:[a]:underline" />', filename: 'test.tsx' },
      { code: '<div className="**:[[cmdk-group-heading]]:px-2" />', filename: 'test.tsx' },
      // Pseudo-elements must stay after element-selecting variants in DS mode (#12)
      { code: '<div className="[&>svg]:before:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="has-[.active]:after:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="aria-expanded:before:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="data-[state=open]:after:text-red-500" />', filename: 'test.tsx' },
      // Pseudo-elements stay innermost even when DS puts them early
      { code: '<div className="hover:before:text-red-500" />', filename: 'test.tsx' },
      { code: '<div className="sm:after:text-red-500" />', filename: 'test.tsx' },
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
      // Pseudo-element incorrectly before element-selecting variant (DS mode)
      {
        code: '<div className="before:[&>svg]:text-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="[&>svg]:before:text-red-500" />',
      },
      {
        code: '<div className="before:hover:text-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="hover:before:text-red-500" />',
      },
      {
        code: '<div className="after:data-[state=open]:text-red-500" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="data-[state=open]:after:text-red-500" />',
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
