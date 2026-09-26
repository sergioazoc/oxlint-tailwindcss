/**
 * The precompute tells Tailwind's default palette (`@theme default`, the
 * `DEFAULT` theme option) from the colors the project declares — what
 * no-default-palette reads. An artifact written before the split has neither
 * list and counts as a cache miss, so the rule can never go quiet on an old one.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cacheArtifactPaths, loadDesignSystemSync } from '../../src/design-system/sync-loader'

const FIXTURES = resolve(__dirname, '../fixtures')
const OLD = resolve(FIXTURES, `.palette-old-${process.pid}.css`)

afterAll(() => {
  rmSync(OLD, { force: true })
})

describe('palette vs project colors', () => {
  it('a project @theme: its colors, and the whole palette apart', () => {
    const data = loadDesignSystemSync(resolve(FIXTURES, 'custom-theme.css'))
    expect(data.projectColorVars).toEqual(['--color-brand', '--color-brand-light'])
    expect(data.paletteVars).toContain('--color-red-500')
    expect(data.paletteVars).toContain('--color-white')
    expect(data.paletteVars).not.toContain('--color-brand')
  })

  it('shadcn/ui: the @theme inline colors are the project’s', () => {
    const data = loadDesignSystemSync(resolve(FIXTURES, 'shadcn.css'))
    expect(data.projectColorVars).toContain('--color-primary')
    expect(data.projectColorVars).toContain('--color-sidebar-ring')
    expect(data.projectColorVars.some((v) => v.startsWith('--color-red-'))).toBe(false)
  })

  it('stock Tailwind: no colors of its own', () => {
    const data = loadDesignSystemSync(resolve(FIXTURES, 'default.css'))
    expect(data.projectColorVars).toEqual([])
    expect(data.paletteVars.length).toBeGreaterThan(200)
  })

  it('an artifact without the two lists is a miss, and is recomputed', () => {
    writeFileSync(OLD, `@import 'tailwindcss';\n/* palette-old ${process.pid} ${Date.now()} */\n`)
    loadDesignSystemSync(OLD)
    const { json } = cacheArtifactPaths(OLD)
    const stale = JSON.parse(readFileSync(json, 'utf8')) as Record<string, unknown>
    delete stale.paletteVars
    delete stale.projectColorVars
    writeFileSync(json, JSON.stringify(stale))
    expect(loadDesignSystemSync(OLD).paletteVars).toContain('--color-red-500')
  })
})
