/**
 * /migration/from-eslint-plugin-tailwindcss, this plugin's side: every rule
 * and setting the tables name exists, each row's options are valid for its
 * rule, and the page names the version and rule count of the data. That every
 * example is reported by both rules of its row, and that every rule of
 * eslint-plugin-tailwindcss has a row, is checked by bench/interop.mjs against
 * the plugin itself.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import plugin from '../../src/index'

const ROOT = resolve(__dirname, '../..')
const DOCS = resolve(ROOT, '../docs')
const DATA = JSON.parse(
  readFileSync(resolve(DOCS, 'data/eslint-plugin-tailwindcss.json'), 'utf8'),
) as {
  eslintPluginTailwindcss: string
  rules: { theirs: string; ours: string; options?: { ours: unknown } }[]
  settings: { theirs: string; ours: string | null }[]
}
const TYPES = readFileSync(resolve(ROOT, 'src/types.ts'), 'utf8')
const SETTINGS = new Set(
  [
    ...TYPES.slice(TYPES.indexOf('export interface PluginSettings {')).matchAll(/^ {2}(\w+)\?:/gm),
  ].map((m) => m[1]),
)
const page = (path: string) => readFileSync(resolve(DOCS, path), 'utf8').replace(/\s+/g, ' ')

describe('/migration/from-eslint-plugin-tailwindcss', () => {
  it('maps each of their rules once, to a rule of this plugin', () => {
    const theirs = DATA.rules.map((r) => r.theirs)
    expect(new Set(theirs).size).toBe(theirs.length)
    expect(DATA.rules.map((r) => r.ours).filter((r) => !(r in plugin.rules))).toEqual([])
  })

  it('maps their settings to settings of this plugin, each once', () => {
    const theirs = DATA.settings.map((s) => s.theirs)
    expect(new Set(theirs).size).toBe(theirs.length)
    const named = DATA.settings.flatMap((s) => (s.ours ? s.ours.split(', ') : []))
    expect(named.filter((k) => !SETTINGS.has(k))).toEqual([])
  })

  it("gives options only in the rule's schema", () => {
    for (const r of DATA.rules.filter((row) => row.options)) {
      const schema = plugin.rules[r.ours].meta?.schema as { properties: Record<string, unknown> }[]
      const keys = Object.keys(r.options!.ours as object)
      expect(
        keys.filter((k) => !(k in schema[0].properties)),
        r.ours,
      ).toEqual([])
    }
  })

  it('names the version and the rule count of the data, in both locales', () => {
    const { eslintPluginTailwindcss: version, rules } = DATA
    expect(page('migration/from-eslint-plugin-tailwindcss.md')).toContain(
      `eslint-plugin-tailwindcss ${version}'s ${rules.length} rules`,
    )
    expect(page('es/migration/from-eslint-plugin-tailwindcss.md')).toContain(
      `las ${rules.length} reglas de eslint-plugin-tailwindcss ${version}`,
    )
  })
})
