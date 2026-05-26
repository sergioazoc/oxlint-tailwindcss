/**
 * Single source of truth for the resolved `@tailwindcss/node` entry path
 * and its installed version. Three call sites (sync-loader, sort-service,
 * canonicalize-service) used to each call `require.resolve` independently
 * — this module resolves once at load and exposes the results.
 *
 * The version is read from `dist/../package.json` (the published layout)
 * with a walk-up fallback for unconventional installs.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function resolveTailwindNodePath(): string | null {
  try {
    return require.resolve('@tailwindcss/node')
  } catch {
    return null
  }
}

function readVersionFromEntry(entryPath: string): string {
  // `@tailwindcss/node` ships as `dist/index.{cjs,mjs}` next to a package.json.
  // Walk up at most a few levels in case the layout differs.
  let dir = dirname(entryPath)
  for (let i = 0; i < 5; i++) {
    const pkgJson = join(dir, 'package.json')
    if (existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8')) as {
          name?: string
          version?: string
        }
        if (pkg.name === '@tailwindcss/node' && pkg.version) return pkg.version
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

const entryPath = resolveTailwindNodePath()

/**
 * Absolute path to `@tailwindcss/node`'s main entry, or `null` if not
 * installed. Workers receive this path via workerData; the parent does
 * the resolution because module resolution from a child process's `eval`
 * context (with cwd inside a tmp dir or under pnpm strict workspaces) can
 * fail to find the bare specifier.
 */
export const TAILWIND_NODE_PATH: string | null = entryPath

/**
 * Installed `@tailwindcss/node` version, or `'unknown'`. Used as part of
 * the disk-cache key in sync-loader so cached precompute output is
 * invalidated when the consumer upgrades.
 */
export const TAILWIND_NODE_VERSION: string =
  entryPath !== null ? readVersionFromEntry(entryPath) : 'unknown'
