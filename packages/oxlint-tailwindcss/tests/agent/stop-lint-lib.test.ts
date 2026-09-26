/**
 * The Claude Code plugin's hook logic (agent/claude-code/scripts/lib.mjs):
 * which edits are recorded, which diagnostics send Claude back, and that it
 * never does so twice in a row.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  decideStop,
  editedFiles,
  editedPaths,
  feedback,
  findOxlint,
  forgetEdits,
  recordEdit,
  stateFile,
  tailwindErrors,
} from '../../../../agent/claude-code/scripts/lib.mjs'

let DIR: string
beforeEach(() => {
  DIR = mkdtempSync(join(tmpdir(), 'oxtw-agent-'))
})
afterEach(() => rmSync(DIR, { recursive: true, force: true }))

const diag = (code: string, severity = 'error', line = 3) => ({
  code,
  severity,
  message: 'x is not a valid Tailwind class. Did you mean "y"?',
  filename: join('/p', 'src/a.tsx'),
  labels: [{ span: { line, column: 12 } }],
})

describe('findOxlint', () => {
  it("finds the project's own oxlint, walking up from the directory", () => {
    // resolve(): on Windows, '/repo' is on the current drive.
    const bin = join(resolve('/repo'), 'node_modules', '.bin', 'oxlint')
    const exists = (p: string) => p === bin
    expect(findOxlint('/repo/packages/web/src', { exists })).toBe(bin)
    expect(findOxlint('/elsewhere', { exists })).toBeNull()
    const cmd = join(resolve('/repo'), 'node_modules', '.bin', 'oxlint.cmd')
    expect(findOxlint('/repo', { platform: 'win32', exists: (p: string) => p === cmd })).toBe(cmd)
  })
})

describe('recording edits', () => {
  it('keeps the lintable paths an edit wrote, relative ones against its cwd', () => {
    expect(editedPaths({ cwd: '/p', tool_input: { file_path: 'src/a.tsx' } })).toEqual([
      resolve('/p', 'src/a.tsx'),
    ])
    expect(
      editedPaths({ tool_input: { file_path: '/p/b.vue', edits: [{ old_string: 'a' }] } }),
    ).toEqual(['/p/b.vue'])
    expect(
      editedPaths({ tool_input: [{ file_path: '/p/c.ts' }, { file_path: '/p/c.ts' }] }),
    ).toEqual(['/p/c.ts'])
    expect(editedPaths({ tool_input: { file_path: '/p/styles.css' } })).toEqual([])
    expect(editedPaths({ tool_input: { notebook_path: '/p/n.ipynb' } })).toEqual([])
  })

  it('records them per session, and reads back the ones that still exist, once', () => {
    const a = join(DIR, 'a.tsx')
    writeFileSync(a, '')
    recordEdit({ session_id: 's/1', tool_input: { file_path: a } }, DIR)
    recordEdit({ session_id: 's/1', tool_input: { file_path: a } }, DIR)
    recordEdit({ session_id: 's/1', tool_input: { file_path: join(DIR, 'gone.tsx') } }, DIR)
    recordEdit({ session_id: 'other', tool_input: { file_path: a } }, DIR)
    expect(stateFile('s/1', DIR)).not.toContain('s/1')
    expect(editedFiles('s/1', DIR)).toEqual([a])
    forgetEdits('s/1', DIR)
    expect(editedFiles('s/1', DIR)).toEqual([])
    expect(editedFiles('other', DIR)).toEqual([a])
  })

  it('a session with no edits has no files', () => {
    mkdirSync(join(DIR, 'oxlint-tailwindcss-claude'))
    expect(editedFiles('none', DIR)).toEqual([])
  })
})

describe('what sends Claude back', () => {
  it("only oxlint-tailwindcss's errors, not its warnings nor other plugins'", () => {
    const report = {
      diagnostics: [
        diag('tailwindcss(no-unknown-classes)'),
        diag('tailwindcss(enforce-sort-order)', 'warning'),
        diag('eslint(no-unused-vars)'),
        { code: undefined, severity: 'error', message: 'parse error' },
      ],
    }
    expect(tailwindErrors(report).map((d) => d.code)).toEqual(['tailwindcss(no-unknown-classes)'])
  })

  it('names each error at its place, relative to the project', () => {
    const text = feedback([diag('tailwindcss(no-unknown-classes)')], '/p')
    expect(text).toContain('oxlint-tailwindcss found 1 error in the files you edited:')
    expect(text).toContain(
      `- ${join('src', 'a.tsx')}:3:12 tailwindcss(no-unknown-classes): x is not a valid`,
    )
  })

  it('blocks on errors, never twice in a row', () => {
    const errors = [diag('tailwindcss(no-unknown-classes)')]
    expect(decideStop({ stop_hook_active: false }, errors, '/p')).toMatchObject({ block: true })
    expect(decideStop({ stop_hook_active: true }, errors, '/p')).toEqual({ block: false })
    expect(decideStop({ stop_hook_active: false }, [], '/p')).toEqual({ block: false })
  })
})
