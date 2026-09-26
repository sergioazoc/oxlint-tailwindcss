import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DIST_CJS } from './dist'

const ROOT = resolve(__dirname, '../../..')
const REAL_OXLINT = resolve(ROOT, 'node_modules/.bin/oxlint')
const ENTRY = resolve(ROOT, 'tests/fixtures/default.css').split('\\').join('/')

export const PLUGIN_SCRIPTS = resolve(ROOT, '../../agent/claude-code/scripts')

/**
 * A project as the Claude Code plugin finds one: its own `node_modules/.bin/oxlint`
 * (a shim to this repo's, on POSIX and Windows alike), an .oxlintrc.json with
 * the built plugin, and `src/`.
 */
export function makeAgentProject(files: Record<string, string>): {
  dir: string
  cleanup: () => void
} {
  const dir = mkdtempSync(join(tmpdir(), 'oxtw-agent-project-'))
  const bin = join(dir, 'node_modules/.bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'oxlint'), `#!/bin/sh\nexec "${REAL_OXLINT}" "$@"\n`)
  chmodSync(join(bin, 'oxlint'), 0o755)
  writeFileSync(join(bin, 'oxlint.cmd'), `@"${REAL_OXLINT}.cmd" %*\r\n`)
  writeFileSync(
    join(dir, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST_CJS.split('\\').join('/')],
      settings: { tailwindcss: { entryPoint: ENTRY } },
      rules: {
        'tailwindcss/no-unknown-classes': 'error',
        'tailwindcss/enforce-sort-order': 'warn',
      },
    }),
  )
  mkdirSync(join(dir, 'src'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'src', name), text)
  // Retries: on Windows, a process that just exited can hold its cwd a moment longer.
  const cleanup = () =>
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  return { dir, cleanup }
}
