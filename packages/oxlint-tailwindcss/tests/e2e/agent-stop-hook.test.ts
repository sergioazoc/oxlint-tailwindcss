/**
 * The Claude Code plugin's hooks, run as Claude Code runs them: JSON on stdin,
 * the project's oxlint, the verdict in the exit code. Claude edits a file with
 * an unknown class; on Stop it is sent back once with the error, and the
 * second Stop lets it finish. Warnings and files it didn't edit don't count.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeAgentProject, PLUGIN_SCRIPTS } from './helpers/agent-project'
import { assertFreshDist } from './helpers/dist'

let project: ReturnType<typeof makeAgentProject>
let STATE: string

beforeAll(() => {
  assertFreshDist()
  project = makeAgentProject({
    'bad.tsx': 'export const A = () => <div className="itms-center flex" />\n',
    'warn.tsx': 'export const B = () => <div className="p-4 flex" />\n',
    'untouched.tsx': 'export const C = () => <div className="flx" />\n',
  })
  STATE = mkdtempSync(join(tmpdir(), 'oxtw-agent-state-'))
})
afterAll(() => {
  project.cleanup()
  rmSync(STATE, { recursive: true, force: true })
})

function hook(script: string, input: Record<string, unknown>) {
  const run = spawnSync(process.execPath, [join(PLUGIN_SCRIPTS, script)], {
    input: JSON.stringify({ cwd: project.dir, ...input }),
    encoding: 'utf8',
    timeout: 120_000,
    // Where the hooks keep a session's edits: os.tmpdir(), redirected.
    env: {
      ...process.env,
      TMPDIR: STATE,
      TEMP: STATE,
      TMP: STATE,
      CLAUDE_PROJECT_DIR: project.dir,
    },
  })
  return { status: run.status, stderr: run.stderr }
}

const edit = (session: string, file: string) =>
  hook('record-edit.mjs', {
    session_id: session,
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: join(project.dir, 'src', file) },
  })
const stop = (session: string, active = false) =>
  hook('stop-lint.mjs', { session_id: session, hook_event_name: 'Stop', stop_hook_active: active })

describe('the Stop hook', () => {
  it('sends Claude back once with the errors in the files it edited, then lets it finish', () => {
    expect(edit('s1', 'bad.tsx').status).toBe(0)
    const first = stop('s1')
    expect(first.status).toBe(2)
    expect(first.stderr).toContain('oxlint-tailwindcss found 1 error in the files you edited:')
    expect(first.stderr).toContain('tailwindcss(no-unknown-classes)')
    expect(first.stderr).toContain('itms-center')
    // A file Claude didn't edit is not its to fix.
    expect(first.stderr).not.toContain('flx')
    // Claude Code sets stop_hook_active on the Stop that follows a block.
    expect(stop('s1', true).status).toBe(0)
  })

  it('lets Claude finish when the edited files only have warnings', () => {
    edit('s2', 'warn.tsx')
    expect(stop('s2')).toMatchObject({ status: 0, stderr: '' })
  })

  it('lets Claude finish when it edited nothing lintable', () => {
    hook('record-edit.mjs', {
      session_id: 's3',
      tool_name: 'Write',
      tool_input: { file_path: join(project.dir, 'README.md') },
    })
    expect(stop('s3').status).toBe(0)
  })
})
