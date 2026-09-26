#!/usr/bin/env node
// The language server Claude Code talks to: the project's own `oxlint --lsp`,
// so its diagnostics are the ones the project's oxlint version, .oxlintrc.json
// and oxlint-tailwindcss produce — the same as the CLI and the editor.

import { spawn } from 'node:child_process'

import { findOxlint } from './lib.mjs'

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const oxlint = findOxlint(root)
if (!oxlint) {
  process.stderr.write(
    `oxlint-tailwindcss: no oxlint in ${root}/node_modules/.bin — install it with the plugin: npm install -D oxlint oxlint-tailwindcss\n`,
  )
  process.exit(1)
}
const server = spawn(oxlint, ['--lsp'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
