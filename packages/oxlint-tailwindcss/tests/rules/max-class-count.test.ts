import { RuleTester } from 'oxlint/plugins-dev'
import { maxClassCount } from '../../src/rules/max-class-count'

const ruleTester = new RuleTester()

// Default max=20
ruleTester.run('max-class-count', maxClassCount, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="p-4 m-2 text-red-500" />', filename: 'test.tsx' },
    { code: 'cn("flex", "items-center p-4")', filename: 'test.tsx' },
    // Exactly 20 classes (at the limit)
    {
      code: '<div className="flex items-center p-4 m-2 bg-white text-black rounded shadow border w-full h-10 gap-2 justify-between font-bold text-sm overflow-hidden cursor-pointer transition duration-200" />',
      filename: 'test.tsx',
    },
  ],
  invalid: [
    // 21 classes — over the default max of 20
    {
      code: '<div className="flex items-center p-4 m-2 bg-white text-black rounded shadow border w-full h-10 gap-2 justify-between font-bold text-sm overflow-hidden cursor-pointer transition duration-200 opacity-50 z-10" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'tooMany' }],
    },
  ],
})

// Custom max=5
ruleTester.run('max-class-count (max: 5)', maxClassCount, {
  valid: [
    {
      code: '<div className="flex items-center p-4 m-2 gap-2" />',
      filename: 'test.tsx',
      options: [{ max: 5 }],
    },
  ],
  invalid: [
    {
      code: '<div className="flex items-center p-4 m-2 gap-2 w-full" />',
      filename: 'test.tsx',
      options: [{ max: 5 }],
      errors: [{ messageId: 'tooMany' }],
    },
  ],
})

/**
 * A template literal is ONE class string: the parts around `${}` are added
 * together. They used to be counted one quasi at a time, so a 6-class template
 * split by one expression read as two strings of 3. A class glued to an
 * expression (`bg-${c}-500`) is one class, and a bare `${x}` is not counted —
 * its value is unknown statically.
 *
 * Separate `cn()` arguments and `cva()`/`tv()` values stay separate: they are
 * often conditional or alternatives, so adding them up would report class lists
 * that never apply together.
 */
ruleTester.run('max-class-count — template literals', maxClassCount, {
  valid: [
    // `a-${x}-b` is one class: 3 in total, not 4.
    { code: 'const className = `a-${x}-b c d`', filename: 'test.tsx', options: [{ max: 3 }] },
    {
      code: 'const className = `bg-${c}-500 p-4 m-2`',
      filename: 'test.tsx',
      options: [{ max: 3 }],
    },
    // A bare expression is not a class the rule can count.
    { code: 'const className = `${base} p-4`', filename: 'test.tsx', options: [{ max: 1 }] },
    {
      code: '<div className={`${a} ${b} flex`} />',
      filename: 'test.tsx',
      options: [{ max: 1 }],
    },
    // Arguments and variant values are counted one by one (see above).
    { code: "const x = cn('a b c', 'd e f')", filename: 'test.tsx', options: [{ max: 4 }] },
    {
      code: "const x = cn('a b c', cond ? 'd e f' : 'g h i')",
      filename: 'test.tsx',
      options: [{ max: 4 }],
    },
    {
      code: "const b = cva('a b c', { variants: { size: { sm: 'd e f', lg: 'g h i' } } })",
      filename: 'test.tsx',
      options: [{ max: 4 }],
    },
  ],
  invalid: [
    {
      code: 'const className = `a b c ${x} d e f`',
      filename: 'test.tsx',
      options: [{ max: 4 }],
      // Reported once, for the whole template.
      errors: [{ messageId: 'tooMany', data: { count: '6', max: '4' } }],
    },
    {
      code: '<div className={`a b c ${x ? "p-4" : ""} d e f`} />',
      filename: 'test.tsx',
      options: [{ max: 4 }],
      errors: [{ messageId: 'tooMany', data: { count: '6', max: '4' } }],
    },
    {
      // `x-${a}` and `${b}-y` are two classes; the lone space quasi between the
      // expressions is not glue.
      code: 'const className = `x-${a} ${b}-y`',
      filename: 'test.tsx',
      options: [{ max: 1 }],
      errors: [{ messageId: 'tooMany', data: { count: '2', max: '1' } }],
    },
    {
      code: 'const x = tw`a b ${x} c`',
      filename: 'test.tsx',
      options: [{ max: 2 }],
      errors: [{ messageId: 'tooMany', data: { count: '3', max: '2' } }],
    },
    {
      code: 'const x = cn(`a b ${x} c`)',
      filename: 'test.tsx',
      options: [{ max: 2 }],
      errors: [{ messageId: 'tooMany', data: { count: '3', max: '2' } }],
    },
  ],
})

// The examples the docs print, verbatim.
ruleTester.run('max-class-count — documented examples', maxClassCount, {
  valid: [
    {
      code: 'cn("flex items-center", "p-4 m-2 gap-2")',
      filename: 'test.tsx',
      options: [{ max: 4 }],
    },
  ],
  invalid: [
    {
      // packages/oxlint-tailwindcss/README.md
      code: `<div
  className="flex items-center justify-between p-4 m-2 bg-white text-black
  rounded shadow border w-full h-10 gap-2 font-bold text-sm overflow-hidden
  cursor-pointer transition duration-200 opacity-50 z-10"
/>`,
      filename: 'test.tsx',
      errors: [{ messageId: 'tooMany', data: { count: '21', max: '20' } }],
    },
    {
      // packages/docs/rules/_extras/max-class-count.md
      code: '<div className={`flex items-center p-4 ${gap} m-2 bg-${tone}-500 w-full`} />',
      filename: 'test.tsx',
      options: [{ max: 5 }],
      errors: [{ messageId: 'tooMany', data: { count: '6', max: '5' } }],
    },
  ],
})
