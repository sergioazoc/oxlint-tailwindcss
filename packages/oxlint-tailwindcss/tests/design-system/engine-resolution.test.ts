import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveTailwindNodeFor } from '../../src/design-system/tailwind-node'
import { TAILWIND_NODE_VERSION } from '../../src/design-system/tailwind-node'
import { resetDesignSystem } from '../../src/design-system/loader'

// These tests exercise ONLY the path/version resolution (`resolveTailwindNodeFor`),
// never a design-system load, so they can build synthetic `node_modules` trees
// with dummy `package.json` files and no real Tailwind — which is the only way
// to cover multiple engine versions, monorepo layouts, and the pnpm strict
// layout without a second install.

const roots: string[] = []
function makeRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `oxtw-eng-${prefix}-`))
  roots.push(dir)
  return dir
}

/** Create a `<dir>/package.json` (`{name, version, main}`) + `index.js`. */
function mkpkg(dir: string, name: string, version: string | null): void {
  mkdirSync(dir, { recursive: true })
  const pkg: Record<string, unknown> = { name, main: 'index.js' }
  if (version !== null) pkg.version = version
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
  writeFileSync(join(dir, 'index.js'), '')
}

function writeCss(root: string, rel = 'src/app.css'): string {
  const css = join(root, rel)
  mkdirSync(join(css, '..'), { recursive: true })
  writeFileSync(css, "@import 'tailwindcss';\n")
  return css
}

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
})

beforeEach(() => resetDesignSystem())

describe('resolveTailwindNodeFor', () => {
  it('npm hoisted: resolves the consumer engine from the CSS dir', () => {
    const root = makeRoot('npm')
    mkpkg(join(root, 'node_modules/@tailwindcss/node'), '@tailwindcss/node', '4.4.0')
    mkpkg(join(root, 'node_modules/tailwindcss'), 'tailwindcss', '4.4.0')
    const css = writeCss(root)

    const r = resolveTailwindNodeFor(css)
    expect(r.nodeVersion).toBe('4.4.0')
    expect(r.buildVersion).toBe('4.4.0')
    expect(r.usedBundled).toBe(false)
  })

  it('monorepo: each package resolves its own nearest engine version', () => {
    const root = makeRoot('mono')
    // Root has 4.3.3; packages/ui shadows it with 4.5.0.
    mkpkg(join(root, 'node_modules/@tailwindcss/node'), '@tailwindcss/node', '4.3.3')
    mkpkg(join(root, 'node_modules/tailwindcss'), 'tailwindcss', '4.3.3')
    mkpkg(join(root, 'packages/ui/node_modules/@tailwindcss/node'), '@tailwindcss/node', '4.5.0')
    mkpkg(join(root, 'packages/ui/node_modules/tailwindcss'), 'tailwindcss', '4.5.0')
    const uiCss = writeCss(root, 'packages/ui/src/app.css')
    const otherCss = writeCss(root, 'packages/other/src/app.css')

    const ui = resolveTailwindNodeFor(uiCss)
    expect(ui.nodeVersion).toBe('4.5.0')
    expect(ui.buildVersion).toBe('4.5.0')

    const other = resolveTailwindNodeFor(otherCss)
    expect(other.nodeVersion).toBe('4.3.3')
    expect(other.buildVersion).toBe('4.3.3')
  })

  it.skipIf(process.platform === 'win32')(
    'pnpm strict: resolves the engine via the build tool through the symlinked store',
    () => {
      const root = makeRoot('pnpm')
      const store = join(root, 'node_modules/.pnpm')
      const nodeReal = join(store, '@tailwindcss+node@4.6.0/node_modules/@tailwindcss/node')
      const postcssReal = join(
        store,
        '@tailwindcss+postcss@4.6.0/node_modules/@tailwindcss/postcss',
      )
      mkpkg(nodeReal, '@tailwindcss/node', '4.6.0')
      mkpkg(postcssReal, '@tailwindcss/postcss', '4.6.0')
      // pnpm makes each package's deps siblings under its own `.pnpm/<pkg>/node_modules`.
      const postcssSiblingNode = join(
        store,
        '@tailwindcss+postcss@4.6.0/node_modules/@tailwindcss/node',
      )
      mkdirSync(join(postcssSiblingNode, '..'), { recursive: true })
      symlinkSync(nodeReal, postcssSiblingNode)
      // The consumer only sees @tailwindcss/postcss at the top level (a symlink into the store);
      // @tailwindcss/node is NOT directly resolvable from the project root — the pnpm gotcha.
      const topPostcss = join(root, 'node_modules/@tailwindcss/postcss')
      mkdirSync(join(topPostcss, '..'), { recursive: true })
      symlinkSync(postcssReal, topPostcss)
      mkpkg(join(root, 'node_modules/tailwindcss'), 'tailwindcss', '4.6.0')
      const css = writeCss(root)

      const r = resolveTailwindNodeFor(css)
      expect(r.nodeVersion).toBe('4.6.0')
      expect(r.buildVersion).toBe('4.6.0')
      expect(r.usedBundled).toBe(false)
    },
  )

  it('falls back to the bundled engine when the consumer has no @tailwindcss/node', () => {
    const root = makeRoot('fallback')
    mkpkg(join(root, 'node_modules/tailwindcss'), 'tailwindcss', '4.7.0')
    const css = writeCss(root)

    const r = resolveTailwindNodeFor(css)
    expect(r.usedBundled).toBe(true)
    expect(r.nodeVersion).toBe(TAILWIND_NODE_VERSION) // the plugin's own copy
    expect(r.buildVersion).toBe('4.7.0') // drift still detectable
  })

  it('resolves the fake engine and never throws when the project has no tailwindcss', () => {
    // NOTE: under vite-node `require.resolve('tailwindcss', { paths })` falls back
    // to the repo's own tailwindcss when the synthetic tree lacks it, so
    // buildVersion is NOT 'unknown' here (the native `require` in the built
    // plugin honors `paths` strictly and would report 'unknown'). The
    // buildVersion==='unknown' → drift-suppressed behavior is covered by the
    // engine-guard unit tests; here we only assert the engine resolves and the
    // function degrades without throwing.
    const root = makeRoot('nobuild')
    mkpkg(join(root, 'node_modules/@tailwindcss/node'), '@tailwindcss/node', '4.8.0')
    const css = writeCss(root)

    const r = resolveTailwindNodeFor(css)
    expect(r.nodeVersion).toBe('4.8.0')
    expect(typeof r.buildVersion).toBe('string')
  })

  it("reports 'unknown' for a package.json missing its version, without throwing", () => {
    const root = makeRoot('noversion')
    mkpkg(join(root, 'node_modules/@tailwindcss/node'), '@tailwindcss/node', null)
    mkpkg(join(root, 'node_modules/tailwindcss'), 'tailwindcss', null)
    const css = writeCss(root)

    const r = resolveTailwindNodeFor(css)
    expect(r.nodeVersion).toBe('unknown')
    expect(r.buildVersion).toBe('unknown')
  })

  it('prefers the candidate whose version matches the build (R2)', () => {
    // Consumer build is 4.9.0 (tailwindcss); an unrelated @tailwindcss/node@4.3.3
    // sits at the root while the matching 4.9.0 lives under the build tool.
    const root = makeRoot('r2')
    mkpkg(join(root, 'node_modules/@tailwindcss/node'), '@tailwindcss/node', '4.3.3')
    mkpkg(join(root, 'node_modules/tailwindcss'), 'tailwindcss', '4.9.0')
    const viteReal = join(
      root,
      'node_modules/.pnpm/@tailwindcss+vite@4.9.0/node_modules/@tailwindcss/vite',
    )
    mkpkg(viteReal, '@tailwindcss/vite', '4.9.0')
    const viteSiblingNode = join(
      root,
      'node_modules/.pnpm/@tailwindcss+vite@4.9.0/node_modules/@tailwindcss/node',
    )
    mkpkg(viteSiblingNode, '@tailwindcss/node', '4.9.0')
    const topVite = join(root, 'node_modules/@tailwindcss/vite')
    mkdirSync(join(topVite, '..'), { recursive: true })
    if (process.platform !== 'win32') symlinkSync(viteReal, topVite)
    const css = writeCss(root)

    const r = resolveTailwindNodeFor(css)
    // The 4.9.0 that matches the build wins over the root 4.3.3.
    if (process.platform !== 'win32') {
      expect(r.nodeVersion).toBe('4.9.0')
    }
    expect(r.buildVersion).toBe('4.9.0')
  })
})
