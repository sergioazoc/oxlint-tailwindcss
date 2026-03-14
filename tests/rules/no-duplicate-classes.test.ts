import { RuleTester } from 'oxlint/plugins-dev'
import { noDuplicateClasses } from '../../src/rules/no-duplicate-classes'

const ruleTester = new RuleTester()

ruleTester.run('no-duplicate-classes', noDuplicateClasses, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="flex hover:flex" />', filename: 'test.tsx' },
    { code: '<div class="p-4 m-2 text-red-500" />', filename: 'test.tsx' },
    { code: 'cn("flex", "items-center")', filename: 'test.tsx' },
    // cva/tv: defaultVariants should be ignored (not class strings)
    {
      code: 'cva("flex", { defaultVariants: { size: "sm" } })',
      filename: 'test.tsx',
    },
    // tv: slot keys are not classes
    {
      code: 'tv({ slots: { header: "p-2", body: "p-4" } })',
      filename: 'test.tsx',
    },
    // twJoin: no duplicates
    { code: 'twJoin("flex", "items-center")', filename: 'test.tsx' },
    // Variable: name doesn't match pattern
    { code: 'const foo = "flex flex"', filename: 'test.tsx' },
    // Variable: valid classes
    { code: 'const className = "flex items-center"', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="flex flex items-center" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: '<div className="flex items-center" />',
    },
    {
      code: '<div className="p-4 m-2 p-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: '<div className="p-4 m-2" />',
    },
    {
      code: 'cn("flex flex items-center")',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'cn("flex items-center")',
    },
    // cva: duplicate in base string
    {
      code: 'cva("flex flex", {})',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'cva("flex", {})',
    },
    // cva: duplicate in variant value
    {
      code: 'cva("flex", { variants: { size: { sm: "p-2 p-2" } } })',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'cva("flex", { variants: { size: { sm: "p-2" } } })',
    },
    // cva: duplicate in compoundVariants
    {
      code: 'cva("flex", { compoundVariants: [{ class: "p-2 p-2" }] })',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'cva("flex", { compoundVariants: [{ class: "p-2" }] })',
    },
    // tv: duplicate in base
    {
      code: 'tv({ base: "flex flex" })',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'tv({ base: "flex" })',
    },
    // tv: duplicate in slot value
    {
      code: 'tv({ slots: { header: "p-2 p-2" } })',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'tv({ slots: { header: "p-2" } })',
    },
    // tv: duplicate in variant string value
    {
      code: 'tv({ variants: { size: { sm: "p-2 p-2" } } })',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'tv({ variants: { size: { sm: "p-2" } } })',
    },
    // tv: duplicate in variant with slot object
    {
      code: 'tv({ variants: { size: { sm: { header: "p-2 p-2" } } } })',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'tv({ variants: { size: { sm: { header: "p-2" } } } })',
    },
    // tv: duplicate in compoundSlots
    {
      code: 'tv({ compoundSlots: [{ class: "p-2 p-2" }] })',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'tv({ compoundSlots: [{ class: "p-2" }] })',
    },
    // twJoin: duplicate
    {
      code: 'twJoin("flex flex items-center")',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'twJoin("flex items-center")',
    },
    // Variable detection: duplicate in className variable
    {
      code: 'const className = "flex flex items-center"',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: 'const className = "flex items-center"',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex flex items-center ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: '<div className={`flex items-center ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} flex flex`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: '<div className={`${base} flex`} />',
    },
  ],
})
