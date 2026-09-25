// Compare two benchmark snapshots produced by run.mjs.
//
// Usage: node compare.mjs <before.snapshot.json> <after.snapshot.json>
//                         [--limit N] [--expect-identical]
//
// Prints the per-rule table, then the exact diagnostics added and removed (up
// to --limit each, default 50) and the diagnostics whose message changed.
// --expect-identical exits 1 on any difference — the gate for dependency-only
// steps, which must not move a single diagnostic.

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { compareRecords } from './lib/compare.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: 'string', default: '50' },
    'expect-identical': { type: 'boolean', default: false },
  },
})

if (positionals.length !== 2) {
  console.error('usage: node compare.mjs <before.snapshot.json> <after.snapshot.json>')
  process.exit(2)
}

const load = (path) => JSON.parse(readFileSync(path, 'utf8'))
const [before, after] = positionals.map(load)
const result = compareRecords(before.records, after.records)
const limit = Number(values.limit)

const describe = (s) =>
  `${s.meta.config} · ${s.meta.plugin} ${s.meta.pluginVersion} · ${s.meta.target} · ${s.meta.wallMs} ms`
console.log(`before: ${describe(before)}`)
console.log(`after:  ${describe(after)}\n`)

console.log('rule'.padEnd(56), 'before'.padStart(7), 'after'.padStart(7), 'delta'.padStart(7))
for (const row of result.perRule) {
  if (row.delta === 0 && row.before === 0) continue
  const delta = row.delta > 0 ? `+${row.delta}` : String(row.delta)
  console.log(
    row.rule.padEnd(56),
    String(row.before).padStart(7),
    String(row.after).padStart(7),
    delta.padStart(7),
  )
}

const show = (title, records) => {
  if (records.length === 0) return
  console.log(`\n${title} (${records.length}):`)
  for (const r of records.slice(0, limit)) {
    console.log(
      `  ${r.file}:${r.line}:${r.column} ${r.tool}(${r.rule}) ${r.cls ?? ''} — ${r.message}`,
    )
  }
  if (records.length > limit) console.log(`  … ${records.length - limit} more`)
}
show('added', result.added)
show('removed', result.removed)
if (result.messageChanged.length > 0) {
  console.log(`\nmessage changed (${result.messageChanged.length}):`)
  for (const m of result.messageChanged.slice(0, limit)) {
    console.log(`  ${m.key}\n    - ${m.before}\n    + ${m.after}`)
  }
}

console.log(result.identical ? '\nidentical' : '\ndifferent')
if (values['expect-identical'] && !result.identical) process.exit(1)
