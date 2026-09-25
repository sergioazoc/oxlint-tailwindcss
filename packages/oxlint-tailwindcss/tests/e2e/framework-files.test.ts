import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { assertFreshDist, DIST_CJS } from './helpers/dist'

// What oxlint actually hands a JS plugin in Vue, Svelte and Astro files, locked
// end to end with the real binary and the built plugin.
//
// Verified behavior (oxlint 1.85.0): oxlint's partial loaders pass JS plugins
// the `<script>` blocks of `.vue` (incl. `lang="tsx"`), both scripts of
// `.svelte` (`<script module>` + instance), and Astro's frontmatter and
// `<script>` tags — each as its own program, with diagnostics and fixes mapped
// back to file positions. Templates and markup are never exposed, and `.html`
// is not linted at all.
//
// THE CANARIES ("CANARY:" below) FAIL ON PURPOSE when a future oxlint changes
// what plugins can see (template support via languagePlugins — oxc#24597 /
// #23207 / #20501 — or the multi-line `<script` fix, oxc#26289). When one
// fails, update the docs that promise this behavior FIRST — packages/docs/
// frameworks.md and setup.md (EN + ES), both READMEs, CLAUDE.md "Extraction
// System" — then these expectations.

const ROOT = resolve(__dirname, '../..')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const OXFMT = resolve(ROOT, '../../node_modules/.bin', IS_WINDOWS ? 'oxfmt.cmd' : 'oxfmt')
const ENTRY = resolve(ROOT, 'tests/fixtures/default.css')

// Non-ASCII text sits before every class string: oxlint reports byte offsets in
// SFC sections, so any char/byte mix-up would misplace a fix.
const FILES: Record<string, string> = {
  'Comp.vue': `<template>
  <!-- Botón con título -->
  <div class="flex flex itms-center">Título</div>
</template>

<script setup lang="ts">
// Botón: título largo
const a = cn('flex flex p-4')
const b = cn('itms-center')
const classes = 'p-4 flex'
</script>
`,
  'Button.svelte': `<script module>
  // Módulo: botón
  export const mod = cn('flex flex')
</script>

<script>
  // Instancia: título
  const inst = cn('p-4 flex')
</script>

<div class="flex flex itms-center">Hola</div>
`,
  'Card.astro': `---
// Título del card
const x = cn('flex flex')
---
<div class="flex flex itms-center">Hi</div>
<script>
  const y = cn('p-4 flex')
</script>
`,
  'Render.vue': `<script setup lang="tsx">
// Render con título
const r = () => <div className="flex flex">x</div>
</script>
`,
  'Only.vue': `<template>
  <div class="flex flex itms-center">Only template</div>
</template>
`,
  'Multiline.vue': `<template><div /></template>
<script
  setup
  lang="ts"
>
const m = cn('flex flex')
</script>
`,
  'index.html': `<div class="flex flex itms-center">html</div>
`,
  'twin.ts': `const a = cn('flex flex p-4')
`,
}

interface Diagnostic {
  code: string
  filename: string
  labels: { span: { offset: number; length: number; line: number } }[]
}

let DIR: string
let diagnostics: Diagnostic[]
let filesLinted: number

function run(bin: string, args: string[], cwd: string): string {
  try {
    return execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 60_000, shell: IS_WINDOWS })
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string }
    if (err.status === 1 && typeof err.stdout === 'string') return err.stdout
    throw new Error(`${basename(bin)} exited ${err.status}: ${err.stderr ?? ''}`)
  }
}

/** `[line, spanText]` for every diagnostic of `rule` in `file`, spans sliced as BYTES. */
function hits(file: string, rule: string): [number, string][] {
  const bytes = readFileSync(resolve(DIR, 'src', file))
  return diagnostics
    .filter((d) => basename(d.filename) === file && d.code === `tailwindcss(${rule})`)
    .map((d) => {
      const { offset, length, line } = d.labels[0].span
      return [line, bytes.subarray(offset, offset + length).toString('utf8')]
    })
}

beforeAll(() => {
  assertFreshDist()
  DIR = mkdtempSync(resolve(tmpdir(), 'oxtw-frameworks-'))
  mkdirSync(resolve(DIR, 'src'))
  for (const [name, content] of Object.entries(FILES)) {
    writeFileSync(resolve(DIR, 'src', name), content)
  }
  // Nested-config discovery (no `-c`): the way projects and editors run oxlint.
  writeFileSync(
    resolve(DIR, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [DIST_CJS.split('\\').join('/')],
      settings: { tailwindcss: { entryPoint: ENTRY.split('\\').join('/') } },
      rules: {
        'tailwindcss/no-duplicate-classes': 'error',
        'tailwindcss/no-unknown-classes': 'error',
        'tailwindcss/enforce-sort-order': 'error',
      },
    }),
  )
  const report = JSON.parse(run(OXLINT, ['-f', 'json', 'src'], DIR))
  diagnostics = report.diagnostics
  filesLinted = report.number_of_files
})

afterAll(() => {
  if (DIR) rmSync(DIR, { recursive: true, force: true })
})

describe('E2E: what oxlint lints in framework files', () => {
  it('lints a .vue <script setup> and maps diagnostics to file lines', () => {
    expect(hits('Comp.vue', 'no-duplicate-classes')).toEqual([[8, "'flex flex p-4'"]])
    expect(hits('Comp.vue', 'no-unknown-classes')).toEqual([[9, "'itms-center'"]])
    expect(hits('Comp.vue', 'enforce-sort-order')).toEqual([[10, "'p-4 flex'"]])
  })

  it('lints both the module and the instance script of a .svelte file', () => {
    expect(hits('Button.svelte', 'no-duplicate-classes')).toEqual([[3, "'flex flex'"]])
    expect(hits('Button.svelte', 'enforce-sort-order')).toEqual([[8, "'p-4 flex'"]])
  })

  it("lints Astro's frontmatter and its <script> tag", () => {
    expect(hits('Card.astro', 'no-duplicate-classes')).toEqual([[3, "'flex flex'"]])
    expect(hits('Card.astro', 'enforce-sort-order')).toEqual([[7, "'p-4 flex'"]])
  })

  it('extracts JSX className inside a lang="tsx" Vue block', () => {
    expect(hits('Render.vue', 'no-duplicate-classes')).toEqual([[3, '"flex flex"']])
  })

  it('CANARY: never reports on a template or markup line', () => {
    const templateLines: Record<string, number> = {
      'Comp.vue': 3,
      'Button.svelte': 11,
      'Card.astro': 5,
    }
    for (const [file, line] of Object.entries(templateLines)) {
      const onTemplate = diagnostics.filter(
        (d) => basename(d.filename) === file && d.labels[0]?.span.line === line,
      )
      expect(onTemplate, `${file}:${line} is template/markup`).toEqual([])
    }
    expect(diagnostics.filter((d) => basename(d.filename) === 'Only.vue')).toEqual([])
  })

  it('CANARY: a <script opening tag split across lines is skipped (oxc#26289)', () => {
    expect(diagnostics.filter((d) => basename(d.filename) === 'Multiline.vue')).toEqual([])
  })

  it('CANARY: .html files are not linted', () => {
    expect(diagnostics.filter((d) => basename(d.filename) === 'index.html')).toEqual([])
    // Everything under src/ except index.html.
    expect(filesLinted).toBe(Object.keys(FILES).length - 1)
  })
})

describe('E2E: --fix in framework files', () => {
  let FIXED: string

  beforeAll(() => {
    FIXED = mkdtempSync(resolve(tmpdir(), 'oxtw-frameworks-fix-'))
    cpSync(DIR, FIXED, { recursive: true })
    run(OXLINT, ['--fix', 'src'], FIXED)
  })

  afterAll(() => {
    if (FIXED) rmSync(FIXED, { recursive: true, force: true })
  })

  const read = (file: string) => readFileSync(resolve(FIXED, 'src', file), 'utf8')
  const withEdits = (file: string, edits: [string, string][]) =>
    edits.reduce((text, [from, to]) => text.replace(from, to), FILES[file])

  it('rewrites only the script strings, byte-exact, with non-ASCII before them', () => {
    expect(read('Comp.vue')).toBe(
      withEdits('Comp.vue', [
        ["cn('flex flex p-4')", "cn('flex p-4')"],
        ["'p-4 flex'", "'flex p-4'"],
      ]),
    )
    expect(read('Button.svelte')).toBe(
      withEdits('Button.svelte', [
        ["cn('flex flex')", "cn('flex')"],
        ["cn('p-4 flex')", "cn('flex p-4')"],
      ]),
    )
    expect(read('Card.astro')).toBe(
      withEdits('Card.astro', [
        ["cn('flex flex')", "cn('flex')"],
        ["cn('p-4 flex')", "cn('flex p-4')"],
      ]),
    )
    expect(read('Render.vue')).toBe(
      withEdits('Render.vue', [['className="flex flex"', 'className="flex"']]),
    )
  })

  it('leaves templates, markup and unlinted files untouched', () => {
    for (const file of ['Only.vue', 'Multiline.vue', 'index.html']) {
      expect(read(file), file).toBe(FILES[file])
    }
    expect(read('Comp.vue')).toContain('<div class="flex flex itms-center">Título</div>')
  })

  it('fixes a string in an SFC exactly as in a plain .ts file', () => {
    expect(read('twin.ts')).toBe("const a = cn('flex p-4')\n")
    expect(read('Comp.vue')).toContain("const a = cn('flex p-4')\n")
  })
})

describe('E2E: oxfmt sorts template classes in .vue only (the docs recommend it)', () => {
  it('CANARY: oxfmt sorts a .vue template, leaves .svelte and .astro alone', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'oxtw-frameworks-oxfmt-'))
    try {
      writeFileSync(
        resolve(dir, '.oxfmtrc.json'),
        JSON.stringify({ sortTailwindcss: { stylesheet: ENTRY.split('\\').join('/') } }),
      )
      writeFileSync(
        resolve(dir, 'A.vue'),
        '<template>\n  <div class="p-4 flex">x</div>\n</template>\n',
      )
      writeFileSync(resolve(dir, 'B.svelte'), '<div class="p-4 flex">x</div>\n')
      writeFileSync(
        resolve(dir, 'C.astro'),
        '---\nconst a = 1\n---\n<div class="p-4 flex">x</div>\n',
      )
      run(OXFMT, ['--write', 'A.vue', 'B.svelte', 'C.astro'], dir)
      expect(readFileSync(resolve(dir, 'A.vue'), 'utf8')).toContain('class="flex p-4"')
      expect(readFileSync(resolve(dir, 'B.svelte'), 'utf8')).toContain('class="p-4 flex"')
      expect(readFileSync(resolve(dir, 'C.astro'), 'utf8')).toContain('class="p-4 flex"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
