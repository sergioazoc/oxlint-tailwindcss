import { relative, resolve } from 'node:path'
import { afterAll, beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noBorrowedComponentStyles } from '../../src/rules/no-borrowed-component-styles'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

const SHADCN = resolve(__dirname, '../fixtures/shadcn.css')
const UI = resolve(__dirname, '../fixtures/components/ui')
const components = [{ components: [UI] }]
const fileOf = (name: string) => relative(process.cwd(), resolve(UI, name)).split('\\').join('/')

const borrowed = (
  tag: string,
  component: string,
  file: string,
  shared: number,
  total = shared,
) => ({
  messageId: 'borrowedStyles',
  data: { tag, component, shared: String(shared), total: String(total), file: fileOf(file) },
})

describe('no-borrowed-component-styles', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(SHADCN)
  })
  afterAll(() => {
    resetDesignSystem()
  })

  runWithFixture(
    new RuleTester(),
    'no-borrowed-component-styles',
    noBorrowedComponentStyles,
    SHADCN,
    {
      valid: [
        // Using the components is the point.
        {
          code: '<Button className="mt-4 w-full">Buy</Button>',
          filename: 'page.tsx',
          options: components,
        },
        { code: '<Card className="p-8 shadow-xl" />', filename: 'page.tsx', options: components },
        // Layout only.
        {
          code: '<div className="flex items-center gap-2 p-4" />',
          filename: 'page.tsx',
          options: components,
        },
        // The shape of a Button in another color is another style.
        {
          code: '<div className="rounded-md bg-muted px-4 py-2 text-sm font-medium h-9" />',
          filename: 'page.tsx',
          options: components,
        },
        // No color in common: nothing says it is the design system's.
        {
          code: '<button className="rounded-md text-sm font-medium h-9 px-4 py-2" />',
          filename: 'page.tsx',
          options: components,
        },
        // Text styles alone are any text, not a component: not MenuLabel's,
        // whose style has no box, and not Button's without its background.
        {
          code: '<div className="line-clamp-1 truncate px-2 py-1.5 text-sm font-medium text-foreground" />',
          filename: 'page.tsx',
          options: components,
        },
        {
          code: '<span className="h-9 px-4 py-2 text-sm font-medium text-primary-foreground" />',
          filename: 'page.tsx',
          options: components,
        },
        // A few shared declarations are a coincidence.
        {
          code: '<p className="bg-primary text-primary-foreground" />',
          filename: 'page.tsx',
          options: components,
        },
        // The component's own file.
        {
          code: '<button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground h-9" />',
          filename: resolve(UI, 'button.tsx'),
          options: components,
        },
        // Nothing to compare against.
        {
          code: '<button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground h-9" />',
          filename: 'page.tsx',
        },
      ],
      invalid: [
        {
          // Copied from the component.
          code: '<button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground hover:bg-primary/90 h-9">Buy</button>',
          filename: 'page.tsx',
          options: components,
          errors: [borrowed('button', 'Button', 'button.tsx', 9)],
        },
        {
          // Rewritten: another order, pl/pr for px, and on an <a>.
          code: '<a className="bg-primary text-primary-foreground pl-4 pr-4 py-2 h-9 rounded-md text-sm font-medium">Buy</a>',
          filename: 'page.tsx',
          options: components,
          errors: [borrowed('a', 'Button', 'button.tsx', 9)],
        },
        {
          code: '<button className="rounded-md border bg-background shadow-xs h-9 px-4 py-2 text-sm font-medium" />',
          filename: 'page.tsx',
          options: components,
          errors: [borrowed('button', 'Button variant="outline"', 'button.tsx', 11)],
        },
        {
          code: '<div className="rounded-xl border bg-card py-6 text-card-foreground shadow-sm">Plan</div>',
          filename: 'page.tsx',
          options: components,
          errors: [borrowed('div', 'Card', 'card.tsx', 7)],
        },
        {
          code: '<span className="inline-flex items-center rounded-md border border-transparent bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">New</span>',
          filename: 'page.tsx',
          options: components,
          errors: [borrowed('span', 'Badge', 'badge.tsx', 11)],
        },
        {
          // Classes from cn() count too.
          code: '<div className={cn("rounded-xl border bg-card", "py-6 text-card-foreground shadow-sm")} />',
          filename: 'page.tsx',
          options: components,
          errors: [borrowed('div', 'Card', 'card.tsx', 7)],
        },
      ],
    },
  )
})

describe('no-borrowed-component-styles without a design system', () => {
  new RuleTester().run('no-borrowed-component-styles', noBorrowedComponentStyles, {
    valid: [
      // No components configured: nothing to load.
      { code: '<button className="rounded-md bg-primary h-9" />', filename: 'page.tsx' },
    ],
    invalid: [
      {
        code: '<button className="rounded-md bg-primary h-9" />',
        filename: 'page.tsx',
        options: components,
        errors: [{ messageId: 'designSystemUnavailable' }],
      },
    ],
  })
})
