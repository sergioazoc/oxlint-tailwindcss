/**
 * `oxlint-tailwindcss/config`: the plugin and its recommended rules as an
 * oxlint config object, for `extends` in an `oxlint.config.ts` and in the
 * shared configs that compose it (#218).
 *
 *   import tailwindcss from 'oxlint-tailwindcss/config'
 *   export default defineConfig({
 *     extends: [tailwindcss()],
 *     settings: { tailwindcss: { entryPoint: 'src/styles.css' } },
 *   })
 *
 * A config that reaches oxlint through `extends` can't register its JS plugin
 * by package name: oxlint resolves `"oxlint-tailwindcss"` from the project,
 * where a shared config's own dependency isn't installed under pnpm, and it
 * rejects a relative specifier there outright. This module knows where the
 * plugin is — its sibling `index.mjs`, the file the bare name resolves to, so
 * a project that also lists the name registers the same plugin — and hands
 * oxlint that absolute path.
 *
 * It carries no settings, on purpose: oxlint never takes `settings` from an
 * extended config (JSON or TS), so an `entryPoint` passed through here would be
 * dropped in silence. The settings stay in the config that is linted with.
 *
 * It imports nothing at runtime from the plugin: the entry stays a few lines,
 * the build keeps `dist/index.cjs` a single `module.exports = plugin`, and the
 * recommended severities come from a static map a test holds equal to the
 * rules' own metadata.
 */

import { fileURLToPath } from 'node:url'
import { RECOMMENDED_RULES } from './recommended'

export type {
  CalleeExtractorKind,
  EntryPointMapping,
  ExtractorExclusions,
  PluginSettings,
} from './types'

export type TailwindcssConfigOptions = {
  /**
   * Turn on the recommended rules at their severities (default `true`).
   * `false` registers the plugin only, for a config that picks its own rules.
   */
  recommended?: boolean
}

/** An oxlint config object for `extends`: the plugin and its rules. */
export type TailwindcssConfig = {
  jsPlugins: string[]
  rules: Record<string, 'error' | 'warn'>
}

/** The plugin this config registers: the file a bare `"oxlint-tailwindcss"` resolves to. */
const PLUGIN_PATH = fileURLToPath(new URL('./index.mjs', import.meta.url))

const OPTIONS = new Set(['recommended'])

/**
 * The plugin and, unless `recommended: false`, the recommended rules. Throws
 * on anything else: a setting such as `entryPoint` would be dropped by oxlint
 * on its way through `extends`, and every rule that needs it would then report
 * a missing entry point on every file, far from the line that caused it.
 */
export function tailwindcss(options: TailwindcssConfigOptions = {}): TailwindcssConfig {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('oxlint-tailwindcss/config: tailwindcss() takes an options object.')
  }
  for (const key of Object.keys(options)) {
    if (OPTIONS.has(key)) continue
    throw new TypeError(
      `oxlint-tailwindcss/config: unknown option "${key}". Settings such as \`entryPoint\` don't reach oxlint through \`extends\` — set them in your own config's \`settings.tailwindcss\`. See https://oxlint-tailwindcss.pages.dev/setup`,
    )
  }
  return {
    jsPlugins: [PLUGIN_PATH],
    rules: options.recommended === false ? {} : { ...RECOMMENDED_RULES },
  }
}

export default tailwindcss
