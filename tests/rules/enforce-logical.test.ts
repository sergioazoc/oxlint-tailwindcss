import { RuleTester } from 'oxlint/plugins-dev'
import { enforceLogical } from '../../src/rules/enforce-logical'

const ruleTester = new RuleTester()

ruleTester.run('enforce-logical', enforceLogical, {
  valid: [
    { code: '<div className="ms-4" />', filename: 'test.tsx' },
    { code: '<div className="me-4" />', filename: 'test.tsx' },
    { code: '<div className="ps-4 pe-4" />', filename: 'test.tsx' },
    { code: '<div className="start-0 end-0" />', filename: 'test.tsx' },
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="ml-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="ms-4" />',
    },
    {
      code: '<div className="mr-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="me-4" />',
    },
    {
      code: '<div className="pl-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="ps-4" />',
    },
    {
      code: '<div className="pr-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="pe-4" />',
    },
    {
      code: '<div className="left-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="start-0" />',
    },
    {
      code: '<div className="right-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="end-0" />',
    },
    {
      code: '<div className="hover:ml-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="hover:ms-4" />',
    },
    {
      code: '<div className="border-l-2" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="border-s-2" />',
    },
    // Multiple physical properties in same string
    {
      code: '<div className="ml-4 mr-4 flex" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }, { messageId: 'useLogical' }],
      output: '<div className="ms-4 me-4 flex" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex ml-4 ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className={`flex ms-4 ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} ml-4`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useLogical' }],
      output: '<div className={`${base} ms-4`} />',
    },
  ],
})
