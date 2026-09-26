/**
 * The language server the Claude Code plugin starts (agent/claude-code/
 * scripts/oxlint-lsp.mjs → the project's `oxlint --lsp`), spoken to over real
 * JSON-RPC: oxlint's server runs JS plugins, so opening a file publishes
 * oxlint-tailwindcss's diagnostics — the design-system ones included — as
 * the CLI reports them. oxlint's server pushes diagnostics
 * (textDocument/publishDiagnostics); it has no pull endpoint.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeAgentProject, PLUGIN_SCRIPTS } from './helpers/agent-project'
import { assertFreshDist } from './helpers/dist'

interface Message {
  id?: number
  method?: string
  params?: { uri?: string; diagnostics?: { code?: string; message: string }[]; items?: unknown[] }
  result?: { capabilities?: Record<string, unknown>; serverInfo?: { name: string } }
}

let project: ReturnType<typeof makeAgentProject>
let server: ChildProcess
const received: Message[] = []
const waiting = new Map<number, (m: Message) => void>()
let nextId = 0

function send(message: Record<string, unknown>) {
  const body = JSON.stringify({ jsonrpc: '2.0', ...message })
  server.stdin!.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}
const request = (method: string, params: unknown) =>
  new Promise<Message>((resolve) => {
    const id = ++nextId
    waiting.set(id, resolve)
    send({ id, method, params })
  })

/** Resolves with the first published diagnostics for `uri` that satisfy `ok`. */
function published(uri: string, ok: (codes: string[]) => boolean, timeoutMs = 60_000) {
  return new Promise<string[]>((resolve, reject) => {
    const started = Date.now()
    const check = () => {
      const hit = received
        .filter((m) => m.method === 'textDocument/publishDiagnostics' && m.params?.uri === uri)
        .map((m) => (m.params!.diagnostics ?? []).map((d) => `${d.code} ${d.message}`))
        .find((codes) => ok(codes))
      if (hit) return resolve(hit)
      if (Date.now() - started > timeoutMs) return reject(new Error('no diagnostics published'))
      setTimeout(check, 100)
    }
    check()
  })
}

beforeAll(async () => {
  assertFreshDist()
  project = makeAgentProject({
    'a.tsx': 'export const A = () => <div className="flex flex itms-center" />\n',
  })
  server = spawn(process.execPath, [join(PLUGIN_SCRIPTS, 'oxlint-lsp.mjs')], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: project.dir },
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  let buffer = Buffer.alloc(0)
  server.stdout!.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const header = buffer.indexOf('\r\n\r\n')
      if (header < 0) return
      const length = Number(
        /Content-Length: (\d+)/i.exec(buffer.subarray(0, header).toString())![1],
      )
      if (buffer.length < header + 4 + length) return
      const message = JSON.parse(
        buffer.subarray(header + 4, header + 4 + length).toString(),
      ) as Message
      buffer = buffer.subarray(header + 4 + length)
      if (message.id !== undefined && waiting.has(message.id) && !message.method) {
        waiting.get(message.id)!(message)
        waiting.delete(message.id)
      } else if (message.method && message.id !== undefined) {
        // A server request (workspace/configuration): no settings, as Claude Code sends none.
        const items = message.params?.items
        send({ id: message.id, result: Array.isArray(items) ? items.map(() => null) : null })
      } else {
        received.push(message)
      }
    }
  })
}, 60_000)

afterAll(async () => {
  // Shut down as a client does — `shutdown`, then `exit` — so oxlint ends
  // itself: on Windows, killing the wrapper leaves oxlint (its grandchild)
  // running in the project directory.
  if (server && server.exitCode === null) {
    const exited = new Promise<void>((resolve) => server.once('exit', () => resolve()))
    await Promise.race([request('shutdown', null), new Promise((r) => setTimeout(r, 5000))])
    send({ method: 'exit' })
    await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))])
    if (server.exitCode === null) server.kill()
  }
  project?.cleanup()
}, 30_000)

describe("the plugin's language server", () => {
  it("is oxlint's, and publishes oxlint-tailwindcss's diagnostics for an opened file", async () => {
    const root = pathToFileURL(project.dir).href
    const init = await request('initialize', {
      processId: process.pid,
      rootUri: root,
      workspaceFolders: [{ uri: root, name: 'project' }],
      capabilities: {
        textDocument: { publishDiagnostics: {} },
        workspace: { configuration: true },
      },
    })
    expect(init.result?.serverInfo?.name).toBe('oxlint')
    expect(init.result?.capabilities).toHaveProperty('textDocumentSync')
    send({ method: 'initialized', params: {} })

    const file = join(project.dir, 'src/a.tsx')
    const uri = pathToFileURL(file).href
    send({
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri,
          languageId: 'typescriptreact',
          version: 1,
          text: readFileSync(file, 'utf8'),
        },
      },
    })
    const codes = await published(uri, (c) =>
      c.some((d) => d.startsWith('tailwindcss(no-unknown-classes)')),
    )
    expect(codes.some((d) => d.includes('"itms-center" is not a valid Tailwind class'))).toBe(true)
  }, 90_000)
})
