import { beforeEach, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noDuplicateClasses } from '../../src/rules/no-duplicate-classes'
import { resetExtractorConfig } from '../../src/utils/extractors'

beforeEach(() => {
  resetExtractorConfig()
})

const ruleTester = new RuleTester()

ruleTester.run('no-duplicate-classes', noDuplicateClasses, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="flex hover:flex" />', filename: 'test.tsx' },
    // Same utility different variants is NOT a duplicate
    { code: '<div className="flex hover:flex dark:flex" />', filename: 'test.tsx' },
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
    // Duplicate with variant
    {
      code: '<div className="hover:flex hover:flex items-center" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }],
      output: '<div className="hover:flex items-center" />',
    },
    // Triple duplicate
    {
      code: '<div className="flex flex flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'duplicate' }, { messageId: 'duplicate' }],
      output: '<div className="flex" />',
    },
  ],
})

// --- Custom extractor configuration via settings ---

describe('custom extractor settings', () => {
  const settingsTester = new RuleTester()

  // Custom attributes
  settingsTester.run('no-duplicate-classes (custom attributes)', noDuplicateClasses, {
    valid: [
      // Without custom settings, xyzClassName is ignored
      { code: '<div xyzClassName="flex flex" />', filename: 'test.tsx' },
    ],
    invalid: [
      // With custom attribute, duplicates are detected
      {
        code: '<div xyzClassName="flex flex items-center" />',
        filename: 'test.tsx',
        settings: { tailwindcss: { attributes: ['xyzClassName'] } },
        errors: [{ messageId: 'duplicate' }],
        output: '<div xyzClassName="flex items-center" />',
      },
    ],
  })

  // Custom callees
  settingsTester.run('no-duplicate-classes (custom callees)', noDuplicateClasses, {
    valid: [
      // Without custom settings, myHelper is ignored
      { code: 'myHelper("flex flex")', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: 'myHelper("flex flex items-center")',
        filename: 'test.tsx',
        settings: { tailwindcss: { callees: ['myHelper'] } },
        errors: [{ messageId: 'duplicate' }],
        output: 'myHelper("flex items-center")',
      },
    ],
  })

  // Object values in JSX attributes
  settingsTester.run('no-duplicate-classes (object values in JSX)', noDuplicateClasses, {
    valid: [
      {
        code: '<div classNames={{ root: "flex items-center" }} />',
        filename: 'test.tsx',
        settings: { tailwindcss: { attributes: ['classNames'] } },
      },
    ],
    invalid: [
      {
        code: '<div classNames={{ root: "flex flex items-center" }} />',
        filename: 'test.tsx',
        settings: { tailwindcss: { attributes: ['classNames'] } },
        errors: [{ messageId: 'duplicate' }],
        output: '<div classNames={{ root: "flex items-center" }} />',
      },
      // Multiple slots with duplicates in each
      {
        code: '<div classNames={{ root: "flex flex", label: "p-2 p-2" }} />',
        filename: 'test.tsx',
        settings: { tailwindcss: { attributes: ['classNames'] } },
        errors: [{ messageId: 'duplicate' }, { messageId: 'duplicate' }],
        output: '<div classNames={{ root: "flex", label: "p-2" }} />',
      },
      // Ternary expression in object value
      {
        code: '<div classNames={{ root: isActive ? "flex flex" : "block" }} />',
        filename: 'test.tsx',
        settings: { tailwindcss: { attributes: ['classNames'] } },
        errors: [{ messageId: 'duplicate' }],
        output: '<div classNames={{ root: isActive ? "flex" : "block" }} />',
      },
      // Logical expression in object value
      {
        code: '<div classNames={{ root: isActive && "flex flex" }} />',
        filename: 'test.tsx',
        settings: { tailwindcss: { attributes: ['classNames'] } },
        errors: [{ messageId: 'duplicate' }],
        output: '<div classNames={{ root: isActive && "flex" }} />',
      },
    ],
  })

  // Custom tags
  settingsTester.run('no-duplicate-classes (custom tags)', noDuplicateClasses, {
    valid: [
      // Without custom settings, css tag is ignored
      { code: 'css`flex flex`', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: 'css`flex flex items-center`',
        filename: 'test.tsx',
        settings: { tailwindcss: { tags: ['css'] } },
        errors: [{ messageId: 'duplicate' }],
        output: 'css`flex items-center`',
      },
    ],
  })

  // Custom variable patterns
  settingsTester.run('no-duplicate-classes (custom variablePatterns)', noDuplicateClasses, {
    valid: [
      // Without custom settings, twStyles is ignored
      { code: 'const twStyles = "flex flex"', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: 'const twStyles = "flex flex items-center"',
        filename: 'test.tsx',
        settings: { tailwindcss: { variablePatterns: ['^tw'] } },
        errors: [{ messageId: 'duplicate' }],
        output: 'const twStyles = "flex items-center"',
      },
    ],
  })

  // Exclude defaults
  settingsTester.run('no-duplicate-classes (exclude variablePatterns)', noDuplicateClasses, {
    valid: [
      // With exclude, "style" variable is no longer detected
      {
        code: 'const style = "flex flex"',
        filename: 'test.tsx',
        settings: { tailwindcss: { exclude: { variablePatterns: ['^styles?$'] } } },
      },
      // "styles" also excluded
      {
        code: 'const styles = "flex flex"',
        filename: 'test.tsx',
        settings: { tailwindcss: { exclude: { variablePatterns: ['^styles?$'] } } },
      },
    ],
    invalid: [
      // className still detected (not excluded)
      {
        code: 'const className = "flex flex"',
        filename: 'test.tsx',
        settings: { tailwindcss: { exclude: { variablePatterns: ['^styles?$'] } } },
        errors: [{ messageId: 'duplicate' }],
        output: 'const className = "flex"',
      },
    ],
  })

  settingsTester.run('no-duplicate-classes (exclude callees)', noDuplicateClasses, {
    valid: [
      // With exclude, objstr is no longer detected
      {
        code: 'objstr("flex flex")',
        filename: 'test.tsx',
        settings: { tailwindcss: { exclude: { callees: ['objstr'] } } },
      },
    ],
    invalid: [
      // cn still detected (not excluded)
      {
        code: 'cn("flex flex")',
        filename: 'test.tsx',
        settings: { tailwindcss: { exclude: { callees: ['objstr'] } } },
        errors: [{ messageId: 'duplicate' }],
        output: 'cn("flex")',
      },
    ],
  })

  settingsTester.run('no-duplicate-classes (exclude attributes)', noDuplicateClasses, {
    valid: [
      // With exclude, "class" attribute is no longer detected
      {
        code: '<div class="flex flex" />',
        filename: 'test.tsx',
        settings: { tailwindcss: { exclude: { attributes: ['class'] } } },
      },
    ],
    invalid: [
      // className still detected (not excluded)
      {
        code: '<div className="flex flex" />',
        filename: 'test.tsx',
        settings: { tailwindcss: { exclude: { attributes: ['class'] } } },
        errors: [{ messageId: 'duplicate' }],
        output: '<div className="flex" />',
      },
    ],
  })
})

// --- tw-classed support ---

describe('tw-classed support', () => {
  const classedTester = new RuleTester()

  classedTester.run('no-duplicate-classes (classed)', noDuplicateClasses, {
    valid: [
      // First arg (element type) is skipped
      { code: 'classed("button", "flex items-center")', filename: 'test.tsx' },
      // Component reference as first arg
      { code: 'classed(Button, "flex items-center")', filename: 'test.tsx' },
      // Config object with no duplicates
      {
        code: 'classed("div", { variants: { size: { sm: "p-2", lg: "p-4" } } })',
        filename: 'test.tsx',
      },
    ],
    invalid: [
      // Duplicate in class string (element type "button" NOT flagged)
      {
        code: 'classed("button", "flex flex items-center")',
        filename: 'test.tsx',
        errors: [{ messageId: 'duplicate' }],
        output: 'classed("button", "flex items-center")',
      },
      // Duplicate in variant value
      {
        code: 'classed("div", { variants: { size: { sm: "p-2 p-2" } } })',
        filename: 'test.tsx',
        errors: [{ messageId: 'duplicate' }],
        output: 'classed("div", { variants: { size: { sm: "p-2" } } })',
      },
      // Duplicate in compoundVariants
      {
        code: 'classed("div", { compoundVariants: [{ class: "p-2 p-2" }] })',
        filename: 'test.tsx',
        errors: [{ messageId: 'duplicate' }],
        output: 'classed("div", { compoundVariants: [{ class: "p-2" }] })',
      },
      // Component ref as first arg, duplicate in second
      {
        code: 'classed(Button, "flex flex")',
        filename: 'test.tsx',
        errors: [{ messageId: 'duplicate' }],
        output: 'classed(Button, "flex")',
      },
    ],
  })
})
