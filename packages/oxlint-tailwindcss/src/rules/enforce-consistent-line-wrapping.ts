import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { createLazyOptions, safeSourceCode } from '../utils/context'
import { getVariantPrefix } from '../utils/class-parser'

interface Options {
  printWidth?: number
  classesPerLine?: number
}

const DEFAULT_PRINT_WIDTH = 80

/** One indentation level added below the statement's base indent for wrapped lines. */
const INDENT_UNIT = '  '

/** Group `classes` into chunks of at most `n`, each chunk space-joined. */
function chunkList(classes: string[], n: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < classes.length; i += n) {
    chunks.push(classes.slice(i, i + n).join(' '))
  }
  return chunks
}

/**
 * Greedily pack `classes` into space-joined lines, adding classes to the
 * current line until `indent` + the line would exceed `width`. A single class
 * that alone exceeds the budget still gets its own line.
 */
function packToWidth(classes: string[], indent: string, width: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const cls of classes) {
    const candidate = current === '' ? cls : current + ' ' + cls
    if (current !== '' && indent.length + candidate.length > width) {
      lines.push(current)
      current = cls
    } else {
      current = candidate
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

/**
 * Split `classes` into runs of consecutive classes sharing the same variant
 * chain ("hover:", "md:hover:", "" for base utilities), so wrapping breaks
 * between variant groups rather than mid-group.
 */
function groupByVariantRun(classes: string[]): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  let currentVariant: string | null = null
  for (const cls of classes) {
    const variant = getVariantPrefix(cls)
    if (currentVariant !== null && variant !== currentVariant) {
      groups.push(current)
      current = []
    }
    currentVariant = variant
    current.push(cls)
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/** Pack each variant group onto its own line(s): groups never share a line. */
function packGroupedToWidth(classes: string[], indent: string, width: number): string[] {
  return groupByVariantRun(classes).flatMap((group) => packToWidth(group, indent, width))
}

export const enforceConsistentLineWrapping = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn when a class string exceeds the configured print width',
    },
    fixable: 'whitespace',
    schema: [
      {
        type: 'object',
        properties: {
          printWidth: { type: 'number' },
          classesPerLine: { type: 'number' },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ printWidth: DEFAULT_PRINT_WIDTH }],
    messages: {
      tooLong:
        'Class string exceeds the print width of {{printWidth}} (longest line is {{length}} characters). Consider splitting into multiple lines or extracting into a component.',
      tooManyPerLine:
        'Too many classes on a single line ({{count}}). Maximum allowed per line is {{max}}.',
      inconsistentWrapping:
        'Class string is not wrapped consistently. Classes should be grouped by variant and wrapped within the print width of {{printWidth}}.',
    },
  },
  createOnce(context) {
    const getPrintWidth = createLazyOptions<Options, number>(
      context,
      (o) => o?.printWidth ?? DEFAULT_PRINT_WIDTH,
    )
    const getClassesPerLine = createLazyOptions<Options, number | undefined>(
      context,
      (o) => o?.classesPerLine,
    )

    /**
     * The statement's real base indentation — the leading whitespace of the
     * source line the opening backtick sits on. NOT `node.loc.start.column`,
     * which is the backtick's column (e.g. 18 for `const className = ` and
     * deeper still inside nested JSX). Falls back to `''` when `sourceCode`
     * is unavailable (block still lands correctly for top-level statements).
     */
    function deriveBaseIndent(loc: ClassLocation): string {
      const sc = safeSourceCode(context)
      const line = loc.node.loc?.start.line
      if (sc?.lines && typeof line === 'number' && line >= 1 && line <= sc.lines.length) {
        const src = sc.lines[line - 1] ?? ''
        const m = /^[ \t]*/.exec(src)
        return m ? m[0] : ''
      }
      return ''
    }

    /**
     * Re-wrap a template literal's classes into the block convention,
     * non-destructively:
     *  - single-line → convert to a `\n` + indent block (unless the quasi is
     *    glued to a `${}`, in which case keep it inline/hanging so adjacency
     *    survives);
     *  - already multiline → re-wrap ONLY the lines that exceed the budget,
     *    reusing each line's own indent; conforming lines are left verbatim.
     */
    function rewrapTemplate(loc: ClassLocation, lines: string[], classesPerLine: number): string {
      const baseIndent = deriveBaseIndent(loc)
      const interiorIndent = baseIndent + INDENT_UNIT

      if (lines.length === 1) {
        const chunks = chunkList(splitClasses(loc.value), classesPerLine)
        const standalone = !loc.preserveLeadingSpace && !loc.preserveTrailingSpace
        if (standalone) {
          return '\n' + chunks.map((c) => interiorIndent + c).join('\n') + '\n' + baseIndent
        }
        // Fragment adjacent to a `${}`: hanging join, no leading/trailing newline.
        return chunks.join('\n' + interiorIndent)
      }

      return lines
        .map((line) => {
          const classes = splitClasses(line)
          if (classes.length <= classesPerLine) return line
          const m = /^[ \t]*/.exec(line)
          const lineIndent = m && m[0].length > 0 ? m[0] : interiorIndent
          return chunkList(classes, classesPerLine)
            .map((c) => lineIndent + c)
            .join('\n')
        })
        .join('\n')
    }

    /**
     * Width-based variant of `rewrapTemplate`: classes are grouped into runs
     * sharing a variant chain (each run starts its own line), and within a
     * run classes are packed onto a line until adding the next one would
     * exceed `printWidth` (indent included). Multiline templates are fully
     * re-laid-out into that canonical grouped form, not just their
     * offending lines. Same indentation conventions as `rewrapTemplate`.
     * Reserves one character per preserved leading/trailing space, since
     * `preserveSpaces` re-adds them after packing — without the reserve a
     * line packed to exactly `printWidth` lands at `printWidth + 1` and the
     * fix never converges.
     */
    function rewrapTemplateToWidth(loc: ClassLocation, printWidth: number): string {
      const baseIndent = deriveBaseIndent(loc)
      const interiorIndent = baseIndent + INDENT_UNIT
      const leadingReserve = loc.preserveLeadingSpace ? 1 : 0
      const trailingReserve = loc.preserveTrailingSpace ? 1 : 0
      const classes = splitClasses(loc.value)
      if (classes.length === 0) return loc.value
      if (!loc.preserveLeadingSpace && !loc.preserveTrailingSpace) {
        const packed = packGroupedToWidth(classes, interiorIndent, printWidth)
        return '\n' + packed.map((c) => interiorIndent + c).join('\n') + '\n' + baseIndent
      }
      // Fragment adjacent to a `${}`: hanging join, no leading/trailing newline.
      return packGroupedToWidth(
        classes,
        interiorIndent,
        printWidth - leadingReserve - trailingReserve,
      ).join('\n' + interiorIndent)
    }

    function check(locations: ClassLocation[]) {
      const printWidth = getPrintWidth()
      const classesPerLine = getClassesPerLine()

      for (const loc of locations) {
        // #110: measure the LONGEST INDIVIDUAL LINE, not the raw total. The raw
        // value of a multiline template includes every `\n` and indent, so
        // comparing its total length made wrapping impossible to satisfy.
        // A line holding a single class can never be wrapped shorter, so an
        // over-budget single class is not counted against the print width.
        let maxLine = 0
        for (const line of loc.value.split('\n')) {
          if (line.length <= maxLine) continue
          if (line.length > printWidth && splitClasses(line).length <= 1) continue
          maxLine = line.length
        }
        const data = {
          length: String(maxLine),
          printWidth: String(printWidth),
        }
        const isMultiline = loc.value.includes('\n')
        if (
          classesPerLine === undefined &&
          loc.node.type === 'TemplateElement' &&
          (maxLine > printWidth || isMultiline)
        ) {
          // printWidth set without classesPerLine: enforce (and autofix to)
          // variant-grouped lines packed to the print width. A multiline
          // template that already fits is still normalized to that canonical
          // form; one that matches it is valid. Compare AFTER preserveSpaces:
          // a fragment's raw value carries the preserved space, and comparing
          // without it re-reports an already-canonical fragment with a no-op
          // fix.
          const fixedValue = preserveSpaces(loc, rewrapTemplateToWidth(loc, printWidth))
          if (fixedValue !== loc.value) {
            context.report({
              node: loc.node,
              messageId: maxLine > printWidth ? 'tooLong' : 'inconsistentWrapping',
              data,
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, fixedValue)
              },
            })
          } else if (maxLine > printWidth) {
            context.report({ node: loc.node, messageId: 'tooLong', data })
          }
        } else if (maxLine > printWidth) {
          context.report({ node: loc.node, messageId: 'tooLong', data })
        }

        if (classesPerLine !== undefined) {
          // #111: count classes PER LINE, not the flat total across all lines —
          // an already-wrapped block must not be flagged.
          const lines = loc.value.split('\n')
          let maxPerLine = 0
          for (const line of lines) {
            const n = splitClasses(line).length
            if (n > maxPerLine) maxPerLine = n
          }

          if (maxPerLine > classesPerLine) {
            const data = { count: String(maxPerLine), max: String(classesPerLine) }
            if (loc.node.type === 'TemplateElement') {
              const fixedValue = rewrapTemplate(loc, lines, classesPerLine)
              context.report({
                node: loc.node,
                messageId: 'tooManyPerLine',
                data,
                fix(fixer) {
                  return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
                },
              })
            } else {
              context.report({
                node: loc.node,
                messageId: 'tooManyPerLine',
                data,
              })
            }
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
