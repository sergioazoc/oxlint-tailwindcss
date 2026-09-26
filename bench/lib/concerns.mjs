// Scoring the seeded files: each mistake is labeled with the concerns that
// describe it (`expect: palette`), and each clean line with `expect: ok`. A
// tool catches a mistake when it reports that line with a rule of one of its
// concerns; it raises a false alarm when it reports an `ok` line with a rule of
// any concern that isn't formatting policy.
//
// Which rule belongs to which concern is not decided here: ours and
// @shadcn/lint's come from the /shadcn page's data, better-tailwindcss's from
// the migration guide's (their rule ↔ ours) — the data interop.mjs checks
// against the real tools — plus bench/data/concerns.json for the concerns
// /shadcn has no row for.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const TOOLS = ['tailwindcss', 'shadcn', 'better-tailwindcss']

/**
 * @returns {Map<string, { id: string, label: { en: string, es: string }, formatting: boolean,
 *   rules: Record<string, Set<string>> }>}
 */
export function buildConcerns(shadcnData, btwData, extraData) {
  const concerns = new Map()
  const add = (id, label, ours, shadcn, formatting) => {
    if (concerns.has(id)) throw new Error(`concern "${id}" is defined twice`)
    concerns.set(id, {
      id,
      label,
      formatting,
      rules: {
        tailwindcss: new Set(ours),
        shadcn: new Set(shadcn),
        'better-tailwindcss': new Set(),
      },
    })
  }
  const formatting = new Set(extraData.formatting ?? [])
  for (const c of shadcnData.concerns) add(c.id, c.label, c.ours, c.shadcn, formatting.has(c.id))
  for (const e of extraData.extra) {
    add(e.id, e.label, e.ours, e.shadcn ?? [], Boolean(e.formatting) || formatting.has(e.id))
  }
  for (const row of btwData.rules) {
    for (const concern of concerns.values()) {
      if (concern.rules.tailwindcss.has(row.ours))
        concern.rules['better-tailwindcss'].add(row.theirs)
    }
  }
  return concerns
}

export function loadConcerns(repo) {
  const read = (path) => JSON.parse(readFileSync(join(repo, path), 'utf8'))
  return buildConcerns(
    read('packages/docs/data/shadcn-lint.json'),
    read('packages/docs/data/better-tailwindcss.json'),
    read('bench/data/concerns.json'),
  )
}

const EXPECT = /expect: ([a-z-]+(?:,\s*[a-z-]+)*)/

/** `expect:` comments → the line each labels (the next one) and its concerns, `ok` included. */
export function parseExpectations(source) {
  return source.split('\n').flatMap((text, i) => {
    const match = EXPECT.exec(text)
    return match ? [{ line: i + 2, concerns: match[1].split(/,\s*/) }] : []
  })
}

/**
 * Scores one tool on one file's expectations, from its normalized records
 * (lib/normalize.mjs) for that file.
 */
export function scoreExpectations(expectations, records, tool, concerns) {
  const own = records.filter((r) => r.tool === tool)
  const alarmRules = new Set()
  const knownRules = new Set()
  for (const concern of concerns.values()) {
    for (const rule of concern.rules[tool]) {
      knownRules.add(rule)
      if (!concern.formatting) alarmRules.add(rule)
    }
  }
  return expectations.map(({ line, concerns: ids }) => {
    const onLine = own.filter((r) => r.line === line)
    if (ids.length === 1 && ids[0] === 'ok') {
      // A rule no concern names counts against the tool: the taxonomy has a gap.
      const alarms = onLine.filter((r) => alarmRules.has(r.rule) || !knownRules.has(r.rule))
      return { line, concerns: ids, ok: true, alarms: [...new Set(alarms.map((r) => r.rule))] }
    }
    for (const id of ids) {
      if (!concerns.has(id)) throw new Error(`line ${line}: unknown concern "${id}"`)
    }
    const by = onLine.filter((r) => ids.some((id) => concerns.get(id).rules[tool].has(r.rule)))
    return {
      line,
      concerns: ids,
      ok: false,
      caught: by.length > 0,
      by: [...new Set(by.map((r) => r.rule))],
    }
  })
}
