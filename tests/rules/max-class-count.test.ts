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
