import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const IMPORT_RE = /@import\s+['"]([^'"]+)['"]/g

/**
 * Resolves a CSS @import specifier to an absolute path.
 * Handles relative paths and package imports (walks up to node_modules).
 */
function resolveImport(specifier: string, baseDir: string): string | null {
  if (specifier.startsWith('.')) return resolve(baseDir, specifier)

  // Package import — walk up looking for node_modules
  let dir = baseDir
  while (true) {
    const candidate = join(dir, 'node_modules', specifier)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Checks if any @import in the CSS content points to a file containing a Tailwind signal.
 * Only follows ONE level of imports — no recursion.
 */
function hasTailwindSignalInImports(content: string, baseDir: string, signals: string[]): boolean {
  IMPORT_RE.lastIndex = 0
  let match
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const specifier = match[1]
    if (specifier === 'tailwindcss') continue

    const resolved = resolveImport(specifier, baseDir)
    if (!resolved) continue

    try {
      const imported = readFileSync(resolved, 'utf-8')
      if (signals.some((signal) => imported.includes(signal))) return true
    } catch {
      continue
    }
  }
  return false
}

export const CANDIDATE_DIRS = [
  'src',
  '.',
  'app',
  'styles',
  'style',
  'css',
  'assets',
  'assets/css',
  'resources/css',
]
export const CANDIDATE_NAMES = [
  'app',
  'globals',
  'global',
  'style',
  'styles',
  'index',
  'main',
  'tailwind',
  'tailwindcss',
]

const CANDIDATE_PATHS = CANDIDATE_DIRS.flatMap((dir) =>
  CANDIDATE_NAMES.map((name) => (dir === '.' ? `${name}.css` : `${dir}/${name}.css`)),
)

const TAILWIND_SIGNALS = [
  '@import "tailwindcss"',
  "@import 'tailwindcss'",
  '@tailwind base',
  '@import tailwindcss',
]

/**
 * Searches for the Tailwind CSS entry point by walking UP from the file
 * being linted. Monorepo-aware: stops at package.json boundaries.
 */
export function autoDetectEntryPoint(filePath?: string): string | null {
  const startDir = filePath ? dirname(resolve(filePath)) : process.cwd()
  let currentDir = startDir

  for (let depth = 0; depth < 20; depth++) {
    for (const candidate of CANDIDATE_PATHS) {
      const fullPath = join(currentDir, candidate)
      if (!existsSync(fullPath)) continue

      try {
        const content = readFileSync(fullPath, 'utf-8')
        if (TAILWIND_SIGNALS.some((signal) => content.includes(signal))) {
          return fullPath
        }
        if (hasTailwindSignalInImports(content, dirname(fullPath), TAILWIND_SIGNALS)) {
          return fullPath
        }
      } catch {
        continue
      }
    }

    // If current directory has package.json, we've reached the package root — stop
    if (existsSync(join(currentDir, 'package.json'))) break

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) break

    currentDir = parentDir
  }

  return null
}
