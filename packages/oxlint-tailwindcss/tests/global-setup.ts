/**
 * Vitest global setup — pre-warms the design system disk cache for every fixture
 * entry point used across the suite.
 *
 * Without this, each test file cold-loads its fixture on first use (~2.5s on
 * Linux/macOS, much slower on Windows). Many files doing that in parallel
 * saturates the runner and, on Windows, pushed `beforeAll` hooks past the
 * hook timeout. Loading them ONCE here, sequentially, means every test file
 * hits the warm disk cache (<500ms) and no per-file hook races a cold compute.
 *
 * `vitest.config.ts` gives each invocation its OWN cache dir
 * (`OXLINT_TAILWINDCSS_CACHE_DIR`), so two concurrent runs never share cache
 * files and race on them (the `canonicalize-persistence` flake). A private dir
 * is cold every run, though, so we keep a persistent, test-only PRECOMPUTE seed
 * dir and copy JUST these read-only fixtures' `<hash>.json` in at setup (cold
 * compute → cache hit) and back out at teardown. Scoping the seed to the fixed
 * FIXTURES list is deliberate: the cache-behaviour tests (content-cache,
 * precompute-worker, sync-loader) drive their OWN uniquely-named or
 * unique-content fixtures and assert hit/miss/invalidation on them, so seeding
 * anything but these shared read-only fixtures would leak cache state between
 * concurrent runs and break exactly those assertions. Runs stay hermetic yet the
 * expensive Tailwind compile of the common fixtures is reused.
 */

import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { cacheArtifactPaths, loadDesignSystemSync } from '../src/design-system/sync-loader'

// Persistent, test-only precompute cache shared across sequential runs. Kept
// apart from the real per-uid oxlint cache dir so tests never touch a
// developer's real cache, and only ever holds the FIXTURES' `<hash>.json`.
const SEED_DIR = join(tmpdir(), 'oxlint-tw-test-precompute-seed')

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
  'unrelated-theme-vars.css',
  'with-custom-variants.css',
  'with-shadcn-variants.css',
  'with-marker-variant.css',
  'with-foreign-vars.css',
  'axis-namespaces.css',
  'custom-utility.css',
  'open-value-utility.css',
  'with-prefix-utility.css',
  'with-imported-theme.css',
]

/**
 * Copy one file, publishing it atomically (tmp + rename) so a concurrent reader
 * never sees a torn file. Content-addressed names mean a same-hash collision is
 * byte-identical, so last-writer-wins is safe. Best-effort — a missing source
 * (fixture never precomputed, cold first run) copies nothing.
 */
function publishCopy(src: string, dest: string): void {
  const tmp = `${dest}.seed-${process.pid}.tmp`
  try {
    mkdirSync(dirname(dest), { recursive: true, mode: 0o700 })
    copyFileSync(src, tmp)
    renameSync(tmp, dest)
  } catch {
    try {
      rmSync(tmp, { force: true })
    } catch {
      // tmp never created.
    }
  }
}

/**
 * Move the FIXTURES' precompute artifacts between this run's private cache dir
 * and the shared seed dir. `direction: 'seed'` copies seed → run dir (before
 * pre-warm, so the sequential loads below are cache hits); `'persist'` copies
 * run dir → seed (at teardown, so the next run starts warm). Scoped strictly to
 * the fixed FIXTURES so no unique-content test fixture is ever shared.
 */
function moveFixtureCache(direction: 'seed' | 'persist'): void {
  for (const fixture of FIXTURES) {
    let runJson: string
    try {
      // In-run path (CACHE_DIR === this run's private dir via the env override).
      runJson = cacheArtifactPaths(resolve(__dirname, 'fixtures', fixture)).json
    } catch {
      continue // fixture unreadable / engine unresolved — skip.
    }
    const seedJson = join(SEED_DIR, basename(runJson))
    if (direction === 'seed') publishCopy(seedJson, runJson)
    else publishCopy(runJson, seedJson)
  }
}

export function setup() {
  // Seed this run's private cache dir with the fixtures' precompute from prior
  // runs, turning the sequential pre-warm below into cache hits. No-op on the
  // first-ever run (empty seed) and on CI (fresh runner).
  if (process.env.OXLINT_TAILWINDCSS_CACHE_DIR) moveFixtureCache('seed')

  for (const fixture of FIXTURES) {
    try {
      loadDesignSystemSync(resolve(__dirname, 'fixtures', fixture))
    } catch {
      // Leave it cold; the owning test will report the real failure.
    }
  }
}

/**
 * Clean up the run's cache artifacts.
 *
 * `vitest.config.ts` gives each invocation its OWN cache dir (name-prefixed
 * `oxlint-tw-{test,bench}-cache-`), so the whole dir is ours to remove. Before
 * removing it we copy the fixtures' precompute back into the shared seed dir so
 * the next run starts warm. The name guard means we NEVER remove the real
 * per-uid cache dir, so if the override is somehow absent (running vitest
 * without this config), we fall back to the precise `.canon-*` cleanup that only
 * touches this suite's fixture artifacts and leaves a developer's real-project
 * caches in the same tmpdir untouched.
 */
export function teardown() {
  const runDir = process.env.OXLINT_TAILWINDCSS_CACHE_DIR
  if (runDir && /^oxlint-tw-(test|bench)-cache-/.test(basename(runDir))) {
    moveFixtureCache('persist') // warm the seed for the next run
    rmSync(runDir, { recursive: true, force: true })
    return
  }

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
