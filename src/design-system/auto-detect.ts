import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

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
      } catch {
        continue
      }
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) break

    // If we find a package.json in the parent, it's a package boundary
    if (depth > 0 && existsSync(join(parentDir, 'package.json'))) {
      // Last attempt in the package.json directory
      for (const candidate of CANDIDATE_PATHS) {
        const fullPath = join(parentDir, candidate)
        if (!existsSync(fullPath)) continue
        try {
          const content = readFileSync(fullPath, 'utf-8')
          if (TAILWIND_SIGNALS.some((signal) => content.includes(signal))) {
            return fullPath
          }
        } catch {
          continue
        }
      }
      break
    }

    currentDir = parentDir
  }

  return null
}
