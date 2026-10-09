import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { assertFreshDist, DIST_CJS } from './helpers/dist'

// enforce-logical / enforce-physical and enforce-shorthand rewrite the same
// classes: `mt-2 mb-2` is a block-axis pair to the first and a `my-2` to the
// second. Each rewrites the whole class string, so oxlint applies one fix per
// pass and the outcome used to depend on which ran first. The logical families
// of enforce-shorthand (`mbs`+`mbe` → `my`, …) make them meet: whichever fix
// lands first, the string ends the same. Real binary, `--fix` until it settles.

const ROOT = resolve(__dirname, '../..')
const IS_WINDOWS = process.platform === 'win32'
const OXLINT = resolve(ROOT, 'node_modules/.bin', IS_WINDOWS ? 'oxlint.cmd' : 'oxlint')
const ENTRY = resolve(ROOT, 'tests/fixtures/default.css').split('\\').join('/')

let base: string
let n = 0

beforeAll(() => {
  assertFreshDist()
  base = mkdtempSync(resolve(tmpdir(), 'oxtw-convergence-'))
})

afterAll(() => {
  if (base) rmSync(base, { recursive: true, force: true })
})

type Rules = Record<string, unknown>

/** Lint `classes` with each rule set in turn, three `--fix` passes each. */
function fixInOrder(classes: string, ...stages: Rules[]): string {
  const dir = resolve(base, `case-${n++}`)
  mkdirSync(resolve(dir, 'src'), { recursive: true })
  const file = resolve(dir, 'src/a.tsx')
  writeFileSync(file, `export const A = () => <div className="${classes}" />\n`)
  for (const rules of stages) {
    writeFileSync(
      resolve(dir, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off' },
        jsPlugins: [DIST_CJS.split('\\').join('/')],
        settings: { tailwindcss: { entryPoint: ENTRY } },
        rules,
      }),
    )
    for (let pass = 0; pass < 3; pass++) {
      try {
        execFileSync(OXLINT, ['--fix', 'src'], {
          cwd: dir,
          encoding: 'utf8',
          timeout: 60_000,
          shell: IS_WINDOWS,
          stdio: 'pipe',
        })
      } catch {
        // Remaining diagnostics exit 1; the file is what we read.
      }
    }
  }
  return /className="([^"]*)"/.exec(readFileSync(file, 'utf8'))![1]
}

const SHORTHAND: Rules = { 'tailwindcss/enforce-shorthand': 'warn' }

/** Every order the two fixes can land in: together, either one first. */
function allOrders(classes: string, directional: Rules): string[] {
  const both = { ...directional, ...SHORTHAND }
  return [
    fixInOrder(classes, both),
    fixInOrder(classes, directional, both),
    fixInOrder(classes, SHORTHAND, both),
  ]
}

describe('E2E: directional rules and enforce-shorthand converge', () => {
  it('enforce-logical: a block-axis pair ends as the shorthand', () => {
    const logical = { 'tailwindcss/enforce-logical': 'warn' }
    expect(allOrders('mt-2 mb-2', logical)).toEqual(['my-2', 'my-2', 'my-2'])
    expect(allOrders('top-0 bottom-0', logical)).toEqual(['inset-y-0', 'inset-y-0', 'inset-y-0'])
    expect(allOrders('left-0 right-0', logical)).toEqual(['inset-x-0', 'inset-x-0', 'inset-x-0'])
  })

  it('enforce-logical with sizing: a width and a height end as the logical pair', () => {
    const sizing = { 'tailwindcss/enforce-logical': ['warn', { sizing: true }] }
    expect(allOrders('w-4 h-4', sizing)).toEqual([
      'inline-4 block-4',
      'inline-4 block-4',
      'inline-4 block-4',
    ])
  })

  it('enforce-physical: a logical block pair ends as the shorthand', () => {
    const physical = { 'tailwindcss/enforce-physical': 'warn' }
    expect(allOrders('mbs-2 mbe-2', physical)).toEqual(['my-2', 'my-2', 'my-2'])
    expect(allOrders('inset-s-0 inset-e-0', physical)).toEqual([
      'inset-x-0',
      'inset-x-0',
      'inset-x-0',
    ])
  })
})
