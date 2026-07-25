/**
 * Builds a `CssDeclarationIndex` from a readable declaration list, so tests can
 * state what a class emits instead of hand-writing interned base36 ids.
 *
 * Mirrors the encoder in `sync-loader.ts`'s PRECOMPUTE_SCRIPT: same scope
 * grammar (`''` element, `'>'` descendant, `'::name'` pseudo-element, leading
 * `'@'` conditional), same packed `byClass` format.
 */

import { type CssDeclarationIndex } from '../../src/design-system/css-declarations'

/** `[scope, property, value]` — scope follows the token grammar above. */
export type TestDecl = [scope: string, prop: string, value: string]

export interface MakeDeclarationsOptions {
  /** Classes whose CSS is deliberately not fully modelled. */
  partial?: string[]
  /** Per value, custom properties read only inside another `var()`'s fallback. */
  fallbackVars?: Record<string, string[]>
}

const VAR_READ_RE = /var\(\s*(--[\w-]+)/g

function stripVarGroups(value: string): string {
  let rest = ''
  let i = 0
  while (i < value.length) {
    if (value.startsWith('var(', i)) {
      let depth = 1
      let j = i + 4
      while (j < value.length && depth > 0) {
        if (value[j] === '(') depth++
        else if (value[j] === ')') depth--
        j++
      }
      i = j
      continue
    }
    rest += value[i++]
  }
  return rest
}

export function makeDeclarations(
  byClassDecls: Record<string, TestDecl[]>,
  options: MakeDeclarationsOptions = {},
): CssDeclarationIndex {
  const scopes: string[] = ['']
  const props: string[] = []
  const values: string[] = []
  const vars: string[] = []
  const table: string[] = []
  const byClass: Record<string, string> = {}
  const valueVars: Record<string, number[]> = {}
  const valueFallbackVars: Record<string, number[]> = {}
  const pureValues: number[] = []

  const intern = (list: string[], item: string): number => {
    const at = list.indexOf(item)
    if (at >= 0) return at
    list.push(item)
    return list.length - 1
  }

  const internValue = (value: string): number => {
    const known = values.indexOf(value)
    if (known >= 0) return known
    values.push(value)
    const id = values.length - 1
    const reads: number[] = []
    VAR_READ_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = VAR_READ_RE.exec(value)) !== null) {
      const varId = intern(vars, m[1])
      if (!reads.includes(varId)) reads.push(varId)
    }
    const fallback = options.fallbackVars?.[value]
    if (fallback) {
      const fallbackIds = fallback.map((name) => intern(vars, name))
      valueFallbackVars[String(id)] = fallbackIds
      // A name listed as fallback-only must not also count as a direct read.
      const primary = reads.filter((r) => !fallbackIds.includes(r))
      if (primary.length > 0) valueVars[String(id)] = primary
    } else if (reads.length > 0) {
      valueVars[String(id)] = reads
    }
    if (reads.length > 0 && /^[\s,]*$/.test(stripVarGroups(value))) pureValues.push(id)
    return id
  }

  for (const [cls, decls] of Object.entries(byClassDecls)) {
    const ids: string[] = []
    for (const [scope, prop, value] of decls) {
      const key =
        intern(scopes, scope).toString(36) +
        '|' +
        intern(props, prop).toString(36) +
        '|' +
        internValue(value).toString(36)
      let declId = table.indexOf(key)
      if (declId < 0) {
        table.push(key)
        declId = table.length - 1
      }
      ids.push(declId.toString(36))
    }
    byClass[cls] = ids.join(',')
  }

  return {
    partial: options.partial ?? [],
    scopes,
    props,
    values,
    vars,
    valueVars,
    valueFallbackVars,
    pureValues,
    table,
    byClass,
  }
}
