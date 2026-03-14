import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const CANDIDATE_PATHS = [
  'src/app.css',
  'src/globals.css',
  'src/global.css',
  'src/style.css',
  'src/styles.css',
  'src/index.css',
  'app.css',
  'main.css',
  'globals.css',
  'style.css',
  'styles/globals.css',
  'app/globals.css',
  'assets/css/tailwind.css',
]

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
