import { RuleTester } from 'oxlint/plugins-dev'
import { noUnnecessaryWhitespace } from '../../src/rules/no-unnecessary-whitespace'

const ruleTester = new RuleTester()

ruleTester.run('no-unnecessary-whitespace', noUnnecessaryWhitespace, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="p-4" />', filename: 'test.tsx' },
    { code: 'cn("flex items-center")', filename: 'test.tsx' },
    // Template literals: spaces at expression boundaries are necessary
    { code: '<div className={`flex ${x}`} />', filename: 'test.tsx' },
    { code: '<div className={`${x} flex`} />', filename: 'test.tsx' },
    { code: '<div className={`flex ${x} items-center`} />', filename: 'test.tsx' },
    {
      code: '<div className={`grid transition-all ease-in-out ${cond ? "a" : "b"}`} />',
      filename: 'test.tsx',
    },
  ],
  invalid: [
    {
      code: '<div className="  flex   items-center  " />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryWhitespace' }],
      output: '<div className="flex items-center" />',
    },
    {
      code: '<div className="flex  items-center" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryWhitespace' }],
      output: '<div className="flex items-center" />',
    },
    {
      code: 'cn("  flex  ")',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryWhitespace' }],
      output: 'cn("flex")',
    },
    // Template literals: normalize internal whitespace but preserve boundary spaces
    {
      code: '<div className={`flex  items-center ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryWhitespace' }],
      output: '<div className={`flex items-center ${x}`} />',
    },
    {
      code: '<div className={`${x}  flex  items-center`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unnecessaryWhitespace' }],
      output: '<div className={`${x} flex items-center`} />',
    },
  ],
})
