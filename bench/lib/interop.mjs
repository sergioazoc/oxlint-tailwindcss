// What `/shadcn` says each tool reports, against what it does.
//
// packages/docs/data/shadcn-lint.json lists, per concern, example snippets and
// the rules of each tool that report them. `columnMismatches` checks one
// column against a lint run; `combinedGaps` checks the page's combined config:
// every example is still reported by someone, and each concern by the tool it
// is given to.

/** One file per example: `<concern>-<n>.tsx`. */
export function exampleFiles(concerns) {
  return concerns.flatMap((c) =>
    c.examples.map((example, i) => ({ file: `${c.id}-${i}.tsx`, concern: c.id, example })),
  )
}

/** The module an example is linted in: a component, with a Button imported from the UI kit. */
export function exampleModule(example) {
  return (
    'import { Button } from "@/components/ui/button"\n\n' +
    `export function Example({ tone }: { tone: string }) {\n  return ${example}\n}\n`
  )
}

/** `file → Set<"tool/rule">` from an oxlint `-f json` report. */
export function firedRules(report) {
  const fired = new Map()
  for (const d of report.diagnostics) {
    const file = d.filename.split(/[\\/]/).pop()
    const m = /^([\w@/-]+)\((.+)\)$/.exec(d.code ?? '')
    const rule = m ? `${m[1]}/${m[2]}` : (d.code ?? 'parse error')
    if (!fired.has(file)) fired.set(file, new Set())
    fired.get(file).add(rule)
  }
  return fired
}

/**
 * Where a column (`shadcn` or `ours`, rules of `tool`) disagrees with a run:
 * an example firing a rule its concern doesn't list, or a listed rule none of
 * the concern's examples fire.
 */
export function columnMismatches(concerns, fired, column, tool) {
  const out = []
  for (const c of concerns) {
    const listed = new Set(c[column].map((r) => `${tool}/${r}`))
    const seen = new Set()
    c.examples.forEach((example, i) => {
      for (const rule of fired.get(`${c.id}-${i}.tsx`) ?? []) {
        if (!rule.startsWith(`${tool}/`)) continue
        seen.add(rule)
        if (!listed.has(rule)) out.push(`${c.id}: ${example} is reported by ${rule}, not listed`)
      }
    })
    for (const rule of listed) {
      if (!seen.has(rule)) out.push(`${c.id}: ${rule} is listed but reports none of its examples`)
    }
  }
  return out
}

const TOOL = { ours: 'tailwindcss', shadcn: 'shadcn' }

/**
 * Under the combined config: an example nobody reports (turning a rule off
 * lost it), or a concern its owner (`use`) reports in none of its examples.
 */
export function combinedGaps(concerns, fired) {
  const out = []
  for (const c of concerns) {
    const owners = c.use === 'both' ? ['ours', 'shadcn'] : [c.use]
    const byOwner = new Set()
    c.examples.forEach((example, i) => {
      const rules = [...(fired.get(`${c.id}-${i}.tsx`) ?? [])]
      if (rules.length === 0) out.push(`${c.id}: nothing reports ${example}`)
      for (const owner of owners) {
        if (rules.some((r) => r.startsWith(`${TOOL[owner]}/`))) byOwner.add(owner)
      }
    })
    for (const owner of owners) {
      if (!byOwner.has(owner)) {
        out.push(`${c.id}: left to ${owner}, which reports none of its examples`)
      }
    }
  }
  return out
}

/** The JSON of the fence between `<!-- generated:<id> -->` markers in a page. */
export function generatedFence(markdown, id) {
  const open = `<!-- generated:${id} -->`
  const start = markdown.indexOf(open)
  const end = markdown.indexOf(`<!-- /generated:${id} -->`)
  if (start === -1 || end === -1) throw new Error(`no generated:${id} block`)
  const fence = /```jsonc?\n([\s\S]*?)```/.exec(markdown.slice(start, end))
  if (!fence) throw new Error(`generated:${id} holds no json fence`)
  return JSON.parse(fence[1].replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'))
}
