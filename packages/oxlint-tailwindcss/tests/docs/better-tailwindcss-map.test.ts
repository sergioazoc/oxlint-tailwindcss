/**
 * /migration/from-better-tailwindcss, this plugin's side: every rule and
 * setting the tables name exists, and each row's options are valid for its
 * rule. That every example is reported by both rules of its row, and that
 * every rule of better-tailwindcss has a row, is checked by bench/interop.mjs
 * against the plugin itself.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import plugin from '../../src/index'

const ROOT = resolve(__dirname, '../..')
const DATA = JSON.parse(
  readFileSync(resolve(ROOT, '../docs/data/better-tailwindcss.json'), 'utf8'),
) as {
  rules: { theirs: string; ours: string; options?: { ours: unknown } }[]
  settings: { theirs: string; ours: string | null }[]
}
const TYPES = readFileSync(resolve(ROOT, 'src/types.ts'), 'utf8')
const SETTINGS = new Set(
  [
    ...TYPES.slice(TYPES.indexOf('export interface PluginSettings {')).matchAll(/^ {2}(\w+)\?:/gm),
  ].map((m) => m[1]),
)

describe('/migration/from-better-tailwindcss', () => {
  it('maps each of their rules once, to a rule of this plugin', () => {
    const theirs = DATA.rules.map((r) => r.theirs)
    expect(new Set(theirs).size).toBe(theirs.length)
    expect(DATA.rules.map((r) => r.ours).filter((r) => !(r in plugin.rules))).toEqual([])
  })

  it('maps their settings to settings of this plugin', () => {
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
})
