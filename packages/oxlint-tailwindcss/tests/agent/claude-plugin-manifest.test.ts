/**
 * The Claude Code plugin's files (agent/claude-code, listed by the repo's
 * .claude-plugin/marketplace.json): what `claude plugin validate` checks, and
 * what it can't — that every script a hook or the language server runs exists,
 * that the server covers every file oxlint lints, that the version is the
 * package's, and that the bundled skill is the published one.
 */
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LINTABLE } from '../../../../agent/claude-code/scripts/lib.mjs'

const REPO = resolve(__dirname, '../../../..')
const PLUGIN = join(REPO, 'agent/claude-code')
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const manifest = json(join(PLUGIN, '.claude-plugin/plugin.json'))
const marketplace = json(join(REPO, '.claude-plugin/marketplace.json'))
const pkg = json(join(REPO, 'packages/oxlint-tailwindcss/package.json'))

/** The script a `node "${CLAUDE_PLUGIN_ROOT}/…"` command runs, as a path in this repo. */
const scriptOf = (command: string) =>
  join(PLUGIN, /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/.exec(command)?.[1] ?? '')

describe('the Claude Code plugin', () => {
  it('is listed by the marketplace at the repo root, under its own name', () => {
    expect(marketplace.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(marketplace.owner.name).toBeTruthy()
    expect(marketplace.plugins).toHaveLength(1)
    const [entry] = marketplace.plugins
    expect(entry.name).toBe(manifest.name)
    expect(entry.source).toBe('./agent/claude-code')
    expect(existsSync(join(REPO, entry.source, '.claude-plugin/plugin.json'))).toBe(true)
    expect(entry.description).toBe(manifest.description)
  })

  it('is named in kebab-case, versioned as the package, licensed as it is', () => {
    expect(manifest.name).toBe('oxlint-tailwindcss')
    expect(manifest.version).toBe(pkg.version)
    expect(manifest.license).toBe(pkg.license)
    expect(manifest.homepage).toBe('https://oxlint-tailwindcss.pages.dev/ai-agents')
    // A page of its own — not packages/docs/AGENTS.md, which a case-insensitive
    // file system would take `agents.md` for.
    expect(lstatSync(join(REPO, 'packages/docs/ai-agents.md')).isFile()).toBe(true)
  })

  it('runs scripts that exist, recording edits and checking them on Stop', () => {
    const { hooks } = json(join(PLUGIN, 'hooks/hooks.json'))
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'Stop'])
    expect(hooks.PostToolUse[0].matcher).toBe('Edit|Write|MultiEdit')
    const commands = [hooks.PostToolUse, hooks.Stop].flatMap((groups) =>
      groups.flatMap((g: { hooks: { command: string; timeout: number }[] }) => g.hooks),
    )
    expect(commands.map((h) => scriptOf(h.command))).toEqual([
      join(PLUGIN, 'scripts/record-edit.mjs'),
      join(PLUGIN, 'scripts/stop-lint.mjs'),
    ])
    for (const h of commands) {
      expect(existsSync(scriptOf(h.command)), h.command).toBe(true)
      expect(h.timeout).toBeGreaterThan(0)
    }
  })

  it("starts the project's oxlint as the language server, for every file oxlint lints", () => {
    const { oxlint } = json(join(PLUGIN, '.lsp.json'))
    expect(oxlint.command).toBe('node')
    expect(existsSync(scriptOf(oxlint.args[0]))).toBe(true)
    const extensions = Object.keys(oxlint.extensionToLanguage)
    for (const ext of [
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.ts',
      '.tsx',
      '.mts',
      '.cts',
      '.vue',
      '.svelte',
      '.astro',
    ]) {
      expect(extensions, ext).toContain(ext)
      expect(LINTABLE.test(`a${ext}`), ext).toBe(true)
    }
    expect(extensions.every((ext) => LINTABLE.test(`a${ext}`))).toBe(true)
  })

  it('ships the published agent skill, as it is', () => {
    expect(readFileSync(join(PLUGIN, 'skills/oxlint-tailwindcss/SKILL.md'), 'utf8')).toBe(
      readFileSync(join(REPO, 'skills/oxlint-tailwindcss/SKILL.md'), 'utf8'),
    )
  })
})
