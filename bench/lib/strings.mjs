// The string literals of a source file, in order: how the fix oracle pairs a
// class string before a fix with the same string after it. A class fix edits
// a literal's contents, never how many literals there are, so the n-th
// literal before is the n-th after; a file whose counts differ is reported as
// unpaired rather than guessed at.
//
// Comments are skipped. A template literal's `${}` becomes DYNAMIC, which is
// never part of a class. A `'` or `"` string ends at the end of its line —
// so a stray quote in JSX text (`Don't`) costs the rest of that line only —
// unless it is a JSX attribute's value (right after `=`), which may span lines
// (`className="\n  flex\n  p-4\n"`, as better-tailwindcss wraps them).

export const DYNAMIC = '\u0000'

export function stringLiterals(source) {
  const out = []
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
    } else if (c === '"' || c === "'") {
      const multiline = /=\s*$/.test(source.slice(Math.max(0, i - 8), i))
      let j = i + 1
      let text = ''
      while (j < n && source[j] !== c && (multiline || source[j] !== '\n')) {
        if (source[j] === '\\') {
          text += source[j + 1] ?? ''
          j += 2
        } else {
          text += source[j]
          j++
        }
      }
      if (source[j] === c) out.push(text)
      i = j + 1
    } else if (c === '`') {
      const [end, text] = template(source, i)
      out.push(text)
      i = end
    } else {
      i++
    }
  }
  return out
}

function template(source, start) {
  let i = start + 1
  let text = ''
  while (i < source.length && source[i] !== '`') {
    if (source[i] === '\\') {
      text += source[i + 1] ?? ''
      i += 2
    } else if (source[i] === '$' && source[i + 1] === '{') {
      text += DYNAMIC
      let depth = 0
      while (i < source.length) {
        if (source[i] === '{') depth++
        else if (source[i] === '}' && --depth === 0) break
        else if (source[i] === '`') {
          i = template(source, i)[0]
          continue
        }
        i++
      }
      i++
    } else {
      text += source[i]
      i++
    }
  }
  return [i + 1, text]
}

/** A string's classes: split on whitespace, without the dynamic parts. */
export function classesOf(text) {
  return text.split(/\s+/).filter((c) => c && !c.includes(DYNAMIC))
}
