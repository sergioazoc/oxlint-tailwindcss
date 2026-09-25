import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
export const DIST_CJS = resolve(ROOT, 'dist/index.cjs')

function newestMtime(dir: string): number {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const mtime = entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs
    if (mtime > newest) newest = mtime
  }
  return newest
}

/**
 * e2e tests drive the real oxlint binary against the BUILT plugin. Run against a
 * dist older than src and they silently test yesterday's code — `pnpm test`
 * alone (a Claude Code Stop hook, an editor runner) never rebuilds. Fail loud.
 */
export function assertFreshDist(): void {
  let distMtime: number
  try {
    distMtime = statSync(DIST_CJS).mtimeMs
  } catch {
    throw new Error('dist/index.cjs not found. Run `pnpm build` first.')
  }
  if (newestMtime(resolve(ROOT, 'src')) > distMtime) {
    throw new Error('dist/index.cjs is older than src/. Run `pnpm build` before the e2e tests.')
  }
}
