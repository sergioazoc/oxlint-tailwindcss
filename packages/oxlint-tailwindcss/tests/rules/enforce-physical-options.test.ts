/**
 * Options matrix for `enforce-physical` (and its mirror `enforce-logical`).
 *
 * v1 added `allowlist` (regex patterns to bypass conversion) and `direction`
 * ('inline' | 'block' | 'both') to bring the rule into shape-parity with
 * enforce-logical. This file pins down both options.
 */

import { RuleTester } from 'oxlint/plugins-dev'
import { enforcePhysical } from '../../src/rules/enforce-physical'
import { enforceLogical } from '../../src/rules/enforce-logical'

const ruleTester = new RuleTester()

ruleTester.run('enforce-physical (allowlist)', enforcePhysical, {
  valid: [
    // `^ms-` matches `ms-4` and exempts it from conversion.
    {
      code: '<div className="ms-4" />',
      filename: 'test.tsx',
      options: [{ allowlist: ['^ms-'] }],
    },
    // Multiple patterns
    {
      code: '<div className="ms-4 me-2 ps-1" />',
      filename: 'test.tsx',
      options: [{ allowlist: ['^ms-', '^me-', '^ps-'] }],
    },
    // Allowlist also bypasses variant-prefixed forms when the regex matches the
    // whole class string.
    {
      code: '<div className="hover:ms-4" />',
      filename: 'test.tsx',
      options: [{ allowlist: ['^hover:ms-'] }],
    },
  ],
  invalid: [
    // Allowlist for ONE prefix; another logical class still converts.
    {
      code: '<div className="ms-4 pe-2" />',
      filename: 'test.tsx',
      options: [{ allowlist: ['^ms-'] }],
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className="ms-4 pr-2" />',
    },
    // Invalid regex in allowlist is silently skipped, behavior continues.
    {
      code: '<div className="ms-4" />',
      filename: 'test.tsx',
      options: [{ allowlist: ['(unclosed'] }],
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className="ml-4" />',
    },
  ],
})

ruleTester.run('enforce-physical (direction)', enforcePhysical, {
  valid: [
    // Every current mapping is inline-axis, so `direction: 'block'` keeps the
    // rule silent on every class it would otherwise flag.
    { code: '<div className="ms-4" />', filename: 'test.tsx', options: [{ direction: 'block' }] },
    { code: '<div className="pe-2" />', filename: 'test.tsx', options: [{ direction: 'block' }] },
    {
      code: '<div className="start-0 end-0" />',
      filename: 'test.tsx',
      options: [{ direction: 'block' }],
    },
  ],
  invalid: [
    // Explicit `direction: 'inline'` matches the current default mappings.
    {
      code: '<div className="ms-4" />',
      filename: 'test.tsx',
      options: [{ direction: 'inline' }],
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className="ml-4" />',
    },
    // `direction: 'both'` (the default) behaves identically to the un-optioned form.
    {
      code: '<div className="pe-2" />',
      filename: 'test.tsx',
      options: [{ direction: 'both' }],
      errors: [{ messageId: 'usePhysical' }],
      output: '<div className="pr-2" />',
    },
  ],
})

ruleTester.run('enforce-logical (allowlist)', enforceLogical, {
  valid: [
    {
      code: '<div className="ml-4" />',
      filename: 'test.tsx',
      options: [{ allowlist: ['^ml-'] }],
    },
  ],
  invalid: [
    {
      code: '<div className="ml-4 pr-2" />',
      filename: 'test.tsx',
      options: [{ allowlist: ['^ml-'] }],
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="ml-4 pe-2" />',
    },
  ],
})

ruleTester.run('enforce-logical (direction)', enforceLogical, {
  valid: [
    { code: '<div className="ml-4" />', filename: 'test.tsx', options: [{ direction: 'block' }] },
  ],
  invalid: [
    {
      code: '<div className="ml-4" />',
      filename: 'test.tsx',
      options: [{ direction: 'inline' }],
      errors: [{ messageId: 'useLogical' }],
      output: '<div className="ms-4" />',
    },
  ],
})
