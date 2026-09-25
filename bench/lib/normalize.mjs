// Normalize oxlint `-f json` output into comparable diagnostic records.
//
// A record's identity (`keyOf`) is tool + rule + file + line + column + class,
// so two runs can be diffed diagnostic by diagnostic regardless of message
// wording. The message is kept alongside for message-only comparisons.

const BTW_CLASS_PATTERNS = [
  /Unknown class detected: (\S+)/,
  /Replace "([^"]+)"/,
  /The classes: "([^"]+)"/,
]

/** Extract the class a diagnostic is about, or null when the message names none. */
export function classOf(tool, message) {
  if (tool === 'better-tailwindcss') {
    for (const pattern of BTW_CLASS_PATTERNS) {
      const match = pattern.exec(message)
      if (match) return match[1]
    }
    return null
  }
  const quoted = /"([^"]+)"/.exec(message)
  return quoted ? quoted[1] : null
}

/** Split an oxlint diagnostic code like `tailwindcss(no-unknown-classes)`. */
export function splitCode(code) {
  const open = code.indexOf('(')
  if (open === -1 || !code.endsWith(')')) return { tool: code, rule: '' }
  return { tool: code.slice(0, open), rule: code.slice(open + 1, -1) }
}

export function normalizeDiagnostic(diagnostic) {
  const { tool, rule } = splitCode(diagnostic.code ?? '')
  const span = diagnostic.labels?.[0]?.span ?? { line: 0, column: 0, offset: 0, length: 0 }
  return {
    tool,
    rule,
    // Forward slashes so snapshots taken on Windows and POSIX compare equal.
    file: String(diagnostic.filename ?? '').replaceAll('\\', '/'),
    line: span.line ?? 0,
    column: span.column ?? 0,
    length: span.length ?? 0,
    cls: classOf(tool, diagnostic.message ?? ''),
    severity: diagnostic.severity ?? '',
    message: diagnostic.message ?? '',
  }
}

export function keyOf(record) {
  return [record.tool, record.rule, record.file, record.line, record.column, record.cls ?? ''].join(
    '|',
  )
}

/**
 * Serialize a snapshot with one record per line: small enough to commit, and a
 * git diff between two baselines reads as one line per diagnostic.
 */
export function serializeSnapshot(snapshot) {
  const records = snapshot.records.map((record) => `  ${JSON.stringify(record)}`).join(',\n')
  return `{\n"meta": ${JSON.stringify(snapshot.meta, null, 2)},\n"records": [\n${records}\n]\n}\n`
}

/** Normalize a whole oxlint JSON report; records come back sorted by key. */
export function normalizeReport(report) {
  const records = (report.diagnostics ?? []).map(normalizeDiagnostic)
  records.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0))
  return records
}
