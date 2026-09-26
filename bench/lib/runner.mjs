// Running oxlint over the corpus with a config template: shared by run.mjs
// (one run, one snapshot) and score.mjs (every tool, several runs).

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { materializeConfig } from './config.mjs'

export const BENCH = dirname(dirname(fileURLToPath(import.meta.url)))
export const REPO = dirname(BENCH)
export const LOCAL_DIST = join(REPO, 'packages/oxlint-tailwindcss/dist/index.cjs')
export const OXLINT = join(
  BENCH,
  'node_modules/.bin',
  process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint',
)
export const CORPUS_PATHS = ['app', 'components', 'registry/new-york-v4', 'hooks', 'lib']
export const SYNTHETIC_DIR = 'bench-synthetic'
export const IGNORES = ['**/__index__.tsx', '**/__components__/**']

const require = createRequire(import.meta.url)

/** The oxlint-tailwindcss module a run uses: the pinned release, or this repo's build. */
export function pluginModule(plugin) {
  const mod = require(plugin === 'local' ? LOCAL_DIST : 'oxlint-tailwindcss')
  return mod.default ?? mod
}

/** The version a run uses; the pinned one for `published` (the package exports no package.json). */
export function pluginVersion(plugin) {
  if (plugin !== 'local') return benchVersions()['oxlint-tailwindcss']
  const path = join(REPO, 'packages/oxlint-tailwindcss/package.json')
  return JSON.parse(readFileSync(path, 'utf8')).version
}

export function benchVersions() {
  return JSON.parse(readFileSync(join(BENCH, 'package.json'), 'utf8')).devDependencies
}

/**
 * Materializes `configs/<name>.json` inside the corpus app — where a real
 * project's .oxlintrc.json would sit, so `overrides` globs and relative paths
 * resolve against it — and returns its path.
 */
export function prepareConfig(app, name, plugin, label) {
  const pluginRef = plugin === 'local' ? LOCAL_DIST.replaceAll('\\', '/') : 'oxlint-tailwindcss'
  const template = readFileSync(join(BENCH, 'configs', `${name}.json`), 'utf8')
  const { config, dropped } = materializeConfig(
    JSON.parse(
      template
        .replaceAll('{{ENTRY_POINT}}', join(app, 'app/globals.css').replaceAll('\\', '/'))
        .replaceAll('{{OXLINT_TAILWINDCSS}}', pluginRef),
    ),
    pluginModule(plugin),
  )
  const configPath = join(app, `.bench-${label}.oxlintrc.json`)
  writeFileSync(configPath, JSON.stringify(config, null, 2))
  return { configPath, dropped }
}

/** The paths to lint: the corpus, or bench/synthetic copied into it. */
export function prepareTarget(app, target) {
  if (target === 'corpus') return CORPUS_PATHS
  const dest = join(app, SYNTHETIC_DIR)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest)
  for (const file of readdirSync(join(BENCH, 'synthetic'))) {
    copyFileSync(join(BENCH, 'synthetic', file), join(dest, file))
  }
  return [SYNTHETIC_DIR]
}

/** A reused cache dir per plugin (`warm`), or a fresh one to delete after the run (`cold`). */
export function cacheDirFor(cache, plugin) {
  mkdirSync(join(BENCH, 'out'), { recursive: true })
  const dir =
    cache === 'cold'
      ? mkdtempSync(join(BENCH, 'out', 'cache-cold-'))
      : join(BENCH, 'out', `cache-warm-${plugin}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Runs oxlint in `cwd`; exit 1 (diagnostics reported) is not an error. */
export function runOxlint({ cwd, configPath, paths, cacheDir, args = [] }) {
  const argv = ['-c', configPath, ...IGNORES.map((p) => `--ignore-pattern=${p}`), ...args, ...paths]
  const started = process.hrtime.bigint()
  let stdout
  try {
    stdout = execFileSync(OXLINT, argv, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, OXLINT_TAILWINDCSS_CACHE_DIR: cacheDir },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    if (typeof error.stdout !== 'string' || error.status !== 1) throw error
    stdout = error.stdout
  }
  return { stdout, wallMs: Number(process.hrtime.bigint() - started) / 1e6 }
}

export function lintJson(options) {
  const { stdout, wallMs } = runOxlint({
    ...options,
    args: [...(options.args ?? []), '-f', 'json'],
  })
  return { report: JSON.parse(stdout), raw: stdout, wallMs }
}
