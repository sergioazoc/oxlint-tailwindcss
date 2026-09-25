import { defineConfig } from 'vitest/config'

// Tests of the docs site's own scripts (the rule-page generator) and of the
// markdown it publishes. The rule registry comes from the built plugin, so
// `pnpm build` must run first — as it does in the repo's gate and in CI.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
