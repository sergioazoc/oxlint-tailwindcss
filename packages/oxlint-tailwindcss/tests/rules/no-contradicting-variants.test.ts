import { RuleTester } from 'oxlint/plugins-dev'
import { noContradictingVariants } from '../../src/rules/no-contradicting-variants'

const ruleTester = new RuleTester()

ruleTester.run('no-contradicting-variants', noContradictingVariants, {
  valid: [
    // No variants
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    // Different utilities — not contradicting
    { code: '<div className="text-white dark:text-black" />', filename: 'test.tsx' },
    // Different values for same prefix
    { code: '<div className="bg-white hover:bg-blue-500" />', filename: 'test.tsx' },
    // Only variant classes, no base
    { code: '<div className="hover:flex dark:flex" />', filename: 'test.tsx' },
    // Pseudo-element variants target different elements
    { code: '<div className="absolute after:absolute" />', filename: 'test.tsx' },
    { code: '<div className="rounded-full after:rounded-full" />', filename: 'test.tsx' },
    { code: '<div className="bg-muted after:bg-muted" />', filename: 'test.tsx' },
    { code: '<div className="bg-transparent before:bg-transparent" />', filename: 'test.tsx' },
    { code: '<div className="bg-transparent file:bg-transparent" />', filename: 'test.tsx' },
    { code: '<div className="text-gray-500 placeholder:text-gray-500" />', filename: 'test.tsx' },
    // Arbitrary selectors target different elements
    {
      code: '<div className="outline-none [&>*:focus-visible]:outline-none" />',
      filename: 'test.tsx',
    },
    { code: '<div className="shrink-0 [&>svg]:shrink-0" />', filename: 'test.tsx' },
    { code: '<div className="shrink-0 [&_svg]:shrink-0" />', filename: 'test.tsx' },
    // Child/descendant selectors target different elements
    { code: '<div className="flex *:data-[slot=select-value]:flex" />', filename: 'test.tsx' },
    { code: '<div className="flex *:[span]:last:flex" />', filename: 'test.tsx' },
    // Composition guard (issue #117): "base + variant:same-utility is redundant"
    // only holds for the element's FINAL class list. In a `cn`/`twMerge`
    // fragment or a custom component's `className`, the variant is often
    // load-bearing — it exists to beat a same-group class the component merges
    // in from its own `cva` (another module). These must NOT report.
    // The exact reproduction from the issue:
    {
      code: '<Button className="bg-transparent hover:bg-transparent" />',
      filename: 'test.tsx',
    },
    // Each merge-call argument is analyzed in isolation, so the override
    // fragment `"bg-transparent hover:bg-transparent"` must not be flagged even
    // when the base it defeats sits in a sibling argument.
    {
      code: 'twMerge("rounded hover:bg-accent", "bg-transparent hover:bg-transparent")',
      filename: 'test.tsx',
    },
    { code: 'cn("flex", "flex dark:flex")', filename: 'test.tsx' },
    { code: '<Field.Root className="flex dark:flex" />', filename: 'test.tsx' },
  ],
  invalid: [
    // Base flex + dark:flex → dark:flex is redundant
    {
      code: '<div className="flex dark:flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'redundantVariant' }],
    },
    // Base hidden + hover:hidden
    {
      code: '<div className="hidden hover:hidden" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'redundantVariant' }],
    },
    // Multiple redundant
    {
      code: '<div className="flex hover:flex dark:flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'redundantVariant' }, { messageId: 'redundantVariant' }],
    },
  ],
})
