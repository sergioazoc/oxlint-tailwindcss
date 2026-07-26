import { resolve } from 'node:path'
import { beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { preferThemeTokens } from '../../src/rules/prefer-theme-tokens'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { runWithFixture } from '../utils/with-fixture'

const ENTRY = resolve(__dirname, '../fixtures/unrelated-theme-vars.css')

describe('prefer-theme-tokens with unrelated variables', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY)
  })

  runWithFixture(new RuleTester(), 'prefer-theme-tokens (unsafe)', preferThemeTokens, ENTRY, {
    valid: [
      // --color-primary is a literal colour, --primary is an unrelated project
      // variable: bg-primary is NOT the same declaration as bg-(--primary).
      { code: '<div className="bg-(--primary)" />', filename: 'test.tsx' },
      { code: '<div className="bg-[var(--primary)]" />', filename: 'test.tsx' },
    ],
    invalid: [],
  })
})

/**
 * The same hazard with the project variable one `@import` away.
 *
 * `definesVar` is what stops the rewrite, and it was scanning only the entry
 * file's text — so moving `:root { --primary: … }` into an imported file (the
 * normal shadcn/ui layout) made the variable read as undefined, and the rule went
 * back to proposing `bg-primary`, silently changing the colour. The precompute
 * scans the entry AND its resolved imports now.
 */
describe('prefer-theme-tokens with variables defined in an @import', () => {
  const IMPORTED = resolve(__dirname, '../fixtures/with-imported-theme.css')

  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(IMPORTED)
  })

  runWithFixture(new RuleTester(), 'prefer-theme-tokens (imported)', preferThemeTokens, IMPORTED, {
    valid: [
      { code: '<div className="bg-(--primary)" />', filename: 'test.tsx' },
      { code: '<div className="bg-[var(--primary)]" />', filename: 'test.tsx' },
    ],
    invalid: [],
  })
})
