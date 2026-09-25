// Diff two normalized snapshots: per-rule counts plus the exact diagnostics
// added and removed. Duplicate keys are counted (a multiset), so two reports of
// the same class on the same span are not collapsed into one.

import { keyOf } from './normalize.mjs'

function countKeys(records) {
  const counts = new Map()
  for (const record of records) {
    const key = keyOf(record)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function ruleId(record) {
  return `${record.tool}(${record.rule})`
}

export function compareRecords(before, after) {
  const beforeCounts = countKeys(before)
  const afterCounts = countKeys(after)
  const byKeyBefore = new Map(before.map((r) => [keyOf(r), r]))
  const byKeyAfter = new Map(after.map((r) => [keyOf(r), r]))

  const added = []
  const removed = []
  for (const key of new Set([...beforeCounts.keys(), ...afterCounts.keys()])) {
    const delta = (afterCounts.get(key) ?? 0) - (beforeCounts.get(key) ?? 0)
    for (let i = 0; i < delta; i++) added.push(byKeyAfter.get(key))
    for (let i = 0; i < -delta; i++) removed.push(byKeyBefore.get(key))
  }

  const messageChanged = []
  for (const [key, record] of byKeyAfter) {
    const previous = byKeyBefore.get(key)
    if (previous && previous.message !== record.message) {
      messageChanged.push({ key, before: previous.message, after: record.message })
    }
  }

  const rules = new Map()
  const bump = (record, field) => {
    const id = ruleId(record)
    const row = rules.get(id) ?? { rule: id, before: 0, after: 0 }
    row[field]++
    rules.set(id, row)
  }
  for (const record of before) bump(record, 'before')
  for (const record of after) bump(record, 'after')
  const perRule = [...rules.values()]
    .map((row) => ({ ...row, delta: row.after - row.before }))
    .sort((a, b) => (a.rule < b.rule ? -1 : 1))

  const byKey = (a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0)
  return {
    perRule,
    added: added.sort(byKey),
    removed: removed.sort(byKey),
    messageChanged,
    identical: added.length === 0 && removed.length === 0 && messageChanged.length === 0,
  }
}
