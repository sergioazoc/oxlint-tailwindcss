/**
 * `no-arbitrary-value` vs `enforce-consistent-variable-syntax`.
 *
 * `bg-(--x)` is sugar for `bg-[var(--x)]` — the same arbitrary value, spelled two
 * ways. `no-arbitrary-value` only looked for brackets, so it reported one and not
 * the other, and `enforce-consistent-variable-syntax` (whose whole job is to
 * convert between the two) turned that into a laundry service: with the default
 * `shorthand` setting its autofix rewrote the reported form into the unreported one
 * and the violation disappeared with the code unchanged in substance.
 *
 * Both forms report now, which is what makes the two rules composable: whichever
 * syntax the project settles on, the arbitrary value is still an arbitrary value.
 */

import { RuleTester } from 'oxlint/plugins-dev'
import { noArbitraryValue } from '../../src/rules/no-arbitrary-value'
import { enforceConsistentVariableSyntax } from '../../src/rules/enforce-consistent-variable-syntax'

const ruleTester = new RuleTester()

ruleTester.run('no-arbitrary-value (both spellings)', noArbitraryValue, {
  valid: [
    { code: '<div className="bg-red-500 p-4" />', filename: 'test.tsx' },
    // Arbitrary VARIANTS are not arbitrary values — the selector is not a value.
    { code: '<div className="[&>svg]:flex" />', filename: 'test.tsx' },
    { code: '<div className="supports-[display:grid]:flex" />', filename: 'test.tsx' },
    // The `allow` option still works on both spellings.
    {
      code: '<div className="bg-(--brand)" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-'] }],
    },
  ],
  invalid: [
    {
      code: '<div className="bg-[var(--brand)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
    // The form that used to slip through.
    {
      code: '<div className="bg-(--brand)" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
    {
      code: '<div className="border-(length:--stroke)" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }],
    },
    {
      code: '<div className="hover:bg-(--brand) w-[200px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noArbitrary' }, { messageId: 'noArbitrary' }],
    },
  ],
})

// The conversion itself is unchanged. Asserted here so the pair is readable as one
// story: the class this fix PRODUCES is the class the suite above reports, which is
// the property the two rules have to agree on.
ruleTester.run('enforce-consistent-variable-syntax (unchanged)', enforceConsistentVariableSyntax, {
  valid: [{ code: '<div className="bg-(--brand)" />', filename: 'test.tsx' }],
  invalid: [
    {
      code: '<div className="bg-[var(--brand)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'useShorthand' }],
      output: '<div className="bg-(--brand)" />',
    },
  ],
})
