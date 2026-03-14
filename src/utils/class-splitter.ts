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
      if (char === ']') bracketDepth--
    }

    if (/\s/.test(char) && bracketDepth === 0) {
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
