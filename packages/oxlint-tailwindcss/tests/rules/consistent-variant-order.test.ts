import { resolve } from 'node:path'
import { beforeAll, afterAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { consistentVariantOrder } from '../../src/rules/consistent-variant-order'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

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
      // R-A2: state variants must NOT cross a selector barrier — these target
      // different elements depending on order, so both orderings are valid and
      // must be left untouched (no reordering hover ↔ [&>svg] / * / **).
      { code: '<div className="hover:[&>svg]:w-4" />', filename: 'test.tsx' },
      { code: '<div className="[&>svg]:hover:w-4" />', filename: 'test.tsx' },
      { code: '<div className="hover:*:flex" />', filename: 'test.tsx' },
      { code: '<div className="*:hover:flex" />', filename: 'test.tsx' },
      { code: '<div className="focus:**:underline" />', filename: 'test.tsx' },
      // What the element is (aria-*, data-*, has-*, not-*) before how it's being
      // used and where it sits — shadcn/ui writes it this way (data-*:focus 17–0,
      // data-*:first 21–0, has-*:hover 4–0 at 98a1fe67).
      {
        code: '<div className="data-[state=open]:hover:bg-accent" />',
        filename: 'test.tsx',
      },
      { code: '<div className="data-[spacing=0]:first:rounded-l-md" />', filename: 'test.tsx' },
      { code: '<div className="has-[>a,>button]:hover:bg-muted" />', filename: 'test.tsx' },
      { code: '<div className="dark:aria-invalid:ring-destructive/40" />', filename: 'test.tsx' },
      { code: '<div className="md:peer-data-[variant=inset]:m-2" />', filename: 'test.tsx' },
      {
        code: '<div className="group-data-[collapsible=icon]:hover:bg-sidebar" />',
        filename: 'test.tsx',
      },
      { code: '<div className="rtl:group-data-open:rotate-180" />', filename: 'test.tsx' },
      { code: '<div className="starting:open:opacity-0" />', filename: 'test.tsx' },
      // `not-X` ranks as X.
      { code: '<div className="not-sm:hover:flex" />', filename: 'test.tsx' },
      { code: '<div className="hover:not-first:mt-2" />', filename: 'test.tsx' },
      // Variants that share a rank keep the order they were written in.
      { code: '<div className="data-[a]:data-[b]:flex" />', filename: 'test.tsx' },
      { code: '<div className="data-[b]:data-[a]:flex" />', filename: 'test.tsx' },
      { code: '<div className="aria-invalid:data-[a]:flex" />', filename: 'test.tsx' },
      { code: '<div className="sm:max-lg:flex" />', filename: 'test.tsx' },
      { code: '<div className="max-lg:sm:flex" />', filename: 'test.tsx' },
      // A variant the rule has no rank for (a project's own) is never moved and
      // nothing moves across it.
      { code: '<div className="style-x:md:flex" />', filename: 'test.tsx' },
      { code: '<div className="md:style-x:flex" />', filename: 'test.tsx' },
      { code: '<div className="hover:style-x:sm:flex" />', filename: 'test.tsx' },
      // Without a design system a project's breakpoint is just an unknown name.
      { code: '<div className="hover:3xl:flex" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="hover:data-[state=open]:bg-accent" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="data-[state=open]:hover:bg-accent" />',
      },
      {
        code: '<div className="first:data-[spacing=0]:rounded-l-md" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="data-[spacing=0]:first:rounded-l-md" />',
      },
      {
        code: '<div className="aria-invalid:dark:ring-destructive/40" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="dark:aria-invalid:ring-destructive/40" />',
      },
      {
        // shadcn/ui's drawer writes this one attribute-first (7 of 8 times).
        code: '<div className="data-[vaul-drawer-direction=right]:sm:max-w-sm" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="sm:data-[vaul-drawer-direction=right]:max-w-sm" />',
      },
      {
        code: '<div className="hover:group-data-[collapsible=offcanvas]:bg-sidebar" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="group-data-[collapsible=offcanvas]:hover:bg-sidebar" />',
      },
      {
        code: '<div className="open:starting:opacity-0" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="starting:open:opacity-0" />',
      },
      {
        code: '<div className="hover:not-sm:flex" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="not-sm:hover:flex" />',
      },
      {
        // Ranked variants still sort on each side of an unranked one.
        code: '<div className="hover:sm:style-x:focus:md:flex" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="sm:hover:style-x:md:focus:flex" />',
      },
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

  // The same order as without a design system: the DS only says which variants
  // are pseudo-elements, which change the target, and which are breakpoints.
  runWithFixture(
    dsRuleTester,
    'consistent-variant-order (design system)',
    consistentVariantOrder,
    ENTRY_POINT,
    {
      valid: [
        { code: '<div className="sm:hover:flex" />', filename: 'test.tsx' },
        { code: '<div className="dark:hover:text-white" />', filename: 'test.tsx' },
        { code: '<div className="md:focus:bg-blue-500" />', filename: 'test.tsx' },
        { code: '<div className="hover:flex" />', filename: 'test.tsx' },
        { code: '<div className="data-[state=open]:hover:bg-accent" />', filename: 'test.tsx' },
        { code: '<div className="dark:aria-invalid:ring-destructive/40" />', filename: 'test.tsx' },
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
          code: '<div className="hover:sm:flex" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'wrongOrder' }],
          output: '<div className="sm:hover:flex" />',
        },
        {
          code: '<div className="focus:md:bg-blue-500" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'wrongOrder' }],
          output: '<div className="md:focus:bg-blue-500" />',
        },
        {
          code: '<div className="hover:dark:text-white" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'wrongOrder' }],
          output: '<div className="dark:hover:text-white" />',
        },
        {
          code: '<div className="focus:data-[variant=destructive]:ring-destructive/20" />',
          filename: 'test.tsx',
          errors: [{ messageId: 'wrongOrder' }],
          output: '<div className="data-[variant=destructive]:focus:ring-destructive/20" />',
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
    },
  )

  // User-specified order overrides the built-in one, with a DS too
  dsRuleTester.run('consistent-variant-order (user order overrides DS)', consistentVariantOrder, {
    valid: [
      {
        code: '<div className="hover:sm:flex" />',
        filename: 'test.tsx',
        options: [{ order: ['hover', 'focus', 'sm', 'md'] }],
      },
    ],
    invalid: [
      {
        code: '<div className="sm:hover:flex" />',
        filename: 'test.tsx',
        options: [{ order: ['hover', 'focus', 'sm', 'md'] }],
        errors: [{ messageId: 'wrongOrder' }],
        output: '<div className="hover:sm:flex" />',
      },
    ],
  })
})
