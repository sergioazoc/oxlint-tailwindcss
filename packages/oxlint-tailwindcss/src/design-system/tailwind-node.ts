/**
 * Resolves the Tailwind engine (`@tailwindcss/node`) the plugin runs against.
 *
 * Two layers:
 *
 * 1. **Bundled fallback** — `TAILWIND_NODE_PATH` / `TAILWIND_NODE_VERSION`,
 *    resolved ONCE at module load from the plugin's own location. This is the
 *    copy shipped as a dependency; used only when the consumer's engine can't
 *    be found.
 * 2. **Per-entry-point resolution** — `resolveTailwindNodeFor(cssPath)`
 *    resolves the engine from the CONSUMER's project (the `node_modules` around
 *    the resolved CSS entry point), so the linter analyzes with the same
 *    Tailwind the build compiles with (issue #114). Memoized per CSS directory;
 *    a pure function of the on-disk module topology, so every layer
 *    (precompute, live worker services, disk-cache key) that is handed the same
 *    `cssPath` independently agrees on the same engine — no cross-layer
 *    threading required.
 *
 * Versions are read from the resolved entry's `package.json` (walk-up
 * fallback for unconventional layouts).
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

function tryResolveFrom(specifier: string, fromDir: string): string | null {
  try {
    return require.resolve(specifier, { paths: [fromDir] })
  } catch {
    return null
  }
}

function realpathOr(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/**
 * Read the `version` from the `package.json` for `name`, starting at
 * `dirname(entryPath)` and walking up a few levels (packages ship their entry
 * as `dist/index.{cjs,mjs}` next to the `package.json`, but layouts vary).
 * The `pkg.name === name` guard backstops a wrong `package.json` found mid-walk
 * (e.g. through a pnpm symlink). Returns `'unknown'` if nothing matches.
 */
function readVersionFromEntry(entryPath: string, name: string): string {
  let dir = dirname(entryPath)
  for (let i = 0; i < 5; i++) {
    const pkgJson = join(dir, 'package.json')
    if (existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8')) as {
          name?: string
          version?: string
        }
        if (pkg.name === name && pkg.version) return pkg.version
      } catch {
        // try next level
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return 'unknown'
}

// The plugin's own copy, resolved from this module's context (the createRequire
// shim in the built output supports this without a `paths` anchor).
const bundledEntry = resolveBundledEntry()

function resolveBundledEntry(): string | null {
  try {
    return require.resolve('@tailwindcss/node')
  } catch {
    return null
  }
}

/**
 * Absolute entry of the plugin's own bundled `@tailwindcss/node`, or `null`
 * if not installed. Used as the last-resort fallback by
 * `resolveTailwindNodeFor` and passed to workers, which resolve the bare
 * specifier from a tmp-dir `eval` context (where it would otherwise fail).
 */
export const TAILWIND_NODE_PATH: string | null = bundledEntry

/**
 * Installed version of the plugin's bundled `@tailwindcss/node`, or
 * `'unknown'`. This is the version the plugin was built and tested against;
 * `engine-guard` uses it as the "tested ceiling".
 */
export const TAILWIND_NODE_VERSION: string =
  bundledEntry !== null ? readVersionFromEntry(bundledEntry, '@tailwindcss/node') : 'unknown'

const BUILD_TOOL_SPECIFIERS = [
  '@tailwindcss/postcss',
  '@tailwindcss/vite',
  '@tailwindcss/cli',
] as const

/**
 * The real directories of the consumer's Tailwind build tools, resolved from
 * the CSS dir. Under pnpm's strict layout `@tailwindcss/node` is only a
 * transitive dep (not symlinked into the package's `node_modules`), so it is
 * unreachable from the CSS dir directly — but it IS reachable from the build
 * tool's own real directory. `realpathSync` follows the pnpm symlink to the
 * virtual store before we resolve `@tailwindcss/node` relative to it.
 */
function buildToolAnchorDirs(cssDir: string): string[] {
  const dirs: string[] = []
  for (const spec of BUILD_TOOL_SPECIFIERS) {
    const entry = tryResolveFrom(spec, cssDir)
    if (entry) dirs.push(dirname(realpathOr(entry)))
  }
  return dirs
}

export interface TailwindNodeResolution {
  /** Absolute entry of the chosen `@tailwindcss/node`, or `null` if not even the bundled copy resolves. */
  nodePath: string | null
  /** Version of `nodePath`, or `'unknown'`. The engine the plugin will run (== `E`). Disk-cache discriminator. */
  nodeVersion: string
  /** Version of the consumer's `tailwindcss` resolved from the CSS dir, or `'unknown'` (== `B`). Drift-guard input. */
  buildVersion: string
  /** True when the chosen engine is the plugin's bundled copy rather than one from the consumer's tree. */
  usedBundled: boolean
}

const resolutionCache = new Map<string, TailwindNodeResolution>()

/**
 * Resolve the Tailwind engine to run for a given resolved CSS entry point,
 * anchored on the consumer's project. Memoized per CSS directory.
 *
 * Cascade:
 * 1. `buildVersion` (B) — the consumer's `tailwindcss` resolved from the CSS
 *    dir. Always a direct dep, so it resolves under npm (hoisted) and pnpm
 *    (symlinked into the package). `'unknown'` if the project has no Tailwind.
 * 2. `nodePath` (E) — the first `@tailwindcss/node` resolvable from
 *    `[cssDir, ...buildToolAnchorDirs]`, preferring the copy whose version
 *    equals `buildVersion` so a hoisted plugin copy can't shadow the
 *    consumer's engine (R2). Falls back to the bundled copy.
 *
 * Never throws; degrades to `'unknown'` / bundled so the version guard (not
 * this function) owns the fail-loud decision.
 */
export function resolveTailwindNodeFor(cssPath: string): TailwindNodeResolution {
  const cssDir = dirname(resolve(cssPath))
  const cached = resolutionCache.get(cssDir)
  if (cached) return cached

  const twEntry = tryResolveFrom('tailwindcss', cssDir)
  const buildVersion = twEntry ? readVersionFromEntry(twEntry, 'tailwindcss') : 'unknown'

  const candidates: string[] = []
  for (const dir of [cssDir, ...buildToolAnchorDirs(cssDir)]) {
    const found = tryResolveFrom('@tailwindcss/node', dir)
    if (!found) continue
    const real = realpathOr(found)
    if (!candidates.includes(real)) candidates.push(real)
  }

  let nodePath: string | null = null
  if (buildVersion !== 'unknown') {
    nodePath =
      candidates.find((c) => readVersionFromEntry(c, '@tailwindcss/node') === buildVersion) ?? null
  }
  if (nodePath === null) nodePath = candidates[0] ?? null
  if (nodePath === null) nodePath = TAILWIND_NODE_PATH

  const usedBundled =
    nodePath !== null &&
    TAILWIND_NODE_PATH !== null &&
    realpathOr(nodePath) === realpathOr(TAILWIND_NODE_PATH)

  const nodeVersion =
    nodePath !== null ? readVersionFromEntry(realpathOr(nodePath), '@tailwindcss/node') : 'unknown'

  const result: TailwindNodeResolution = { nodePath, nodeVersion, buildVersion, usedBundled }
  resolutionCache.set(cssDir, result)
  return result
}

/** Clear the per-directory resolution memo. For test isolation. */
export function resetTailwindNode(): void {
  resolutionCache.clear()
}
