import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DYNAMIC, classesOf, stringLiterals } from '../lib/strings.mjs'

describe('stringLiterals', () => {
  it('reads every literal in order, comments skipped', () => {
    const source = [
      'import { cn } from "cn" // "not this"',
      '/* "nor this" */',
      'const a = cn(\'p-4\', "flex\\"x")',
      '<div className="mt-2 mb-2" />',
    ].join('\n')
    assert.deepEqual(stringLiterals(source), ['cn', 'p-4', 'flex"x', 'mt-2 mb-2'])
  })

  it('marks what a template literal interpolates', () => {
    assert.deepEqual(stringLiterals('x = `bg-${tone}-500 ${`p-${n}`} p-2`'), [
      `bg-${DYNAMIC}-500 ${DYNAMIC} p-2`,
    ])
  })

  it("reads a JSX attribute's value across lines", () => {
    const source = '<div className="\n  flex\n  p-4\n">Don\'t</div>\n<p className="mt-2" />'
    assert.deepEqual(stringLiterals(source), ['\n  flex\n  p-4\n', 'mt-2'])
  })

  it('a stray quote in JSX text costs its own line only', () => {
    const source = '<p className="text-sm">Don\'t panic</p>\n<p className="p-4" />'
    assert.deepEqual(stringLiterals(source), ['text-sm', 'p-4'])
  })
})

describe('classesOf', () => {
  it('splits on any whitespace and drops dynamic parts', () => {
    assert.deepEqual(classesOf(`flex\n  p-4 bg-${DYNAMIC}-500 ${DYNAMIC} mt-2`), [
      'flex',
      'p-4',
      'mt-2',
    ])
  })
})
