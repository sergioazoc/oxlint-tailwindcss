import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './tests/global-setup.ts',
    // Generous timeouts: Windows runners are markedly slower at the worker-thread
    // design-system load / worker-service init, and the disk cache + sort/
    // canonicalize workers aren't free to spin up. 60s guards against a hang
    // without flaking on a slow-but-working cold path.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Benchmarks are slow and timing-sensitive — keep them out of the default
    // run so a bare `vitest run` (CI, IDE) doesn't pick them up (TST-M4). The
    // `bench` script overrides this to run them explicitly.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/benchmarks/**'],
  },
})
