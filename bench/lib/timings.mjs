// Parse the table `oxlint --debug=timings` prints (oxlint >= 1.84 includes JS
// plugin rules). Only the default formatter prints it: oxlint switches to the
// terse `agent` formatter on its own when it detects an AI agent, and that one
// prints neither the summary nor the timings — pass `-f default` explicitly.
//
// The per-rule numbers cover rule creation, lifecycle hooks and visitor
// callbacks. They do NOT cover plugin import, `createOnce` initialization or
// Rust<>JS transfer (oxc#26415), so the design-system load is charged to
// whichever rule's hook first touches it.

const ROW = /^(\S+)\s+([\d.]+)\s+([\d.]+)%\s+(\d+)\s+(\S+)\s*$/
const RUNTIME = {
  totalMs: /^\s*Total:\s+([\d.]+)ms/,
  callbacksMs: /^\s*Rule callbacks:\s+([\d.]+)ms/,
  overheadMs: /^\s*Shared overhead:\s+([\d.]+)ms/,
}

export function parseTimings(text) {
  const rules = []
  const jsRuntime = {}
  let inTable = false
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('Rule timings:')) {
      inTable = true
      continue
    }
    if (inTable) {
      const row = ROW.exec(line)
      if (row) {
        rules.push({
          rule: row[1],
          ms: Number(row[2]),
          share: Number(row[3]),
          calls: Number(row[4]),
          source: row[5],
        })
        continue
      }
      if (line.startsWith('JS plugin runtime:')) inTable = false
    }
    for (const [key, pattern] of Object.entries(RUNTIME)) {
      const match = pattern.exec(line)
      if (match) jsRuntime[key] = Number(match[1])
    }
  }
  return { rules, jsRuntime }
}
