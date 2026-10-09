import { describe, expect, it } from 'vitest'
import { splitClassesWithSeparators } from '../../src/utils/class-splitter'
import type { ClassLocation } from '../../src/utils/extractors'
import { reportClassReplacements, reportClassSuggestion } from '../../src/utils/report'

interface Fix {
  range: [number, number]
  text: string
}
interface Reported {
  messageId: string
  data: Record<string, string>
  fix?: (fixer: unknown) => Fix
  suggest?: { messageId: string; data: Record<string, string>; fix: (fixer: unknown) => Fix }[]
}

const fixer = {
  replaceTextRange: (range: [number, number], text: string): Fix => ({ range, text }),
}

function collect() {
  const reports: Reported[] = []
  return { reports, context: { report: (d: Reported) => reports.push(d) } }
}

const locOf = (value: string, extra: Partial<ClassLocation> = {}): ClassLocation =>
  ({ value, node: {}, range: [10, 10 + value.length], ...extra }) as ClassLocation

describe('reportClassSuggestion', () => {
  it('reports with a suggestion and no autofix', () => {
    const { reports, context } = collect()
    const loc = locOf('a b c')
    const split = splitClassesWithSeparators(loc.value)
    reportClassSuggestion(
      context,
      loc,
      split,
      split.classes,
      { cls: 'b', replacement: 'B' },
      { messageId: 'msg', data: { className: 'b' } },
    )
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ messageId: 'msg', data: { className: 'b' } })
    expect(reports[0].fix).toBeUndefined()
    const [suggestion] = reports[0].suggest!
    expect(suggestion).toMatchObject({
      messageId: 'suggestReplace',
      data: { className: 'b', replacement: 'B' },
    })
    expect(suggestion.fix(fixer)).toEqual({ range: [10, 15], text: 'a B c' })
  })

  it('replaces only its own class, and keeps a multiline block', () => {
    const { reports, context } = collect()
    const loc = locOf('\n    a b\n    c\n  ')
    const split = splitClassesWithSeparators(loc.value)
    reportClassSuggestion(
      context,
      loc,
      split,
      split.classes,
      { cls: 'c', replacement: 'C' },
      { messageId: 'msg', data: {}, suggestMessageId: 'other' },
    )
    const [suggestion] = reports[0].suggest!
    expect(suggestion.messageId).toBe('other')
    expect(suggestion.fix(fixer).text).toBe('\n    a b\n    C\n  ')
  })

  it("keeps a template quasi's edge spaces", () => {
    const { reports, context } = collect()
    const loc = locOf('a b', { preserveLeadingSpace: true, preserveTrailingSpace: true })
    const split = splitClassesWithSeparators(loc.value)
    reportClassSuggestion(
      context,
      loc,
      split,
      split.classes,
      { cls: 'a', replacement: 'A' },
      { messageId: 'msg', data: {} },
    )
    expect(reports[0].suggest![0].fix(fixer).text).toBe(' A b ')
  })
})

describe('reportClassReplacements', () => {
  it('autofixes on the first offender and suggests the same fix on the rest', () => {
    const { reports, context } = collect()
    const loc = locOf('a b c')
    const split = splitClassesWithSeparators(loc.value)
    reportClassReplacements(
      context,
      loc,
      split,
      split.classes,
      [
        { cls: 'a', replacement: 'A' },
        { cls: 'c', replacement: 'C' },
      ],
      { messageId: 'msg' },
    )
    expect(reports).toHaveLength(2)
    expect(reports[0].fix!(fixer).text).toBe('A b C')
    expect(reports[0].suggest).toBeUndefined()
    expect(reports[1].fix).toBeUndefined()
    expect(reports[1].suggest![0].fix(fixer).text).toBe('A b C')
  })

  it('reports nothing without offenders', () => {
    const { reports, context } = collect()
    const loc = locOf('a b')
    const split = splitClassesWithSeparators(loc.value)
    reportClassReplacements(context, loc, split, split.classes, [], { messageId: 'msg' })
    expect(reports).toHaveLength(0)
  })
})
