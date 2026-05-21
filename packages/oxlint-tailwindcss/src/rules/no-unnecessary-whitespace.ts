import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'

export const noUnnecessaryWhitespace = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow unnecessary whitespace in Tailwind CSS class strings',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryWhitespace: 'Unnecessary whitespace in Tailwind classes. Can be normalized.',
    },
  },
  createOnce(context) {
    function check(locations: ClassLocation[]) {
      for (const loc of locations) {
        // Multiline-aware normalization:
        //  - within each line, collapse runs of horizontal whitespace (spaces
        //    and tabs) to a single space.
        //  - preserve newlines and the indentation that immediately follows
        //    each newline — that's intentional formatting (e.g. produced by
        //    enforce-consistent-line-wrapping `classesPerLine`).
        //
        // Without preserving the post-newline indent, this rule and
        // `enforce-consistent-line-wrapping` form an unfixable cycle (see #14).
        const lines = loc.value.split('\n')
        const normalizedLines = lines.map((line, i) => {
          if (i === 0) {
            return line.replace(/[ \t]+/g, ' ')
          }
          // For non-first lines, peel off leading horizontal whitespace
          // (the indent) and normalize only the rest.
          const m = /^([ \t]*)([\s\S]*)$/.exec(line)
          if (!m) return line.replace(/[ \t]+/g, ' ')
          return m[1] + m[2].replace(/[ \t]+/g, ' ')
        })
        let normalized = normalizedLines.join('\n')

        // Trim edges, but preserve a single space at template expression boundaries.
        // Newlines at edges are preserved verbatim — intentional formatting.
        if (normalized.startsWith(' ') && !loc.preserveLeadingSpace) {
          normalized = normalized.slice(1)
        }
        if (normalized.endsWith(' ') && !loc.preserveTrailingSpace) {
          normalized = normalized.slice(0, -1)
        }

        if (normalized !== loc.value) {
          context.report({
            node: loc.node,
            messageId: 'unnecessaryWhitespace',
            fix(fixer) {
              return fixer.replaceTextRange(loc.range, normalized)
            },
          })
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
