/**
 * Guard for per-file configuration.
 *
 * A rule's `createOnce` context serves every file of a worker, but options and
 * settings belong to each file (`overrides`, nested `.oxlintrc.json`). The bug
 * this guards against was a rule reading `safeSettings(context)` once into a
 * closure variable (`_rem` in enforce-canonical and prefer-scale-token), or
 * memoizing `context.options` forever — first file wins. RuleTester can't see
 * it: it runs `createOnce` again for every case. `tests/e2e/per-file-config`
 * catches it end to end; this catches the pattern at the source, for rules that
 * don't exist yet too.
 *
 * Rules read options and settings ONLY through the per-file helpers:
 * `createLazyOptions`, `createLazySettings`, `createLazyLoader` and the
 * extractor visitors.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RULES_DIR = resolve(__dirname, '../../src/rules')
const DIRECT_READ = /\bsafeOptions\s*\(|\bsafeSettings\s*\(|\bcontext\s*\.\s*(options|settings)\b/

describe('rules read options and settings per file', () => {
  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.ts'))

  it('finds the rules', () => {
    expect(files.length).toBeGreaterThanOrEqual(24)
  })

  it.each(files)('%s goes through the per-file helpers', (file) => {
    const offenders = readFileSync(resolve(RULES_DIR, file), 'utf8')
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
      .filter(([, line]) => DIRECT_READ.test(line))
      .map(([n, line]) => `${file}:${n}: ${line.trim()}`)
    expect(offenders).toEqual([])
  })
})
