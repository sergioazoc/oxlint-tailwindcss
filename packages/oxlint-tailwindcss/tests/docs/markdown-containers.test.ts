/**
 * VitePress custom containers (`::: warning Title` … `:::`) survive oxfmt only
 * when the opener, the body and the closer are separate paragraphs. With
 * `proseWrap: always` (.oxfmtrc.json), oxfmt reflows an opener that has text
 * right under it into one paragraph — the title swallows the first body line,
 * a literal `:::` is printed, and the unclosed container wraps the rest of the
 * page. That shipped once on /setup and /monorepo (EN and ES).
 *
 * This guards every markdown file the docs site or npm renders: each `:::`
 * line is a whole opener or closer, openers and closers sit between blank
 * lines, and they balance within the file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = resolve(__dirname, '../../../..')
const DOCS = join(REPO, 'packages/docs')
const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'dist'])

function markdownFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path))
    else if (entry.endsWith('.md')) out.push(path)
  }
  return out
}

const FILES = [
  ...markdownFiles(DOCS),
  join(REPO, 'README.md'),
  join(REPO, 'packages/oxlint-tailwindcss/README.md'),
]

const OPENER = /^:::\s+(?:tip|info|warning|danger|details|note|important|caution)(?:\s+\S.*)?$/
const CLOSER = /^:::$/

/** Every problem in one file, as `path:line message` strings. */
function containerProblems(file: string): string[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const where = (i: number) => `${relative(REPO, file)}:${i + 1}`
  const problems: string[] = []
  let inFence = false
  let depth = 0
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence || !line.includes(':::')) return
    if (OPENER.test(line)) {
      depth++
      if (lines[i + 1]?.trim() !== '')
        problems.push(`${where(i)} opener must be followed by a blank line`)
      if (i > 0 && lines[i - 1]?.trim() !== '')
        problems.push(`${where(i)} opener must follow a blank line`)
    } else if (CLOSER.test(line)) {
      depth--
      if (depth < 0) problems.push(`${where(i)} closer without an opener`)
      if (lines[i - 1]?.trim() !== '') problems.push(`${where(i)} closer must follow a blank line`)
    } else {
      problems.push(
        `${where(i)} ":::" must be a whole opener or closer line (oxfmt proseWrap merged it?)`,
      )
    }
  })
  if (depth > 0) problems.push(`${relative(REPO, file)} has ${depth} unclosed container(s)`)
  return problems
}

describe('VitePress containers in markdown', () => {
  it('finds the markdown files it guards', () => {
    expect(FILES.length).toBeGreaterThan(40)
  })

  it.each(FILES.map((f) => [relative(REPO, f), f]))('%s', (_label, file) => {
    expect(containerProblems(file)).toEqual([])
  })
})
