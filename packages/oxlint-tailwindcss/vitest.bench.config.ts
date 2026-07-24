import { defineConfig } from 'vitest/config'

/**
 * Benchmarks run under their own config.
 *
 * The default config excludes `tests/benchmarks/**` so a bare `vitest run` (CI,
 * IDE) doesn't pick them up — but a CLI path filter does NOT override that
 * exclude, and `--exclude` appends to it rather than replacing it. So
 * `vitest run tests/benchmarks` matched nothing and the `bench` script had been
 * silently reporting "No test files found" instead of measuring anything.
 */
export default defineConfig({
  test: {
    globals: true,
    globalSetup: './tests/global-setup.ts',
    include: ['tests/benchmarks/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
