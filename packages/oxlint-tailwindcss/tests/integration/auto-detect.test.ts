import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  autoDetectEntryPoint,
  CANDIDATE_DIRS,
  CANDIDATE_NAMES,
} from '../../src/design-system/auto-detect'

const TMP = resolve(__dirname, '../.tmp-autodetect')

function createFile(relativePath: string, content: string) {
  const fullPath = join(TMP, relativePath)
  mkdirSync(resolve(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content)
}

describe('Auto-detect entry point', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('finds src/globals.css with @import tailwindcss', () => {
    createFile('package.json', '{}')
    createFile('src/globals.css', "@import 'tailwindcss';")
    createFile('src/app/page.tsx', '')

    const result = autoDetectEntryPoint(join(TMP, 'src/app/page.tsx'))
    expect(result).toBe(join(TMP, 'src/globals.css'))
  })

  it('finds app.css at project root', () => {
    createFile('package.json', '{}')
    createFile('app.css', "@import 'tailwindcss';")

    const result = autoDetectEntryPoint(join(TMP, 'src/index.ts'))
    expect(result).toBe(join(TMP, 'app.css'))
  })

  it('stops at package.json boundary in monorepo', () => {
    // Root
    createFile('package.json', '{}')
    createFile('src/globals.css', "@import 'tailwindcss';")

    // Nested package
    createFile('packages/web/package.json', '{}')
    createFile('packages/web/src/globals.css', "@import 'tailwindcss';")
    createFile('packages/web/src/app.tsx', '')

    // Should find the nested package's CSS, not the root one
    const result = autoDetectEntryPoint(join(TMP, 'packages/web/src/app.tsx'))
    expect(result).toBe(join(TMP, 'packages/web/src/globals.css'))
  })

  it('returns null when no tailwind CSS found', () => {
    createFile('package.json', '{}')
    createFile('src/styles.css', 'body { margin: 0; }')

    const result = autoDetectEntryPoint(join(TMP, 'src/index.ts'))
    expect(result).toBeNull()
  })

  it('detects @tailwind base syntax', () => {
    createFile('package.json', '{}')
    createFile('src/index.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;')

    const result = autoDetectEntryPoint(join(TMP, 'src/app.tsx'))
    expect(result).toBe(join(TMP, 'src/index.css'))
  })

  const allCandidates = CANDIDATE_DIRS.flatMap((dir) =>
    CANDIDATE_NAMES.map((name) => (dir === '.' ? `${name}.css` : `${dir}/${name}.css`)),
  )

  it('finds app/tailwind.css in monorepo from deep file path', () => {
    // Simulates: monorepo/apps/dashboard/app/tailwind.css
    createFile('package.json', '{}')
    createFile('apps/dashboard/package.json', '{}')
    createFile('apps/dashboard/app/tailwind.css', '@import "tailwindcss";')
    createFile('apps/dashboard/src/components/Button.tsx', '')

    const result = autoDetectEntryPoint(join(TMP, 'apps/dashboard/src/components/Button.tsx'))
    expect(result).toBe(join(TMP, 'apps/dashboard/app/tailwind.css'))
  })

  it('does NOT find monorepo sibling entry when searching from root', () => {
    createFile('package.json', '{}')
    createFile('apps/dashboard/package.json', '{}')
    createFile('apps/dashboard/app/tailwind.css', '@import "tailwindcss";')

    // Searching from root should NOT find a nested package's CSS
    const result = autoDetectEntryPoint(join(TMP, 'some-file.ts'))
    expect(result).toBeNull()
  })

  it.each(allCandidates)('finds %s', (candidatePath) => {
    createFile('package.json', '{}')
    createFile(candidatePath, '@import "tailwindcss";')
    createFile('src/components/Button.tsx', '')

    const result = autoDetectEntryPoint(join(TMP, 'src/components/Button.tsx'))
    expect(result).toBe(join(TMP, candidatePath))
  })

  // --- Indirect @import resolution ---

  it('finds entry point with indirect @import (relative)', () => {
    createFile('package.json', '{}')
    createFile('src/globals.css', '@import "./tailwind-base.css";')
    createFile('src/tailwind-base.css', '@import "tailwindcss";')
    createFile('src/app.tsx', '')

    const result = autoDetectEntryPoint(join(TMP, 'src/app.tsx'))
    expect(result).toBe(join(TMP, 'src/globals.css'))
  })

  it('finds entry point with indirect @import (package)', () => {
    createFile('package.json', '{}')
    createFile('src/globals.css', "@import '@company/theme/tailwind.config.css';")
    createFile('node_modules/@company/theme/tailwind.config.css', '@import "tailwindcss";')
    createFile('src/app.tsx', '')

    const result = autoDetectEntryPoint(join(TMP, 'src/app.tsx'))
    expect(result).toBe(join(TMP, 'src/globals.css'))
  })

  it('returns null when indirect imports also lack tailwind signal', () => {
    createFile('package.json', '{}')
    createFile('src/globals.css', '@import "./reset.css";')
    createFile('src/reset.css', 'body { margin: 0; }')
    createFile('src/app.tsx', '')

    const result = autoDetectEntryPoint(join(TMP, 'src/app.tsx'))
    expect(result).toBeNull()
  })

  // --- Package without CSS should not cross boundary (#7) ---

  it('returns null for package without CSS in monorepo', () => {
    // Root has CSS
    createFile('package.json', '{}')
    createFile('src/globals.css', "@import 'tailwindcss';")

    // Package without any CSS
    createFile('packages/shared/package.json', '{}')
    createFile('packages/shared/src/utils.ts', '')

    // Should NOT find root CSS — package.json boundary must stop the search
    const result = autoDetectEntryPoint(join(TMP, 'packages/shared/src/utils.ts'))
    expect(result).toBeNull()
  })

  it('returns null for package without CSS even when sibling has CSS', () => {
    createFile('package.json', '{}')

    // Sibling package WITH CSS
    createFile('packages/web/package.json', '{}')
    createFile('packages/web/src/globals.css', "@import 'tailwindcss';")

    // Package WITHOUT CSS
    createFile('packages/shared/package.json', '{}')
    createFile('packages/shared/src/utils.ts', '')

    const result = autoDetectEntryPoint(join(TMP, 'packages/shared/src/utils.ts'))
    expect(result).toBeNull()
  })

  it('does not search parent directory when package.json boundary is reached', () => {
    // Root with CSS at packages/ level (e.g. monorepo tools)
    createFile('package.json', '{}')
    createFile('packages/package.json', '{}')
    createFile('packages/src/globals.css', "@import 'tailwindcss';")

    // Nested package without CSS
    createFile('packages/shared/package.json', '{}')
    createFile('packages/shared/src/utils.ts', '')

    // Should NOT find packages/src/globals.css
    const result = autoDetectEntryPoint(join(TMP, 'packages/shared/src/utils.ts'))
    expect(result).toBeNull()
  })
})
