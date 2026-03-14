import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { autoDetectEntryPoint } from '../../src/design-system/auto-detect'

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
})
