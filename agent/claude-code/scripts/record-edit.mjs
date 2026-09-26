#!/usr/bin/env node
// PostToolUse (Edit|Write|MultiEdit): remembers each lintable file Claude
// wrote in this session, for stop-lint.mjs. Never blocks.

import { recordEdit } from './lib.mjs'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
try {
  recordEdit(JSON.parse(raw))
} catch {
  // A malformed input is Claude Code's to report; this hook only takes notes.
}
