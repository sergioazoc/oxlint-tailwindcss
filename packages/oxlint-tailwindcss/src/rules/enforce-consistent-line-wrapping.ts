import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { createLazyOptions, safeSourceCode } from '../utils/context'

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

    function check(locations: ClassLocation[]) {
      const printWidth = getPrintWidth()
      const classesPerLine = getClassesPerLine()

      for (const loc of locations) {
        // #110: measure the LONGEST INDIVIDUAL LINE, not the raw total. The raw
        // value of a multiline template includes every `\n` and indent, so
        // comparing its total length made wrapping impossible to satisfy.
        let maxLine = 0
        for (const line of loc.value.split('\n')) {
          if (line.length > maxLine) maxLine = line.length
        }
        if (maxLine > printWidth) {
          context.report({
            node: loc.node,
            messageId: 'tooLong',
            data: {
              length: String(maxLine),
              printWidth: String(printWidth),
            },
          })
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
