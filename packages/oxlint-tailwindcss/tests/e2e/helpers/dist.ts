import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
export const DIST_CJS = resolve(ROOT, 'dist/index.cjs')
/** `oxlint-tailwindcss/config` (#218), both formats. */
export const DIST_CONFIG_CJS = resolve(ROOT, 'dist/config.cjs')
export const DIST_CONFIG_MJS = resolve(ROOT, 'dist/config.mjs')

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
  const srcMtime = newestMtime(resolve(ROOT, 'src'))
  for (const file of [DIST_CJS, DIST_CONFIG_CJS, DIST_CONFIG_MJS]) {
    const name = file.slice(ROOT.length + 1)
    let distMtime: number
    try {
      distMtime = statSync(file).mtimeMs
    } catch {
      throw new Error(`${name} not found. Run \`pnpm build\` first.`)
    }
    if (srcMtime > distMtime) {
      throw new Error(`${name} is older than src/. Run \`pnpm build\` before the e2e tests.`)
    }
  }
}
