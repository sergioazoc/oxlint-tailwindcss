// Config templates name the rules they want by intent — every rule, or the
// recommended ones — rather than listing them, so they can't drift from the
// plugin, and one template works for the published version and the local
// build even when their rule sets differ.
//
//   "x-rules": "all"          every rule the plugin has, at its recommended
//                             severity, "warn" for the opt-in ones
//   "x-rules": "recommended"  the rules whose meta.docs.recommended is set
//   "x-options": { "tailwindcss/<rule>": [ { … } ] }
//                             options for a rule, when it is on
//
// (otw-all turns `enforce-physical` off explicitly: it is `enforce-logical`
// reversed, and the two on together report every directional class twice.)
//
// Explicit `rules` entries win. A `tailwindcss/*` rule the plugin doesn't have
// is dropped (and named in `dropped`), so a template can list a rule newer
// than the published version.

const PREFIX = 'tailwindcss/'

/**
 * @param {Record<string, unknown>} template  a parsed config template
 * @param {{ rules: Record<string, { meta?: { docs?: { recommended?: string | false } } }> }} plugin
 * @returns {{ config: Record<string, unknown>, dropped: string[] }}
 */
export function materializeConfig(template, plugin) {
  const { 'x-rules': intent, 'x-options': options = {}, ...config } = template
  const names = Object.keys(plugin.rules)
  const recommended = (name) => plugin.rules[name].meta?.docs?.recommended

  /** @type {Record<string, unknown>} */
  const generated = {}
  if (intent === 'all') {
    for (const name of names) generated[PREFIX + name] = recommended(name) || 'warn'
  } else if (intent === 'recommended') {
    const on = names.filter((name) => recommended(name))
    if (on.length === 0) {
      throw new Error(
        'x-rules: "recommended" needs meta.docs.recommended, which this plugin version does not declare',
      )
    }
    for (const name of on) generated[PREFIX + name] = recommended(name)
  } else if (intent !== undefined) {
    throw new Error(`x-rules: expected "all" or "recommended", got ${JSON.stringify(intent)}`)
  }

  const rules = { ...generated, ...config.rules }
  const dropped = []
  for (const key of Object.keys(rules)) {
    if (key.startsWith(PREFIX) && !names.includes(key.slice(PREFIX.length))) {
      dropped.push(key)
      delete rules[key]
    }
  }
  for (const [key, ruleOptions] of Object.entries(options)) {
    const severity = rules[key]
    if (typeof severity === 'string' && severity !== 'off') rules[key] = [severity, ...ruleOptions]
  }
  return { config: { ...config, rules }, dropped }
}
