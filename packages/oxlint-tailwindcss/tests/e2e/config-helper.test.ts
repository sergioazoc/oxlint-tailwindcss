import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RECOMMENDED_RULES } from '../../src/recommended'
import { assertFreshDist, DIST_CONFIG_CJS, DIST_CONFIG_MJS } from './helpers/dist'

// `oxlint-tailwindcss/config` (#218), with the real oxlint and the built
// package: the plugin and its recommended rules for `extends`, in a project's
// `oxlint.config.ts` and in a shared config that has the plugin only as its
// own dependency. What /setup promises, and the two oxlint behaviours the
// helper is shaped around (pinned as canaries):
//
//   - an extended config can't name the plugin: oxlint resolves
//     `"oxlint-tailwindcss"` from where it runs, not from the config that lists
//     it — a pnpm bin shim's NODE_PATH happens to reach a hoisted copy, a plain
//     `node …/bin/oxlint` (an editor, `hoist=false`) doesn't. Every lint here
//     runs oxlint that plain way, so nothing is found by accident;
//   - an extended config's `settings` never reach oxlint, so the helper takes
//     none and the project sets `settings.tailwindcss` itself.
//
// oxlint imports an `oxlint.config.ts` through Node's own type stripping
// (Node 22.18+), so those cases skip on an older Node.

const ROOT = resolve(__dirname, '../..')
const DOCS = resolve(ROOT, '../docs')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT_PKG = realpathSync(resolve(ROOT, 'node_modules/oxlint'))
const OXLINT = resolve(OXLINT_PKG, 'bin/oxlint')
const TSC = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'tsc.cmd' : 'tsc')
const TAILWIND = resolve(ROOT, 'node_modules/tailwindcss/index.css').split('\\').join('/')

/** The `oxlint.config.ts` a page shows: the ts block that names that file first. */
function snippet(page: string): string {
  const match = /```ts\n\/\/ oxlint\.config\.ts\n([\s\S]*?)```/.exec(
    readFileSync(resolve(DOCS, page), 'utf8'),
  )
  if (!match) throw new Error(`${page} shows no oxlint.config.ts`)
  return match[1]
}

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

beforeAll(() => {
  assertFreshDist()
})

/**
 * A project: `files` written under it, and `links` (path → target) made as
 * junctions, the way a package manager lays out `node_modules`.
 */
function project(files: Record<string, string>, links: Record<string, string> = {}): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'oxtw-config-helper-'))
  dirs.push(dir)
  const all: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
    'src/styles.css': `@import '${TAILWIND}';\n`,
    'src/a.tsx': 'export const A = () => <div className="p-4 flex flex bg-notacolor-500" />\n',
    ...files,
  }
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(resolve(dir, path)), { recursive: true })
    writeFileSync(resolve(dir, path), text)
  }
  for (const [path, target] of Object.entries({ 'node_modules/oxlint': OXLINT_PKG, ...links })) {
    mkdirSync(dirname(resolve(dir, path)), { recursive: true })
    symlinkSync(target, resolve(dir, path), 'junction')
  }
  return dir
}

/** The package itself, as a dependency would link it. */
const PLUGIN = { 'node_modules/oxlint-tailwindcss': ROOT }

/** A shared config that depends on the plugin; the project does not. */
function sharedConfig(index: string): Record<string, string> {
  return {
    'node_modules/shared-config/package.json': JSON.stringify({
      name: 'shared-config',
      type: 'module',
      exports: './index.mjs',
    }),
    'node_modules/shared-config/index.mjs': index,
  }
}
const SHARED_PLUGIN = { 'node_modules/shared-config/node_modules/oxlint-tailwindcss': ROOT }

interface Lint {
  /** `file rule` per diagnostic, sorted. */
  reports: string[]
  messages: string[]
  /** Everything oxlint printed, for a config it couldn't load. */
  output: string
}

/** The environment without NODE_PATH, which a package manager's bin shim adds. */
const { NODE_PATH: _shimPath, ...PLAIN_ENV } = process.env

function lint(dir: string, paths = ['src']): Lint {
  const result = spawnSync(process.execPath, [OXLINT, '-f', 'json', ...paths], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
    env: PLAIN_ENV,
  })
  const output = `${result.stdout}${result.stderr}`
  let diagnostics: { code: string; message: string; filename: string }[] = []
  try {
    diagnostics = (JSON.parse(result.stdout) as { diagnostics: typeof diagnostics }).diagnostics
  } catch {
    // Not a report: the config failed to load. `output` has why.
  }
  return {
    reports: diagnostics
      .map(
        (d) =>
          `${d.filename.split('\\').join('/')} ${d.code.replace(/^tailwindcss\((.*)\)$/, '$1')}`,
      )
      .sort(),
    messages: diagnostics.map((d) => d.message),
    output,
  }
}

const NO_ENTRY_POINT = '`settings.tailwindcss.entryPoint` is required'

describe.skipIf(!process.features.typescript)('E2E: oxlint-tailwindcss/config', () => {
  it('/setup shows the same oxlint.config.ts in both languages', () => {
    expect(snippet('es/setup.md')).toBe(snippet('setup.md'))
  })

  it("/setup's oxlint.config.ts: the plugin, the recommended rules, the project's settings", () => {
    const dir = project({ 'oxlint.config.ts': snippet('setup.md') }, PLUGIN)
    const { reports, messages } = lint(dir)
    expect(reports).toEqual([
      'src/a.tsx enforce-sort-order',
      'src/a.tsx no-duplicate-classes',
      'src/a.tsx no-unknown-classes',
    ])
    expect(messages.join('\n')).not.toContain(NO_ENTRY_POINT)
  })

  it("/setup's oxlint.config.ts type-checks against oxlint's own config type", () => {
    // Plus a CommonJS and an ES module consumer of the package's own types: the
    // `.d.cts` has to describe what `require` gets, and a setting is no option.
    const dir = project(
      {
        'oxlint.config.ts': snippet('setup.md'),
        'cjs.cts': [
          "import config = require('oxlint-tailwindcss/config')",
          "const all: { jsPlugins: string[]; rules: Record<string, 'error' | 'warn'> } = config.default()",
          'const none = config.tailwindcss({ recommended: false })',
          "const settings: config.PluginSettings = { entryPoint: 'src/styles.css' }",
          '// @ts-expect-error a setting is not an option',
          "config.tailwindcss({ entryPoint: 'src/styles.css' })",
          'export { all, none, settings }',
          '',
        ].join('\n'),
        'esm.mts': [
          "import tailwindcss, { tailwindcss as named, type PluginSettings } from 'oxlint-tailwindcss/config'",
          'const all = tailwindcss()',
          'const none = named({ recommended: false })',
          "const settings: PluginSettings = { entryPoint: [{ files: 'a/**', use: 'a.css' }] }",
          '// @ts-expect-error a setting is not an option',
          "tailwindcss({ entryPoint: 'src/styles.css' })",
          'export { all, none, settings }',
          '',
        ].join('\n'),
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            strict: true,
            module: 'nodenext',
            moduleResolution: 'nodenext',
            noEmit: true,
            skipLibCheck: true,
            types: [],
          },
          files: ['oxlint.config.ts', 'cjs.cts', 'esm.mts'],
        }),
      },
      PLUGIN,
    )
    const result = spawnSync(TSC, ['-p', dir], { encoding: 'utf8', shell: IS_WINDOWS })
    expect(`${result.stdout}${result.stderr}`).toBe('')
    expect(result.status).toBe(0)
  })

  it("a shared config: the plugin only as its dependency, its own rules, the project's settings", () => {
    const dir = project(
      {
        ...sharedConfig(
          [
            "import tailwindcss from 'oxlint-tailwindcss/config'",
            '',
            "export default { extends: [tailwindcss()], rules: { 'tailwindcss/enforce-sort-order': 'off' } }",
            '',
          ].join('\n'),
        ),
        'oxlint.config.ts': [
          "import { defineConfig } from 'oxlint'",
          "import preset from 'shared-config'",
          '',
          'export default defineConfig({',
          '  extends: [preset],',
          "  settings: { tailwindcss: { entryPoint: 'src/styles.css' } },",
          '})',
          '',
        ].join('\n'),
      },
      SHARED_PLUGIN,
    )
    expect(existsSync(resolve(dir, 'node_modules/oxlint-tailwindcss'))).toBe(false)
    const { reports, messages } = lint(dir)
    expect(reports).toEqual(['src/a.tsx no-duplicate-classes', 'src/a.tsx no-unknown-classes'])
    expect(messages.join('\n')).not.toContain(NO_ENTRY_POINT)
  })

  it('recommended: false registers the plugin alone', () => {
    const dir = project(
      {
        'oxlint.config.ts': [
          "import { defineConfig } from 'oxlint'",
          "import tailwindcss from 'oxlint-tailwindcss/config'",
          '',
          'export default defineConfig({',
          '  extends: [tailwindcss({ recommended: false })],',
          "  rules: { 'tailwindcss/no-duplicate-classes': 'error' },",
          "  settings: { tailwindcss: { entryPoint: 'src/styles.css' } },",
          '})',
          '',
        ].join('\n'),
      },
      PLUGIN,
    )
    expect(lint(dir).reports).toEqual(['src/a.tsx no-duplicate-classes'])
  })

  it('a nested oxlint.config.ts anchors its relative entryPoint to its own directory', () => {
    // `bg-brand` exists only in the nested package's stylesheet. Linted from
    // the root, `./styles.css` must resolve next to the nested config — not
    // against the working directory, where there is no such file.
    const config = (entryPoint: string) =>
      [
        "import { defineConfig } from 'oxlint'",
        "import tailwindcss from 'oxlint-tailwindcss/config'",
        '',
        'export default defineConfig({',
        '  extends: [tailwindcss({ recommended: false })],',
        "  rules: { 'tailwindcss/no-unknown-classes': 'error' },",
        `  settings: { tailwindcss: { entryPoint: '${entryPoint}' } },`,
        '})',
        '',
      ].join('\n')
    const dir = project(
      {
        'oxlint.config.ts': config('src/styles.css'),
        'src/a.tsx': 'export const A = () => <div className="bg-brand" />\n',
        'packages/ui/oxlint.config.ts': config('./styles.css'),
        'packages/ui/styles.css': `@import '${TAILWIND}';\n@theme { --color-brand: #f00; }\n`,
        'packages/ui/src/b.tsx': 'export const B = () => <div className="bg-brand" />\n',
      },
      PLUGIN,
    )
    const { reports, messages } = lint(dir, ['src', 'packages'])
    expect(reports).toEqual(['src/a.tsx no-unknown-classes'])
    expect(messages.join('\n')).not.toContain('Could not stat')
  })

  it('settings passed to tailwindcss() fail where they are written', () => {
    const dir = project(
      {
        'oxlint.config.ts': [
          "import { defineConfig } from 'oxlint'",
          "import tailwindcss from 'oxlint-tailwindcss/config'",
          '',
          "export default defineConfig({ extends: [tailwindcss({ entryPoint: 'src/styles.css' } as never)] })",
          '',
        ].join('\n'),
      },
      PLUGIN,
    )
    expect(lint(dir).output).toContain('unknown option "entryPoint"')
  })

  it('listing the bare name as well registers the same plugin', () => {
    const dir = project(
      {
        'oxlint.config.ts': [
          "import { defineConfig } from 'oxlint'",
          "import tailwindcss from 'oxlint-tailwindcss/config'",
          '',
          'export default defineConfig({',
          '  extends: [tailwindcss()],',
          "  jsPlugins: ['oxlint-tailwindcss'],",
          "  settings: { tailwindcss: { entryPoint: 'src/styles.css' } },",
          '})',
          '',
        ].join('\n'),
      },
      PLUGIN,
    )
    const { reports, output } = lint(dir)
    expect(output).not.toContain('already registered')
    expect(reports).toContain('src/a.tsx no-duplicate-classes')
  })

  it('CANARY: an extended config cannot name the plugin when only it depends on it', () => {
    // Why the helper exists. When this fails, oxlint resolves an extended
    // config's plugins from that config: /setup's shared-config paragraph can go.
    // (Through a pnpm bin shim it can pass by accident: see the header.)
    const dir = project(
      {
        ...sharedConfig(
          "export default { jsPlugins: ['oxlint-tailwindcss'], rules: { 'tailwindcss/no-duplicate-classes': 'error' } }\n",
        ),
        'oxlint.config.ts': [
          "import { defineConfig } from 'oxlint'",
          "import preset from 'shared-config'",
          '',
          'export default defineConfig({ extends: [preset] })',
          '',
        ].join('\n'),
      },
      SHARED_PLUGIN,
    )
    expect(lint(dir).output).toContain('Failed to load JS plugin')
  })

  it('CANARY: oxlint takes no settings from an extended config', () => {
    // Why the helper takes no settings. When this fails, an extended config's
    // `settings` reach oxlint: tailwindcss() could carry them, and /setup says
    // they don't.
    const dir = project(
      {
        ...sharedConfig(
          [
            "import tailwindcss from 'oxlint-tailwindcss/config'",
            '',
            'export default {',
            '  extends: [tailwindcss()],',
            "  settings: { tailwindcss: { entryPoint: 'src/styles.css' } },",
            '}',
            '',
          ].join('\n'),
        ),
        'oxlint.config.ts': [
          "import { defineConfig } from 'oxlint'",
          "import preset from 'shared-config'",
          '',
          'export default defineConfig({ extends: [preset] })',
          '',
        ].join('\n'),
      },
      SHARED_PLUGIN,
    )
    expect(lint(dir).messages.join('\n')).toContain(NO_ENTRY_POINT)
  })
})

describe('oxlint-tailwindcss/config, built', () => {
  type Config = (options?: { recommended?: boolean }) => {
    jsPlugins: string[]
    rules: Record<string, string>
  }
  let cjs: { default: Config; tailwindcss: Config }
  let esm: { default: Config; tailwindcss: Config }

  beforeAll(async () => {
    cjs = createRequire(import.meta.url)(DIST_CONFIG_CJS) as typeof cjs
    esm = (await import(pathToFileURL(DIST_CONFIG_MJS).href)) as typeof esm
  })

  it('exports the same function by name and by default, in both formats', () => {
    for (const mod of [cjs, esm]) {
      expect(typeof mod.default).toBe('function')
      expect(mod.tailwindcss).toBe(mod.default)
    }
  })

  it("registers the package's own index.mjs, with the recommended rules", () => {
    for (const mod of [cjs, esm]) {
      const config = mod.default()
      expect(config.jsPlugins).toEqual([resolve(ROOT, 'dist/index.mjs')])
      expect(existsSync(config.jsPlugins[0])).toBe(true)
      expect(config.rules).toEqual(RECOMMENDED_RULES)
      expect(mod.default({ recommended: false })).toEqual({
        jsPlugins: config.jsPlugins,
        rules: {},
      })
      // oxlint serializes the config it imports.
      expect(JSON.parse(JSON.stringify(config))).toEqual(config)
    }
  })

  it('throws on a setting, naming where it belongs', () => {
    for (const mod of [cjs, esm]) {
      const call = () => mod.default({ entryPoint: 'src/styles.css' } as never)
      expect(call).toThrow(TypeError)
      expect(call).toThrow('settings.tailwindcss')
    }
  })

  it('ships index and config, each as CJS and ESM with their types, and nothing shared', () => {
    expect(readdirSync(resolve(ROOT, 'dist')).sort()).toEqual([
      'config.cjs',
      'config.d.cts',
      'config.d.mts',
      'config.mjs',
      'index.cjs',
      'index.d.cts',
      'index.d.mts',
      'index.mjs',
    ])
    // packages/docs/scripts/rules.ts and the smokes require the plugin itself.
    expect(readFileSync(resolve(ROOT, 'dist/index.cjs'), 'utf8').trimEnd()).toMatch(
      /module\.exports = plugin;$/,
    )
  })
})
