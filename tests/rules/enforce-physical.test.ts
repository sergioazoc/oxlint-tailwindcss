import { RuleTester } from 'oxlint/plugins-dev'
import { enforcePhysical } from '../../src/rules/enforce-physical'
import { PHYSICAL_TO_LOGICAL } from '../../src/rules/enforce-logical'

const ruleTester = new RuleTester()

ruleTester.run('enforce-physical', enforcePhysical, {
  valid: [
    { code: '<div className="ml-4" />', filename: 'test.tsx' },
    { code: '<div className="mr-4" />', filename: 'test.tsx' },
    { code: '<div className="pl-4 pr-4" />', filename: 'test.tsx' },
    { code: '<div className="left-0 right-0" />', filename: 'test.tsx' },
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
  ],
  invalid: [
    // Generated from PHYSICAL_TO_LOGICAL (inverted) — every entry is covered
    ...Object.entries(PHYSICAL_TO_LOGICAL).map(([physical, logical]) => {
      const suffix = logical.includes('start') || logical.includes('end') ? '-0' : '-4'
      return {
        code: `<div className="${logical}${suffix}" />`,
        filename: 'test.tsx',
        errors: [{ messageId: 'usePhysical' as const }],
        output: `<div className="${physical}${suffix}" />`,
      }
    }),
    // With variant
    {
      code: '<div className="hover:ms-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className="hover:ml-4" />',
    },
    // Multiple logical properties in same string
    {
      code: '<div className="ms-4 me-4 flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }, { messageId: 'usePhysical' }],
      output: '<div className="ml-4 mr-4 flex" />',
    },
    // ! important modifier
    {
      code: '<div className="!ms-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className="!ml-4" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex ms-4 ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className={`flex ml-4 ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} ms-4`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className={`${base} ml-4`} />',
    },
  ],
})
