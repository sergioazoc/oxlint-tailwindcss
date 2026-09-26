/**
 * The /benchmark and /comparison tables, rendered from bench/results/latest.json
 * (written by bench/score.mjs). Pure: every number on those pages comes from
 * the results file through here, so none is typed by hand, and
 * `tests/blocks.test.ts` fails when a page holds tables older than the file.
 */

import { code, table, type Locale } from './blocks.ts'

export type ToolId = 'tailwindcss' | 'shadcn' | 'better-tailwindcss'
const TOOL_IDS: readonly ToolId[] = ['tailwindcss', 'shadcn', 'better-tailwindcss']

interface CorpusRun {
  config: string
  files: number
  diagnostics: number
  warmMs: number
  coldMs?: number
}

interface FixChange {
  file: string
  before: string
  after: string
  diff: {
    changed: { key: string; before: string | null; after: string | null }[]
    removedUnknown: string[]
    addedUnknown: string[]
  }
}

interface FixRun {
  files: number
  strings: number
  equivalent: number
  typos: FixChange[]
  changed: FixChange[]
  unpaired: string[]
}

export interface BenchResults {
  meta: {
    corpus: { repo: string; sha: string; app: string }
    runs: number
    machine: { cpu: string; cores: number; os: string }
    node: string
    tools: Record<ToolId, { name: string; version: string; config: string }>
    oxlint: string
    tailwindcss: string
  }
  concerns: {
    id: string
    label: Record<Locale, string>
    formatting: boolean
    rules: Record<ToolId, string[]>
  }[]
  seeded: {
    lines: {
      file: string
      line: number
      concerns: string[]
      code: string
      tools: Record<ToolId, { caught?: boolean; by?: string[]; alarms?: string[] }>
    }[]
    summary: Record<ToolId, { caught: number; mistakes: number; falseAlarms: number; ok: number }>
  }
  corpus: Record<ToolId, { all: CorpusRun; recommended?: CorpusRun }>
  oracles: Record<
    ToolId,
    {
      unknown: { reports: number; compiles: unknown[]; inProjectCss: unknown[] }
      conflicts: { reports: number; unfounded: unknown[] }
      fixes: Record<'autofix' | 'suggestions', FixRun>
    }
  >
}

const T = {
  en: {
    tool: 'Tool',
    rules: 'Rules',
    all: 'all',
    recommended: 'recommended',
    warm: 'Warm run',
    cold: 'Cold run',
    diagnostics: 'Diagnostics',
    concern: 'Mistake',
    seeded: 'Seeded',
    total: 'All mistakes',
    falseAlarms: 'False alarms on the clean lines',
    code: 'Code',
    ok: 'clean',
    unknownReports: 'Unknown-class reports',
    compiles: '…of classes Tailwind compiles',
    inCss: '…of classes a project stylesheet defines',
    conflictReports: 'Conflict reports',
    unfounded: '…of classes that share no property',
    mode: 'Run',
    autofix: '`--fix`',
    suggestions: '`--fix --fix-suggestions`',
    strings: 'Class strings changed',
    same: 'Same style',
    typos: 'Typo fixed',
    changedStyle: 'Style changed',
    none: 'none',
    noFixes: 'no autofix',
    changesOf: (tool: string, n: number, mode: string) =>
      `${tool}: ${n} ${n === 1 ? 'string' : 'strings'} whose style ${mode} changed`,
    by: { autofix: '`--fix`', suggestions: '`--fix --fix-suggestions`' },
    unknownAdded: 'adds a class Tailwind doesn’t know',
    unknownRemoved: 'removes a class Tailwind doesn’t know',
    more: (n: number) => `…and ${n} more`,
    corpus: 'Corpus',
    files: 'files',
    machine: 'Machine',
    runs: (n: number) => `median of ${n} runs`,
    versions: 'Versions',
    has: '✓',
    lacks: '—',
    summary: 'Summary',
    seededRow: 'Seeded mistakes caught',
    alarmsRow: 'False alarms on clean lines',
    diagnosticsRow: 'Diagnostics on the corpus, all rules',
    warmRow: 'Warm run, all rules',
    unknownRow: 'Unknown-class reports Tailwind compiles',
    fixRow: '`--fix`: strings whose style changed',
  },
  es: {
    tool: 'Herramienta',
    rules: 'Reglas',
    all: 'todas',
    recommended: 'recomendadas',
    warm: 'En caliente',
    cold: 'En frío',
    diagnostics: 'Diagnósticos',
    concern: 'Error',
    seeded: 'Sembrados',
    total: 'Todos los errores',
    falseAlarms: 'Falsas alarmas en las líneas limpias',
    code: 'Código',
    ok: 'limpia',
    unknownReports: 'Reportes de clase desconocida',
    compiles: '…de clases que Tailwind compila',
    inCss: '…de clases que define una hoja de estilos del proyecto',
    conflictReports: 'Reportes de conflicto',
    unfounded: '…de clases que no comparten ninguna propiedad',
    mode: 'Corrida',
    autofix: '`--fix`',
    suggestions: '`--fix --fix-suggestions`',
    strings: 'Strings de clases cambiados',
    same: 'Mismo estilo',
    typos: 'Typo corregido',
    changedStyle: 'Estilo cambiado',
    none: 'ninguno',
    noFixes: 'sin autofix',
    changesOf: (tool: string, n: number, mode: string) =>
      `${tool}: ${n} ${n === 1 ? 'string cuyo estilo' : 'strings cuyo estilo'} ${mode} cambió`,
    by: { autofix: '`--fix`', suggestions: '`--fix --fix-suggestions`' },
    unknownAdded: 'agrega una clase que Tailwind no conoce',
    unknownRemoved: 'quita una clase que Tailwind no conoce',
    more: (n: number) => `…y ${n} más`,
    corpus: 'Corpus',
    files: 'archivos',
    machine: 'Máquina',
    runs: (n: number) => `mediana de ${n} corridas`,
    versions: 'Versiones',
    has: '✓',
    lacks: '—',
    summary: 'Resumen',
    seededRow: 'Errores sembrados atrapados',
    alarmsRow: 'Falsas alarmas en líneas limpias',
    diagnosticsRow: 'Diagnósticos en el corpus, todas las reglas',
    warmRow: 'En caliente, todas las reglas',
    unknownRow: 'Clases desconocidas que Tailwind compila',
    fixRow: '`--fix`: strings cuyo estilo cambió',
  },
} as const

const number = (n: number, locale: Locale) => n.toLocaleString(locale === 'es' ? 'es' : 'en')
const seconds = (ms: number, locale: Locale) =>
  `${(ms / 1000).toLocaleString(locale === 'es' ? 'es' : 'en', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} s`
const ratio = (a: number, b: number, locale: Locale) => `${number(a, locale)}/${number(b, locale)}`
const toolName = (r: BenchResults, id: ToolId) => r.meta.tools[id].name
const toolLabel = (r: BenchResults, id: ToolId) =>
  `${r.meta.tools[id].name} ${r.meta.tools[id].version}`

/** What was measured, on what, with what. */
export function benchSetup(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const { repo, sha, app } = r.meta.corpus
  const web = repo.replace(/\.git$/, '')
  const files = r.corpus.tailwindcss.all.files
  return [
    `- **${t.corpus}**: [${web.replace('https://github.com/', '')} \`${app}\`](${web}/tree/${sha}/${app}) @ \`${sha.slice(0, 8)}\`, ${number(files, locale)} ${t.files}`,
    `- **${t.versions}**: ${TOOL_IDS.map((id) => toolLabel(r, id)).join(', ')}; oxlint ${r.meta.oxlint}, tailwindcss ${r.meta.tailwindcss}`,
    `- **${t.machine}**: ${r.meta.machine.cpu}, ${r.meta.machine.cores} cores, ${r.meta.machine.os}, Node ${r.meta.node.replace(/^v/, '')}; ${t.runs(r.meta.runs)}`,
  ].join('\n')
}

/** Wall time over the corpus, and how many diagnostics each run reports. */
export function benchSpeed(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const rows: string[][] = []
  for (const id of TOOL_IDS) {
    for (const kind of ['all', 'recommended'] as const) {
      const run = r.corpus[id][kind]
      if (!run) continue
      rows.push([
        toolName(r, id),
        t[kind],
        seconds(run.warmMs, locale),
        run.coldMs === undefined ? t.lacks : seconds(run.coldMs, locale),
        number(run.diagnostics, locale),
      ])
    }
  }
  return table([t.tool, t.rules, t.warm, t.cold, t.diagnostics], rows)
}

/** The mistakes of one concern — a line's first concern — and who caught them. */
function byConcern(r: BenchResults) {
  const lines = r.seeded.lines.filter((l) => l.concerns[0] !== 'ok')
  const ids = [...new Set(lines.map((l) => l.concerns[0]))]
  return ids.map((id) => ({
    concern: r.concerns.find((c) => c.id === id)!,
    lines: lines.filter((l) => l.concerns[0] === id),
  }))
}

/** Seeded mistakes caught, by concern, and false alarms on the clean lines. */
export function benchSeeded(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const rows = byConcern(r).map(({ concern, lines }) => [
    concern.label[locale],
    ...TOOL_IDS.map((id) =>
      ratio(lines.filter((l) => l.tools[id].caught).length, lines.length, locale),
    ),
  ])
  rows.push([
    `**${t.total}**`,
    ...TOOL_IDS.map((id) => {
      const s = r.seeded.summary[id]
      return `**${ratio(s.caught, s.mistakes, locale)}**`
    }),
  ])
  rows.push([
    t.falseAlarms,
    ...TOOL_IDS.map((id) => {
      const s = r.seeded.summary[id]
      return ratio(s.falseAlarms, s.ok, locale)
    }),
  ])
  return table([t.concern, ...TOOL_IDS.map((id) => toolName(r, id))], rows)
}

/** Every labeled line: its code, what it is, and each tool's verdict. */
export function benchSeededLines(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const label = (id: string) =>
    id === 'ok' ? t.ok : (r.concerns.find((c) => c.id === id)?.label[locale] ?? id)
  const rows = r.seeded.lines.map((l) => {
    const ok = l.concerns[0] === 'ok'
    return [
      code(l.code.length > 90 ? `${l.code.slice(0, 87)}…` : l.code),
      label(l.concerns[0]),
      ...TOOL_IDS.map((id) => {
        const v = l.tools[id]
        if (ok) return v.alarms?.length ? `✗ ${v.alarms.map(code).join(', ')}` : '✓'
        return v.caught ? '✓' : '✗'
      }),
    ]
  })
  return table([t.code, t.concern, ...TOOL_IDS.map((id) => toolName(r, id))], rows)
}

/** Unknown-class and conflict reports on the corpus, judged by Tailwind. */
export function benchOracles(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const cell = (has: boolean, n: number) => (has ? number(n, locale) : t.lacks)
  const rows = TOOL_IDS.map((id) => {
    const o = r.oracles[id]
    const hasConflicts = r.concerns.some((c) => c.id === 'conflicts' && c.rules[id].length > 0)
    return [
      toolName(r, id),
      number(o.unknown.reports, locale),
      number(o.unknown.compiles.length, locale),
      number(o.unknown.inProjectCss.length, locale),
      cell(hasConflicts, o.conflicts.reports),
      cell(hasConflicts, o.conflicts.unfounded.length),
    ]
  })
  return table(
    [t.tool, t.unknownReports, t.compiles, t.inCss, t.conflictReports, t.unfounded],
    rows,
  )
}

/** What `--fix` and `--fix --fix-suggestions` did to each class string. */
export function benchFixes(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const rows: string[][] = []
  for (const id of TOOL_IDS) {
    for (const mode of ['autofix', 'suggestions'] as const) {
      const f = r.oracles[id].fixes[mode]
      if (f.strings === 0) {
        rows.push([toolName(r, id), t[mode], t.noFixes, t.lacks, t.lacks, t.lacks])
        continue
      }
      rows.push([
        toolName(r, id),
        t[mode],
        number(f.strings, locale),
        number(f.equivalent, locale),
        number(f.typos.length, locale),
        f.changed.length === 0 ? '0' : `**${number(f.changed.length, locale)}**`,
      ])
    }
  }
  return table([t.tool, t.mode, t.strings, t.same, t.typos, t.changedStyle], rows)
}

const LISTED = 12

/** Inline code outside a table: nothing to escape but `{{`, which VitePress reads as Vue. */
const inline = (text: string) =>
  text.includes('{{') ? `<span v-pre>\`${text}\`</span>` : `\`${text}\``

/** Each string whose style a fix changed, before and after, with what changed. */
export function benchFixChanges(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const out: string[] = []
  for (const id of TOOL_IDS) {
    const autofix = r.oracles[id].fixes.autofix.changed
    // Suggestion runs include the autofixes: list what only the suggestions add.
    const seen = new Set(autofix.map((c) => `${c.file}\0${c.before}`))
    const suggestions = r.oracles[id].fixes.suggestions.changed.filter(
      (c) => !seen.has(`${c.file}\0${c.before}`),
    )
    for (const [mode, changes] of [
      ['autofix', autofix],
      ['suggestions', suggestions],
    ] as const) {
      if (changes.length === 0) continue
      out.push(`::: details ${t.changesOf(toolName(r, id), changes.length, t.by[mode])}`, '')
      for (const c of changes.slice(0, LISTED)) {
        const what = [
          ...c.diff.changed
            .slice(0, 3)
            .map(
              (d) =>
                `${inline(d.key)}: ${d.before === null ? t.none : inline(d.before)} → ${d.after === null ? t.none : inline(d.after)}`,
            ),
          ...(c.diff.addedUnknown.length
            ? [`${t.unknownAdded}: ${c.diff.addedUnknown.map(inline).join(', ')}`]
            : []),
          ...(c.diff.removedUnknown.length
            ? [`${t.unknownRemoved}: ${c.diff.removedUnknown.map(inline).join(', ')}`]
            : []),
        ]
        out.push(
          `- \`${c.file}\``,
          '',
          '  ```diff',
          `  - ${c.before.replace(/\s+/g, ' ')}`,
          `  + ${c.after.replace(/\s+/g, ' ')}`,
          '  ```',
          '',
          ...what.map((w) => `  ${w}  `),
          '',
        )
      }
      if (changes.length > LISTED) out.push(t.more(changes.length - LISTED), '')
      out.push(':::', '')
    }
  }
  return out.join('\n').trim()
}

/** Which concerns each tool has a rule for, and the headline numbers side by side. */
export function comparisonCoverage(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const concerns = [...r.concerns].sort((a, b) => Number(a.formatting) - Number(b.formatting))
  return table(
    [t.concern, ...TOOL_IDS.map((id) => toolName(r, id))],
    concerns.map((c) => [
      c.label[locale],
      ...TOOL_IDS.map((id) => (c.rules[id].length > 0 ? t.has : t.lacks)),
    ]),
  )
}

export function comparisonSummary(r: BenchResults, locale: Locale): string {
  const t = T[locale]
  const row = (label: string, value: (id: ToolId) => string) => [label, ...TOOL_IDS.map(value)]
  return table(
    [t.summary, ...TOOL_IDS.map((id) => toolLabel(r, id))],
    [
      row(t.seededRow, (id) => {
        const s = r.seeded.summary[id]
        return ratio(s.caught, s.mistakes, locale)
      }),
      row(t.alarmsRow, (id) => {
        const s = r.seeded.summary[id]
        return ratio(s.falseAlarms, s.ok, locale)
      }),
      row(t.warmRow, (id) => seconds(r.corpus[id].all.warmMs, locale)),
      row(t.unknownRow, (id) =>
        ratio(r.oracles[id].unknown.compiles.length, r.oracles[id].unknown.reports, locale),
      ),
      row(t.fixRow, (id) => {
        const f = r.oracles[id].fixes.autofix
        return f.strings === 0 ? t.noFixes : ratio(f.changed.length, f.strings, locale)
      }),
    ],
  )
}
