/**
 * Vitest global setup — pre-warms the design system disk cache for every fixture
 * entry point used across the suite.
 *
 * Without this, each test file cold-loads its fixture on first use (~2.5s on
 * Linux/macOS, much slower on Windows). Many files doing that in parallel
 * saturates the runner and, on Windows, pushed `beforeAll` hooks past the
 * hook timeout. Loading them ONCE here, sequentially, means every test file
 * hits the warm disk cache (<500ms) and no per-file hook races a cold compute.
 */

import { readdirSync, rmSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { cacheArtifactPaths, loadDesignSystemSync } from '../src/design-system/sync-loader'

// Every fixture used as an entry point by the suite. Pre-warming a fixture that
// isn't a valid entry point would throw, so each load is isolated — a failure
// here must not block the rest (the test that owns it will surface it).
const FIXTURES = [
  'default.css',
  'shadcn.css',
  'with-components.css',
  'with-typography.css',
  'custom-theme.css',
  'with-letter-spacing.css',
  'with-prefix.css',
  'with-prefix-components.css',
  'with-tailwindcss-animate.css',
  'with-tw-animate-css.css',
]

export function setup() {
  for (const fixture of FIXTURES) {
    try {
      loadDesignSystemSync(resolve(__dirname, 'fixtures', fixture))
    } catch {
      // Leave it cold; the owning test will report the real failure.
    }
  }
}

/**
 * Remove the `.canon-*` cache files that rule tests (any suite that
 * canonicalizes a fixture) leave in the shared, per-uid cache dir. Scoped
 * precisely to fixture artifacts so a developer's real-project canon caches in
 * the same tmpdir are never touched. Prevents cross-run cache-state leakage.
 */
export function teardown() {
  for (const fixture of FIXTURES) {
    try {
      const { json } = cacheArtifactPaths(resolve(__dirname, 'fixtures', fixture))
      const dir = dirname(json)
      const canonPrefix = basename(json).replace(/\.json$/, '.canon-')
      for (const name of readdirSync(dir)) {
        if (name.startsWith(canonPrefix)) rmSync(resolve(dir, name), { force: true })
      }
    } catch {
      // Fixture never canonicalized (no artifact) or dir gone — nothing to clean.
    }
  }
}
