/**
 * Regression test for the pnpm strict-workspaces bug.
 *
 * Under pnpm strict hoisting, the consumer's project root has no direct
 * access to `@tailwindcss/node` (it lives under
 * node_modules/.pnpm/oxlint-tailwindcss@…/node_modules). The child process
 * spawned by sync-loader.ts runs with cwd set to the CSS file's directory,
 * and Node's bare-specifier resolution would walk up from there — never
 * finding the module.
 *
 * The fix passes the absolute path resolved from the plugin's own install
 * location through env (TAILWIND_NODE_PATH) and the script requires that
 * path directly. This file locks the fix down with two guards:
 *
 *   1. Static — the precompute script uses `process.env.TAILWIND_NODE_PATH`
 *      and not a bare `require('@tailwindcss/node')`.
 *   2. Functional — `node -e "require(absolutePath)"` works from a cwd that
 *      has no node_modules at all, proving the resolution technique is
 *      sound regardless of the child's working directory.
 *
 * A full pnpm-workspace e2e test would require materializing a workspace
 * with `.pnpm/`-style nested deps; that's out of scope for this suite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

describe('pnpm strict workspace isolation', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oxlint-tw-pnpm-'))
  })

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Non-fatal
    }
  })

  it('PRECOMPUTE_SCRIPT requires @tailwindcss/node via env-passed absolute path', () => {
    // Catches accidental regressions where someone re-introduces the bare
    // specifier in the script.
    const source = readFileSync(
      resolve(__dirname, '../../src/design-system/sync-loader.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/require\(['"]@tailwindcss\/node['"]\)/)
    expect(source).toMatch(/require\(process\.env\.TAILWIND_NODE_PATH\)/)
  })

  it('node -e can require @tailwindcss/node by absolute path from an isolated cwd', () => {
    // Resolve from the plugin's own location (this is what loadDesignSystemSync does).
    const tailwindNodePath = require.resolve('@tailwindcss/node')

    // Spawn `node -e` with cwd in a tmp dir that has no node_modules.
    // Without the fix, a bare `require('@tailwindcss/node')` would fail with
    // MODULE_NOT_FOUND here. With the absolute path, it works.
    const script = `
      const tw = require(process.env.TAILWIND_NODE_PATH);
      process.stdout.write(typeof tw.__unstable__loadDesignSystem);
    `
    const out = execFileSync(process.execPath, ['-e', script], {
      cwd: tmpDir,
      encoding: 'utf-8',
      env: { ...process.env, TAILWIND_NODE_PATH: tailwindNodePath },
    })

    expect(out).toBe('function')
  })

  it('node -e DOES fail when the script uses a bare specifier from an isolated cwd', () => {
    // Negative control — proves the test setup actually isolates the child
    // (so the positive test above is meaningful, not a tautology).
    const script = `require('@tailwindcss/node')`
    expect(() =>
      execFileSync(process.execPath, ['-e', script], {
        cwd: tmpDir,
        encoding: 'utf-8',
        // Strip NODE_PATH so the child has no fallback resolution path.
        env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_PATH')),
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    ).toThrow(/Cannot find module|MODULE_NOT_FOUND/)
  })
})
