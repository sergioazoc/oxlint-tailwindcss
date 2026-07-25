import { RuleTester } from 'oxlint/plugins-dev'
import { noHardcodedColors } from '../../src/rules/no-hardcoded-colors'

const ruleTester = new RuleTester()

// Default: all hardcoded colors flagged
ruleTester.run('no-hardcoded-colors', noHardcodedColors, {
  valid: [
    { code: '<div className="bg-blue-500 text-white" />', filename: 'test.tsx' },
    { code: '<div className="w-[200px]" />', filename: 'test.tsx' },
    { code: '<div className="h-[calc(100%-2rem)]" />', filename: 'test.tsx' },
    { code: '<div className="tracking-[0.5em]" />', filename: 'test.tsx' },
    // CSS variable is NOT a hardcoded color
    { code: '<div className="bg-[var(--primary)]" />', filename: 'test.tsx' },
    // CSS variable wrapped in a color function (e.g. theme tokens stored as
    // raw channels) is not hardcoded.
    { code: '<div className="bg-[hsl(var(--primary))]" />', filename: 'test.tsx' },
    { code: '<div className="text-[hsla(var(--fg),0.8)]" />', filename: 'test.tsx' },
    { code: '<div className="border-[rgb(var(--border))]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[rgb(var(--r),var(--g),var(--b))]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[rgba(var(--bg),0.5)]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[oklch(var(--bg))]" />', filename: 'test.tsx' },
    { code: '<div className="text-[lab(var(--fg))]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[lch(var(--bg))]" />', filename: 'test.tsx' },
    { code: '<div className="border-[hwb(var(--border))]" />', filename: 'test.tsx' },
    {
      code: '<div className="text-[color(display-p3_var(--r)_var(--g)_var(--b))]" />',
      filename: 'test.tsx',
    },
    // var() with fallback containing a color literal — still references a variable
    { code: '<div className="bg-[var(--primary,#fff)]" />', filename: 'test.tsx' },
    // Nested gradient stops are outside this rule's non-recursive scope.
    { code: '<div className="bg-[linear-gradient(hsl(var(--a)),#fff)]" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="bg-[#ff5733]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="text-[#000]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="bg-[rgb(255,0,0)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="border-[rgba(0,0,0,0.5)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="text-[hsl(120,100%,50%)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="hover:bg-[#ff5733]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // Important modifier with hardcoded color
    {
      code: '<div className="!bg-[#ff5733]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // oklch
    {
      code: '<div className="bg-[oklch(0.5_0.2_240)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // oklab
    {
      code: '<div className="text-[oklab(0.5_0.1_-0.1)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // hwb
    {
      code: '<div className="border-[hwb(120_10%_20%)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
  ],
})

// With allow list
ruleTester.run('no-hardcoded-colors (allow)', noHardcodedColors, {
  valid: [
    {
      code: '<div className="bg-[#000]" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-[#000]'] }],
    },
  ],
  invalid: [
    {
      code: '<div className="bg-[#fff]" />',
      filename: 'test.tsx',
      options: [{ allow: ['bg-[#000]'] }],
      errors: [{ messageId: 'noHardcoded' }],
    },
  ],
})

/**
 * Colours the anchored regexes and the prefix list used to miss.
 *
 * The value was only matched from its first character, so a colour anywhere else
 * in it passed; and the utility had to be on a hand-written list of
 * "colour-bearing prefixes", which had `ring` but not `inset-ring` and no way to
 * spell an arbitrary property.
 */
new RuleTester().run('no-hardcoded-colors (value scan)', noHardcodedColors, {
  valid: [
    // A quoted string is text, not a colour.
    { code: `<div className="content-['#fff']" />`, filename: 'test.tsx' },
    { code: `<div className="after:content-['#000']" />`, filename: 'test.tsx' },
    // `url(#id)` is an SVG reference — the most common `#` that isn't a colour.
    { code: '<div className="fill-[url(#gradient)]" />', filename: 'test.tsx' },
    { code: '<div className="mask-[url(#mask)]" />', filename: 'test.tsx' },
    { code: '<div className="bg-[url(/img.png)]" />', filename: 'test.tsx' },
    // Still exempt: a variable reference is design-system indirection.
    { code: '<div className="bg-[var(--brand)]" />', filename: 'test.tsx' },
    { code: '<div className="shadow-[0_1px_2px_var(--shadow)]" />', filename: 'test.tsx' },
    // Non-colour arbitrary values are untouched.
    { code: '<div className="w-[200px] tracking-[0.5em]" />', filename: 'test.tsx' },
    { code: '<div className="grid-cols-[18rem_1fr]" />', filename: 'test.tsx' },
    // Not a valid hex length.
    { code: '<div className="w-[#12345]" />', filename: 'test.tsx' },
  ],
  invalid: [
    // The colour is in the middle of the value.
    {
      code: '<div className="shadow-[0_1px_2px_#000]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="shadow-[inset_0_0_4px_rgb(0_0_0/0.5)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // Utilities the prefix list didn't have.
    {
      code: '<div className="inset-ring-[#000]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="inset-shadow-[#000]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // Arbitrary properties, which no prefix could ever match.
    {
      code: '<div className="[color:#f00]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    {
      code: '<div className="[--brand:#f00]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
    // A colour inside a gradient the value merely contains.
    {
      code: '<div className="bg-[linear-gradient(#fff,#000)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'noHardcoded' }],
    },
  ],
})
