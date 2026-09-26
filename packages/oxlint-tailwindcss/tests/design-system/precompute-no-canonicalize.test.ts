/**
 * An engine without `canonicalizeCandidates` (Tailwind before 4.1.15, reachable
 * only with `allowUntestedEngine`): the precompute used to die on
 * "ds.canonicalizeCandidates is not a function", taking every DS rule with it.
 * It now skips the two phases that need it — the canonical and v3-rename maps
 * stay empty — and everything else still loads.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDesignSystemSync } from '../../src/design-system/sync-loader'

const REAL_NODE = createRequire(__filename).resolve('@tailwindcss/node')
const REAL_TAILWIND = createRequire(__filename).resolve('tailwindcss/index.css')
let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'oxtw-no-canon-'))
  // The engine the entry point resolves: the real one, minus canonicalizeCandidates.
  const pkg = join(dir, 'node_modules/@tailwindcss/node')
  mkdirSync(pkg, { recursive: true })
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: '@tailwindcss/node', version: '4.1.10', main: 'index.js' }),
  )
  writeFileSync(
    join(pkg, 'index.js'),
    `const real = require(${JSON.stringify(REAL_NODE)});
module.exports = {
  ...real,
  async __unstable__loadDesignSystem(css, opts) {
    const ds = await real.__unstable__loadDesignSystem(css, opts);
    return new Proxy(ds, { get: (t, k) => (k === 'canonicalizeCandidates' ? undefined : Reflect.get(t, k)) });
  },
};`,
  )
  writeFileSync(
    join(dir, 'app.css'),
    `@import '${REAL_TAILWIND}';\n/* no-canon ${process.pid} ${Date.now()} */\n`,
  )
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('an engine without canonicalizeCandidates', () => {
  it('still precomputes, with no canonical or rename map', () => {
    const data = loadDesignSystemSync(join(dir, 'app.css'))
    expect(data.validClasses).toContain('flex')
    expect(data.canonical).toEqual({})
    expect(data.deprecated).toEqual({})
    expect(data.cssDeclarations).toBeDefined()
  })
})
