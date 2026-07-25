import { resolve } from 'node:path'
import { beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noContradictingVariants } from '../../src/rules/no-contradicting-variants'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const CUSTOM = resolve(__dirname, '../fixtures/with-custom-variants.css')

describe('per-rule entryPoint option (no settings at all)', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(CUSTOM)
  })

  new RuleTester().run('ncv via rule option', noContradictingVariants, {
    valid: [
      // Only the DS knows `thumb` targets ::-webkit-slider-thumb. If the rule
      // option were ignored, the static fallback would report this.
      {
        code: '<div className="size-4 thumb:size-4" />',
        filename: 'test.tsx',
        options: [{ entryPoint: CUSTOM }],
      },
      {
        code: '<div className="mt-4 child:mt-4" />',
        filename: 'test.tsx',
        options: [{ entryPoint: CUSTOM }],
      },
    ],
    invalid: [
      // Same code, NO entry point anywhere -> static fallback doesn't know
      // `thumb`, so it reports. This is the control that proves the option
      // above is what changed the outcome.
      {
        code: '<div className="size-4 thumb:size-4" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'redundantVariant' }],
      },
      {
        code: '<div className="mt-4 child:mt-4" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'redundantVariant' }],
      },
      // And the option does not break the ordinary case.
      {
        code: '<div className="flex hover:flex" />',
        filename: 'test.tsx',
        options: [{ entryPoint: CUSTOM }],
        errors: [{ messageId: 'redundantVariant' }],
      },
    ],
  })
})
