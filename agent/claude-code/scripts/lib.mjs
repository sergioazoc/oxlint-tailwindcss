// The Claude Code plugin's logic, as pure functions over their inputs, so it
// is tested without Claude Code (packages/oxlint-tailwindcss/tests/agent/).
//
// The hooks lint only the files Claude edited in the session: PostToolUse
// records each edited path (record-edit.mjs), and Stop lints them with the
// project's own oxlint — its version, its .oxlintrc.json, its
// oxlint-tailwindcss — and sends the `tailwindcss(...)` errors back to Claude
// before it finishes (stop-lint.mjs).

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

/** The files oxlint lints: scripts, and the `<script>` of Vue, Svelte and Astro files. */
export const LINTABLE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/

/** The project's oxlint: `node_modules/.bin/oxlint` in `start` or the nearest parent that has one. */
export function findOxlint(start, { platform = process.platform, exists = existsSync } = {}) {
  const name = platform === 'win32' ? 'oxlint.cmd' : 'oxlint'
  let dir = resolve(start)
  for (;;) {
    const bin = join(dir, 'node_modules', '.bin', name)
    if (exists(bin)) return bin
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Where a session's edited paths are kept, one per line. */
export function stateFile(sessionId, dir = tmpdir()) {
  const safe = String(sessionId ?? 'unknown').replace(/[^\w.-]/g, '_')
  return join(dir, 'oxlint-tailwindcss-claude', `${safe}.txt`)
}

/**
 * The lintable paths an Edit / Write / MultiEdit call wrote: `tool_input.file_path`,
 * and, read the same way, any `file_path` of its edits or items — MultiEdit's
 * shape is not pinned down by the docs.
 */
export function editedPaths(input) {
  const tool = input?.tool_input
  const items = [
    tool,
    ...(Array.isArray(tool) ? tool : []),
    ...(Array.isArray(tool?.edits) ? tool.edits : []),
  ]
  const paths = items
    .map((item) => item?.file_path)
    .filter((path) => typeof path === 'string' && LINTABLE.test(path))
    .map((path) => (isAbsolute(path) ? path : resolve(input.cwd ?? process.cwd(), path)))
  return [...new Set(paths)]
}

export function recordEdit(input, dir) {
  const paths = editedPaths(input)
  if (paths.length === 0) return []
  const file = stateFile(input.session_id, dir)
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, paths.map((p) => `${p}\n`).join(''))
  return paths
}

/** The session's edited files that still exist, once each. */
export function editedFiles(sessionId, dir) {
  const file = stateFile(sessionId, dir)
  if (!existsSync(file)) return []
  const paths = readFileSync(file, 'utf8').split('\n').filter(Boolean)
  return [...new Set(paths)].filter((p) => existsSync(p))
}

export function forgetEdits(sessionId, dir) {
  rmSync(stateFile(sessionId, dir), { force: true })
}

/** The error-level diagnostics of oxlint-tailwindcss's rules in an `oxlint -f json` report. */
export function tailwindErrors(report) {
  return (report?.diagnostics ?? []).filter(
    (d) =>
      typeof d.code === 'string' && d.code.startsWith('tailwindcss(') && d.severity === 'error',
  )
}

/** What Claude reads: each error at its place, and what to do. */
export function feedback(errors, cwd) {
  const lines = errors.map((d) => {
    const span = d.labels?.[0]?.span
    const where = span ? `:${span.line}:${span.column}` : ''
    const file = relative(cwd, d.filename ?? '') || d.filename
    return `- ${file}${where} ${d.code}: ${d.message}${d.help ? ` (${d.help})` : ''}`
  })
  return [
    `oxlint-tailwindcss found ${errors.length} ${errors.length === 1 ? 'error' : 'errors'} in the files you edited:`,
    ...lines,
    'Fix them before finishing: each message says what is wrong, and most name the replacement.',
  ].join('\n')
}

/**
 * Whether to stop Claude from finishing. Never twice in a row: when a Stop hook
 * has already sent Claude back (`stop_hook_active`), it finishes, so a problem
 * it can't fix never loops.
 */
export function decideStop(input, errors, cwd) {
  if (input?.stop_hook_active) return { block: false }
  if (errors.length === 0) return { block: false }
  return { block: true, reason: feedback(errors, cwd) }
}
