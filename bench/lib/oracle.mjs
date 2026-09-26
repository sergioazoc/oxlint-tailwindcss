// Checks with Tailwind itself as the judge, over the real corpus:
//   - an unknown-class report of a class Tailwind compiles is a false positive;
//   - a conflict report whose two classes share no property, in any variant
//     context, is a false positive;
//   - a fix that changes a class string's effective style (lib/css.mjs) —
//     other than a suggestion replacing a class Tailwind doesn't know with
//     one it does — changed what the page looks like.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { __unstable__loadDesignSystem } from '@tailwindcss/node'

import { cssEscape, effectiveStyle, styleDiff } from './css.mjs'
import { classesOf, stringLiterals } from './strings.mjs'

/** The corpus's Tailwind, as the engine lib/css.mjs expects. */
export async function loadEngine(cssPath) {
  const ds = await __unstable__loadDesignSystem(readFileSync(cssPath, 'utf8'), {
    base: dirname(cssPath),
  })
  const theme = new Map([...ds.theme.entries()].map(([name, entry]) => [name, entry.value]))
  const memo = new Map()
  const css = (cls) => {
    if (!memo.has(cls)) memo.set(cls, ds.candidatesToCss([cls])[0] ?? null)
    return memo.get(cls)
  }
  return {
    css,
    order: (classes) => ds.getClassOrder(classes),
    themeValue: (name) => theme.get(name),
    compiles: (cls) => css(cls) !== null,
  }
}

/** The utility of a class, without its variants: the text after the last top-level `:`. */
export function utilityOf(cls) {
  let depth = 0
  let last = -1
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (c === ':' && depth === 0) last = i
  }
  return cls.slice(last + 1)
}

/** Every stylesheet of the corpus app, for "defined in a project stylesheet". */
export function projectStylesheets(app) {
  const out = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) visit(path)
      else if (entry.endsWith('.css')) out.push(readFileSync(path, 'utf8'))
    }
  }
  visit(app)
  return out.join('\n')
}

const quoted = (message) => [...message.matchAll(/"([^"]+)"/g)].map((m) => m[1])

/**
 * Unknown-class reports, judged: `compiles` — Tailwind generates CSS for the
 * class, a false positive for sure; `inProjectCss` — a project stylesheet
 * defines it, so it most likely styles something.
 */
export function judgeUnknown(records, engine, stylesheets) {
  const reports = records.filter((r) => r.rule === 'no-unknown-classes' && r.cls)
  const compiles = reports.filter((r) => engine.compiles(r.cls))
  const inProjectCss = reports.filter(
    (r) => !engine.compiles(r.cls) && stylesheets.includes(`.${cssEscape(utilityOf(r.cls))}`),
  )
  return {
    reports: reports.length,
    compiles: compiles.map((r) => ({ file: r.file, line: r.line, cls: r.cls })),
    inProjectCss: inProjectCss.map((r) => ({ file: r.file, line: r.line, cls: r.cls })),
  }
}

/** Conflict reports, judged: the two classes named must set a property in a shared context. */
export function judgeConflicts(records, engine) {
  const reports = records.filter((r) => r.rule === 'no-conflicting-classes')
  const unfounded = reports.filter((r) => {
    const [a, b] = quoted(r.message).flatMap(classesOf)
    if (!a || !b) return false
    const keys = new Set(effectiveStyle([a], engine).style.keys())
    return ![...effectiveStyle([b], engine).style.keys()].some((k) => keys.has(k))
  })
  return {
    reports: reports.length,
    unfounded: unfounded.map((r) => ({ file: r.file, line: r.line, message: r.message })),
  }
}

/** Runs a fix over the corpus, returns each changed file before and after, and restores it. */
export function applyFixes({ corpusDir, app, lint }) {
  lint()
  const inApp = relative(corpusDir, app)
  const changed = execFileSync('git', ['-C', corpusDir, 'diff', '--name-only', '--', inApp], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  const files = changed.map((file) => ({
    file: relative(inApp, file).split('\\').join('/'),
    before: execFileSync('git', ['-C', corpusDir, 'show', `HEAD:${file}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
    after: readFileSync(join(corpusDir, file), 'utf8'),
  }))
  if (changed.length > 0) execFileSync('git', ['-C', corpusDir, 'checkout', '--', ...changed])
  return files
}

/**
 * What the fixed strings do: each changed class string before and after,
 * judged by its effective style.
 */
export function judgeFixes(files, engine) {
  const result = {
    files: files.length,
    strings: 0,
    equivalent: 0,
    typos: [],
    changed: [],
    unpaired: [],
  }
  for (const { file, before, after } of files) {
    const a = stringLiterals(before)
    const b = stringLiterals(after)
    if (a.length !== b.length) {
      result.unpaired.push(file)
      continue
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue
      result.strings++
      const diff = styleDiff(
        effectiveStyle(classesOf(a[i]), engine),
        effectiveStyle(classesOf(b[i]), engine),
      )
      if (diff === null) {
        result.equivalent++
        continue
      }
      const entry = { file, before: a[i].trim(), after: b[i].trim(), diff }
      // A suggestion that replaces a class Tailwind doesn't know with one it
      // does changes what that class declares, and nothing else: a typo fixed.
      const was = new Set(classesOf(a[i]))
      const added = classesOf(b[i]).filter((c) => !was.has(c) && engine.compiles(c))
      const declared = new Set(added.flatMap((c) => [...effectiveStyle([c], engine).declared]))
      const typo =
        diff.removedUnknown.length > 0 &&
        diff.addedUnknown.length === 0 &&
        diff.changed.every((c) => declared.has(c.key))
      if (typo) {
        result.typos.push(entry)
      } else {
        result.changed.push(entry)
      }
    }
  }
  return result
}
