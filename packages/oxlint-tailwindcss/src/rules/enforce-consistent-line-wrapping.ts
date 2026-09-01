import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { createLazyOptions, safeSourceCode } from '../utils/context'
import { getVariantPrefix } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'
import { softGetDS } from '../utils/fatal'

/*
 * A template literal is linted per QUASI — each run of static text between
 * the backticks and any `${}` interpolations. In `` `flex ${a} p-2` `` there
 * are two quasis: the LEADING one (`flex `, between the opening backtick and
 * the first `${}`) and the TRAILING one (` p-2`, between the last `${}` and
 * the closing backtick); a template without interpolations is one quasi. On
 * a quasi's ClassLocation, `preserveLeadingSpace` means a `${}` sits
 * directly before it, `preserveTrailingSpace` that one sits directly after.
 *
 * The fixers wrap a quasi according to what borders it:
 *  - opening backtick before it (whole template, or a leading quasi):
 *    BLOCK form — classes move onto their own indented lines below the
 *    backtick;
 *  - `${}` before it: HANGING form — the first packed line stays beside the
 *    interpolation, continuation lines are indented below it;
 *  - GLUED to a `${}` (no whitespace at the boundary, as in `${a}flex`):
 *    never autofixed, warn-only — the quasi text concatenates with the
 *    interpolation into ONE runtime class, so inserting whitespace at the
 *    boundary would split that class in two.
 */

/**
 * Which lines the width-based autofix re-wraps. No default — unset means
 * `printWidth` is warn-only (no autofix), like `classesPerLine`.
 *  - 'overWidth' — only lines exceeding `printWidth`, greedily re-packed;
 *                  conforming lines are left exactly as hand-formatted.
 *  - 'all'       — every multiline or over-width template is re-laid-out
 *                  into the canonical layout shaped by `group`.
 */
type WrapLinesMode = 'overWidth' | 'all'

/**
 * How the `wrapLines: 'all'` canonical layout separates variant groups
 * ('overWidth' never re-groups, so this option does not affect it):
 *  - 'newLine'   — each variant run starts its own line. The default.
 *  - 'emptyLine' — additionally, a blank line separates the runs.
 *  - 'never'     — no grouping: classes pack greedily across run boundaries.
 */
type GroupMode = 'newLine' | 'emptyLine' | 'never'

interface Options {
  entryPoint?: string
  printWidth?: number
  classesPerLine?: number
  wrapLines?: WrapLinesMode
  group?: GroupMode
}

const DEFAULT_PRINT_WIDTH = 80
const DEFAULT_GROUP: GroupMode = 'newLine'

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
 * Greedily pack `classes` into space-joined lines: a line takes classes until
 * `indent` + the next one would exceed `width`; a single class over the
 * budget still gets its own line. Widths count characters, so a tab in
 * `indent` is 1 column (detection uses the same yardstick, so tabs converge).
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
 * Variant chain used as the grouping key. A Tailwind v4 project prefix
 * (`tw:`) is structurally a variant but pinned first, so it is stripped
 * before the key is computed — `tw:flex` keys as a base utility (grouping
 * with unprefixed component classes) and `tw:hover:x` keys as `hover:`,
 * matching how consistent-variant-order / enforce-sort-order treat the
 * prefix. Grouping only: emitted classes are never rewritten.
 */
function groupingKey(cls: string, prefix: string): string {
  const bare = prefix !== '' && cls.startsWith(prefix + ':') ? cls.slice(prefix.length + 1) : cls
  return getVariantPrefix(bare)
}

/**
 * Split `classes` into runs of consecutive classes sharing the same variant
 * chain ("hover:", "md:hover:", "" for base utilities), so wrapping breaks
 * between variant groups rather than mid-group.
 */
function groupByVariantRun(classes: string[], prefix: string): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  let currentVariant: string | null = null
  for (const cls of classes) {
    const variant = groupingKey(cls, prefix)
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

/**
 * Pack `classes` per the `group` mode: 'never' packs greedily across
 * variant-run boundaries, 'newLine' starts each run on its own line(s), and
 * 'emptyLine' additionally inserts an extra line between runs — emitted as a
 * blank line with no indent.
 */
function packGroupedToWidth(
  classes: string[],
  indent: string,
  width: number,
  group: GroupMode,
  prefix: string,
): string[] {
  if (group === 'never') return packToWidth(classes, indent, width)
  const lines: string[] = []
  for (const run of groupByVariantRun(classes, prefix)) {
    if (group === 'emptyLine' && lines.length > 0) lines.push('')
    lines.push(...packToWidth(run, indent, width))
  }
  return lines
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
          entryPoint: { type: 'string' },
          printWidth: { type: 'number' },
          classesPerLine: { type: 'number' },
          wrapLines: { type: 'string', enum: ['overWidth', 'all'] },
          group: { type: 'string', enum: ['newLine', 'emptyLine', 'never'] },
        },
        additionalProperties: false,
      },
    ],
    // `wrapLines` and `classesPerLine` deliberately have no default:
    // leaving either unset turns its fixer off.
    defaultOptions: [{ printWidth: DEFAULT_PRINT_WIDTH, group: DEFAULT_GROUP }],
    messages: {
      tooLong:
        'Class string exceeds the print width of {{printWidth}} (longest line is {{length}} characters). Consider splitting into multiple lines or extracting into a component.',
      tooManyPerLine:
        'Too many classes on a single line ({{count}}). Maximum allowed per line is {{max}}.',
      inconsistentWrapping:
        'Class string is not wrapped consistently. Classes should be re-wrapped to the configured layout within the print width of {{printWidth}}.',
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
    const getWrapLines = createLazyOptions<Options, WrapLinesMode | undefined>(
      context,
      (o) => o?.wrapLines,
    )
    const getGroup = createLazyOptions<Options, GroupMode>(
      context,
      (o) => o?.group ?? DEFAULT_GROUP,
    )
    const getDS = createLazyLoader(context)

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
     * `wrapLines: 'all'` fixer (also the single-line conversion for
     * 'overWidth', which passes `group: 'never'`): the WHOLE quasi is
     * re-laid-out into lines packed to `printWidth` per the `group` mode,
     * in the block or hanging form its position dictates (see the quasi
     * note at the top of the file).
     */
    function rewrapTemplateToWidth(
      loc: ClassLocation,
      printWidth: number,
      group: GroupMode,
      prefix: string,
    ): string {
      const baseIndent = deriveBaseIndent(loc)
      const interiorIndent = baseIndent + INDENT_UNIT
      const classes = splitClasses(loc.value)
      if (classes.length === 0) return loc.value
      if (!loc.preserveLeadingSpace) {
        // Block form. Keyed off `preserveLeadingSpace` ALONE: a leading quasi
        // must not take the hanging form below — its first line would land on
        // the code before the backtick, over-width in the source yet
        // invisible to the per-quasi line measurement. A `${}` after the
        // quasi goes on its own interior-indented line.
        const packed = packGroupedToWidth(classes, interiorIndent, printWidth, group, prefix)
        const close = loc.preserveTrailingSpace ? interiorIndent : baseIndent
        // `''` entries (blank group separators) take no indent.
        return (
          '\n' + packed.map((c) => (c === '' ? c : interiorIndent + c)).join('\n') + '\n' + close
        )
      }
      // Hanging form. One character is reserved per bordering `${}` for the
      // boundary space `preserveSpaces` re-adds after packing — without the
      // reserve a line packed to exactly `printWidth` lands at
      // `printWidth + 1` and the fix never converges.
      const trailingReserve = loc.preserveTrailingSpace ? 1 : 0
      return packGroupedToWidth(
        classes,
        interiorIndent,
        printWidth - 1 - trailingReserve,
        group,
        prefix,
      )
        .map((c, i) => (i === 0 || c === '' ? c : interiorIndent + c))
        .join('\n')
    }

    /**
     * `wrapLines: 'overWidth'` fixer: non-destructive like `rewrapTemplate`
     * — only lines exceeding `printWidth` are greedily re-packed, each
     * keeping its own indent; conforming lines are left verbatim. A
     * single-line value has no layout to preserve and converts to the block
     * form. Returns the FINAL value, `${}` boundary spaces included — never
     * run it through `preserveSpaces`, which would prepend a stray space to
     * a quasi that legitimately starts with `\n`.
     */
    function rewrapOverBudgetLinesToWidth(loc: ClassLocation, printWidth: number): string {
      const lines = loc.value.split('\n')
      if (lines.length === 1) {
        // group 'never' does no grouping, so the prefix is irrelevant.
        return preserveSpaces(loc, rewrapTemplateToWidth(loc, printWidth, 'never', ''))
      }
      const interiorIndent = deriveBaseIndent(loc) + INDENT_UNIT
      // Reserve for the boundary space before a `${}` after the quasi,
      // re-appended below if repacking dropped it.
      const width = printWidth - (loc.preserveTrailingSpace ? 1 : 0)
      const fixed = lines
        .map((line) => {
          const classes = splitClasses(line)
          if (line.length <= printWidth || classes.length <= 1) return line
          const m = /^[ \t]*/.exec(line)
          const lead = m ? m[0] : ''
          const contIndent = lead.length > 0 ? lead : interiorIndent
          // First chunk keeps the line's original position (its `lead`,
          // possibly none); continuation lines reuse that indent.
          return packToWidth(classes, contIndent, width)
            .map((c, i) => (i === 0 ? lead + c : contIndent + c))
            .join('\n')
        })
        .join('\n')
      // Leading boundary whitespace always survives as the first line's
      // `lead`; only a repacked last line loses its trailing boundary space.
      if (loc.preserveTrailingSpace && !/\s$/.test(fixed)) return fixed + ' '
      return fixed
    }

    function check(locations: ClassLocation[]) {
      const printWidth = getPrintWidth()
      const classesPerLine = getClassesPerLine()
      const wrapLines = getWrapLines()
      const group = getGroup()
      // DS-OPTIONAL (see `softGetDS`): the design system is consulted ONLY
      // for the Tailwind v4 project prefix, and only when the 'all' layout
      // will actually group. With no entryPoint configured (or a failed
      // load) the prefix silently falls back to '' and reads as part of the
      // variant chain — this rule never emits `designSystemUnavailable`.
      const prefix =
        wrapLines === 'all' && group !== 'never' && classesPerLine === undefined
          ? (softGetDS(getDS)?.cache.prefix ?? '')
          : ''

      for (const loc of locations) {
        // #110: measure the LONGEST INDIVIDUAL LINE, not the raw total. The raw
        // value of a multiline template includes every `\n` and indent, so
        // comparing its total length made wrapping impossible to satisfy.
        // An over-budget line holding a single class is skipped — it can't
        // be wrapped any shorter.
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
        // Glued quasis are warn-only (see the quasi note at the top).
        const glued =
          (loc.preserveLeadingSpace === true && !/^\s/.test(loc.value)) ||
          (loc.preserveTrailingSpace === true && !/\s$/.test(loc.value))
        if (
          wrapLines !== undefined &&
          classesPerLine === undefined &&
          loc.node.type === 'TemplateElement' &&
          !glued &&
          (maxLine > printWidth || (wrapLines === 'all' && isMultiline))
        ) {
          // Compare the FINAL value (boundary spaces included), or an
          // already-canonical quasi re-reports with a no-op fix. Equal values
          // need no warn-only fallback: at a fixed point of either fixer
          // every multi-class line fits the budget, and over-budget
          // single-class lines were already excluded from `maxLine`.
          const fixedValue =
            wrapLines === 'all'
              ? preserveSpaces(loc, rewrapTemplateToWidth(loc, printWidth, group, prefix))
              : rewrapOverBudgetLinesToWidth(loc, printWidth)
          if (fixedValue !== loc.value) {
            context.report({
              node: loc.node,
              messageId: maxLine > printWidth ? 'tooLong' : 'inconsistentWrapping',
              data,
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, fixedValue)
              },
            })
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
