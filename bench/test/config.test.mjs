import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { materializeConfig } from '../lib/config.mjs'

const plugin = {
  rules: {
    'no-unknown-classes': { meta: { docs: { recommended: 'error' } } },
    'enforce-logical': { meta: { docs: { recommended: false } } },
    'no-borrowed-component-styles': { meta: { docs: { recommended: false } } },
  },
}
// A published version from before meta.docs.recommended, with fewer rules.
const old = { rules: { 'no-unknown-classes': { meta: {} } } }

describe('materializeConfig', () => {
  it('"all": every rule, at its recommended severity or "warn"', () => {
    const { config } = materializeConfig({ 'x-rules': 'all', plugins: [] }, plugin)
    assert.deepEqual(config, {
      plugins: [],
      rules: {
        'tailwindcss/no-unknown-classes': 'error',
        'tailwindcss/enforce-logical': 'warn',
        'tailwindcss/no-borrowed-component-styles': 'warn',
      },
    })
  })

  it('"recommended": only the recommended rules', () => {
    const { config } = materializeConfig({ 'x-rules': 'recommended' }, plugin)
    assert.deepEqual(config.rules, { 'tailwindcss/no-unknown-classes': 'error' })
  })

  it('refuses "recommended" for a plugin that does not declare it', () => {
    assert.throws(() => materializeConfig({ 'x-rules': 'recommended' }, old), /does not declare/)
  })

  it('adds options to a rule that is on, and explicit rules win', () => {
    const { config } = materializeConfig(
      {
        'x-rules': 'all',
        'x-options': { 'tailwindcss/no-borrowed-component-styles': [{ components: ['ui'] }] },
        rules: { 'tailwindcss/enforce-logical': 'off', 'shadcn/no-raw-colors': 'error' },
      },
      plugin,
    )
    assert.deepEqual(config.rules, {
      'tailwindcss/no-unknown-classes': 'error',
      'tailwindcss/enforce-logical': 'off',
      'tailwindcss/no-borrowed-component-styles': ['warn', { components: ['ui'] }],
      'shadcn/no-raw-colors': 'error',
    })
  })

  it('drops the rules the plugin version lacks, and names them', () => {
    const { config, dropped } = materializeConfig(
      {
        'x-rules': 'all',
        'x-options': { 'tailwindcss/no-borrowed-component-styles': [{ components: ['ui'] }] },
        rules: { 'tailwindcss/no-default-palette': 'warn' },
      },
      old,
    )
    assert.deepEqual(config.rules, { 'tailwindcss/no-unknown-classes': 'warn' })
    assert.deepEqual(dropped, ['tailwindcss/no-default-palette'])
  })

  it('leaves a template without x-rules as it is', () => {
    const template = { rules: { 'tailwindcss/no-unknown-classes': 'error' } }
    assert.deepEqual(materializeConfig(template, plugin).config, template)
  })
})
