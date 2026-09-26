#!/usr/bin/env node
// Stop: lints the files Claude edited in this session with the project's own
// oxlint and, when oxlint-tailwindcss reports errors in them, sends them back
// to Claude before it finishes — exit 2 with the list on stderr, which Claude
// Code feeds back. Once: when Claude is already continuing because of a Stop
// hook (`stop_hook_active`), it finishes. No oxlint in the project, no edited
// file, or an oxlint that can't run: nothing to say.

import { execFileSync } from 'node:child_process'

import { decideStop, editedFiles, findOxlint, forgetEdits, tailwindErrors } from './lib.mjs'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
const input = JSON.parse(raw || '{}')
const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

const files = editedFiles(input.session_id)
const oxlint = files.length > 0 ? findOxlint(cwd) : null
let errors = []
if (oxlint) {
  let stdout = ''
  try {
    stdout = execFileSync(oxlint, ['-f', 'json', ...files], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    // Exit 1 means diagnostics were reported; anything else, oxlint couldn't run.
    stdout = error.status === 1 && typeof error.stdout === 'string' ? error.stdout : ''
  }
  try {
    errors = tailwindErrors(JSON.parse(stdout))
  } catch {
    errors = []
  }
}

const decision = decideStop(input, errors, cwd)
if (decision.block) {
  process.stderr.write(`${decision.reason}\n`)
  process.exit(2)
}
forgetEdits(input.session_id)
