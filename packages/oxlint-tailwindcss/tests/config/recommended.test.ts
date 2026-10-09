import { describe, expect, it } from 'vitest'
import plugin from '../../src/index'
import { RECOMMENDED_RULES } from '../../src/recommended'

/**
 * `oxlint-tailwindcss/config` turns on a static map so it never loads the
 * plugin: it must be exactly what the rules recommend, at the same severities.
 */
describe('RECOMMENDED_RULES', () => {
  it("equals every rule's meta.docs.recommended", () => {
    const fromMeta = Object.fromEntries(
      Object.entries(plugin.rules)
        .map(([name, rule]) => [`tailwindcss/${name}`, rule.meta?.docs?.recommended] as const)
        .filter(([, severity]) => severity === 'error' || severity === 'warn'),
    )
    expect(RECOMMENDED_RULES).toEqual(fromMeta)
  })
})
