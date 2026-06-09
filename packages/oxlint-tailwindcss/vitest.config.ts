import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './tests/global-setup.ts',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Benchmarks are slow and timing-sensitive — keep them out of the default
    // run so a bare `vitest run` (CI, IDE) doesn't pick them up (TST-M4). The
    // `bench` script overrides this to run them explicitly.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/benchmarks/**'],
  },
})
