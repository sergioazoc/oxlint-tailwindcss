// Hot path: called per class string per AST node. A char comparison avoids the
// per-character `/\s/.test()` regex object churn (R-B1). ASCII whitespace is
// all Tailwind class strings ever contain.
function isWhitespace(char: string): boolean {
  return (
    char === ' ' ||
    char === '\t' ||
    char === '\n' ||
    char === '\r' ||
    char === '\f' ||
    char === '\v'
  )
}

/**
 * Splits a Tailwind class string respecting:
 * - Nested brackets: bg-[url('...')], h-[calc(100%+2rem)]
 * - Arbitrary variants: [&>svg]:w-4
 * - Negative values: -translate-x-1
 * - Important modifier: !font-bold
 */
export function splitClasses(classString: string): string[] {
  const classes: string[] = []
  let current = ''
  let bracketDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < classString.length; i++) {
    const char = classString[i]
    const prev = classString[i - 1]

    if (bracketDepth > 0 && prev !== '\\') {
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '[') bracketDepth++
      // Clamp at 0 so a stray ']' (typo like `w-[5px]]`) degrades gracefully
      // instead of going negative and gluing the rest of the string together.
      if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    }

    if (isWhitespace(char) && bracketDepth === 0) {
      if (current.length > 0) {
        classes.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current.length > 0) {
    classes.push(current)
  }

  return classes
}

/**
 * Split a class string into classes AND the whitespace separators between them.
 *
 * `separators[0]` is the leading whitespace (before the first class).
 * `separators[i]` for i >= 1 is the whitespace between classes[i-1] and classes[i].
 * `separators[classes.length]` is the trailing whitespace.
 * Total length: `classes.length + 1`.
 *
 * Used together with `rebuildClassString` to preserve multiline formatting
 * (e.g. `\n` + indent introduced by `enforce-consistent-line-wrapping`'s
 * `classesPerLine`) when other rules autofix the same string.
 */
export interface ClassSplit {
  classes: string[]
  separators: string[]
}

export function splitClassesWithSeparators(classString: string): ClassSplit {
  const classes: string[] = []
  const separators: string[] = []
  let current = ''
  let currentSep = ''
  let bracketDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < classString.length; i++) {
    const char = classString[i]
    const prev = classString[i - 1]

    if (bracketDepth > 0 && prev !== '\\') {
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '[') bracketDepth++
      if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    }

    if (isWhitespace(char) && bracketDepth === 0) {
      if (current.length > 0) {
        classes.push(current)
        separators.push(currentSep)
        current = ''
        currentSep = ''
      }
      currentSep += char
    } else {
      current += char
    }
  }

  if (current.length > 0) {
    classes.push(current)
    separators.push(currentSep)
    currentSep = ''
  }
  // Trailing separator (always present, may be empty)
  separators.push(currentSep)

  return { classes, separators }
}

/**
 * Reconstruct a class string from a `ClassSplit` and a (possibly transformed)
 * array of classes.
 *
 * - If `newClasses.length === split.classes.length` (1-to-1 transformation:
 *   canonicalize, sort, variant-order, etc.) every separator is preserved
 *   verbatim. This keeps multiline indentation intact.
 * - If lengths differ (shorthand collapses pairs, no-duplicate removes dupes)
 *   the helper degrades gracefully: leading and trailing whitespace are
 *   preserved; classes are joined by the first internal separator that
 *   contains a newline, or a single space if none does.
 */
export function rebuildClassString(split: ClassSplit, newClasses: string[]): string {
  const { classes, separators } = split
  if (newClasses.length === classes.length) {
    let result = separators[0]
    for (let i = 0; i < newClasses.length; i++) {
      result += newClasses[i] + separators[i + 1]
    }
    return result
  }
  const internal = separators.slice(1, -1)
  const join = internal.find((s) => s.includes('\n')) ?? ' '
  return separators[0] + newClasses.join(join) + separators[separators.length - 1]
}
