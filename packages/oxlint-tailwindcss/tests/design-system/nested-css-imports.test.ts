/**
 * H26: the classes and variables a project's own CSS defines are read through
 * its local @imports at any depth (up to 4, the depth the cache key already
 * covers), not only the files the entry point imports directly. A class in a
 * stylesheet imported by an imported stylesheet — plain or in
 * `@layer components` — used to be reported as unknown.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDesignSystemSync } from '../../src/design-system/sync-loader'

const TAILWIND = createRequire(__filename).resolve('tailwindcss/index.css').split('\\').join('/')
let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'oxtw-nested-'))
  mkdirSync(join(dir, 'styles/parts'), { recursive: true })
  writeFileSync(
    join(dir, 'app.css'),
    `@import '${TAILWIND}';\n@import './styles/one.css';\n.entry-class { color: red; }\n/* ${process.pid} ${Date.now()} */\n`,
  )
  writeFileSync(
    join(dir, 'styles/one.css'),
    `@import './parts/two.css';\n.one-class { color: red; }\n`,
  )
  writeFileSync(
    join(dir, 'styles/parts/two.css'),
    `.two-class { --two-var: 1px; }\n@layer components { .two-layer { color: blue; } }\n`,
  )
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('nested local @imports', () => {
  it('reads classes and variables defined two imports down', () => {
    const data = loadDesignSystemSync(join(dir, 'app.css'))
    expect(data.componentClasses).toEqual(
      expect.arrayContaining(['entry-class', 'one-class', 'two-class', 'two-layer']),
    )
    expect(data.definedVars).toContain('--two-var')
  })

  it("doesn't read into a package's own imports: Tailwind's theme stays out", () => {
    const data = loadDesignSystemSync(join(dir, 'app.css'))
    expect(data.definedVars).not.toContain('--color-red-500')
  })
})
