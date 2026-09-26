/**
 * The styles a design system's components give their root element, read from
 * the components' source — without a parser, since the plugin ships none and
 * oxlint hands a rule only the file it is linting.
 *
 * What is read is deliberately narrow, the shapes component libraries write:
 * `cva()` / `tv()` definitions (the base plus each variant group's default,
 * and one style per value of the first group), and the first `className` of
 * each capitalized component — its root — when it is a string or a
 * `cn()`-style call. Anything else is skipped: an opaque expression never
 * becomes a class, so a style is a subset of the truth, never a guess.
 *
 * The lexer knows strings, template literals, comments, identifiers and
 * punctuation. JSX text can hold a lone `'` (`Don't`); a `'` or `"` string
 * never spans a line, so such a stray quote costs the rest of its line, not
 * the file.
 */

export interface ComponentStyle {
  /** `Button`, or `Button variant="outline"` for a variant's style. */
  name: string
  /** The classes the component's root element gets, in source order. */
  classes: string[]
}

type Token =
  | { t: 'str'; v: string }
  | { t: 'tpl' }
  | { t: 'id'; v: string }
  | { t: 'p'; v: string }
  | { t: 'x' }

const PUNCT = new Set(['(', ')', '{', '}', '[', ']', ',', ':', '=', '.', ';', '?'])
const ID_START = /[A-Za-z_$]/
const ID_PART = /[\w$]/

function lex(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
    } else if (c === '"' || c === "'") {
      let j = i + 1
      let text = ''
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') j++
        text += src[j]
        j++
      }
      if (src[j] === c) tokens.push({ t: 'str', v: text })
      else tokens.push({ t: 'x' })
      i = j + 1
    } else if (c === '`') {
      const [end, text] = skipTemplate(src, i)
      tokens.push(text === null ? { t: 'tpl' } : { t: 'str', v: text })
      i = end
    } else if (ID_START.test(c)) {
      let j = i + 1
      while (j < n && ID_PART.test(src[j])) j++
      tokens.push({ t: 'id', v: src.slice(i, j) })
      i = j
    } else if (PUNCT.has(c)) {
      tokens.push({ t: 'p', v: c })
      i++
    } else {
      if (!/\s/.test(c)) tokens.push({ t: 'x' })
      i++
    }
  }
  return tokens
}

/**
 * From the opening backtick at `start`: the index past the closing one, and
 * the text — `null` when the template has an expression, since its value is
 * then unknown.
 */
function skipTemplate(src: string, start: number): [number, string | null] {
  let i = start + 1
  let text = ''
  let dynamic = false
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') {
      text += src[i + 1] ?? ''
      i += 2
    } else if (src[i] === '$' && src[i + 1] === '{') {
      dynamic = true
      i = skipBraces(src, i + 1)
    } else {
      text += src[i]
      i++
    }
  }
  return [i + 1, dynamic ? null : text]
}

/** From an opening `{`: the index past its matching `}`. */
function skipBraces(src: string, open: number): number {
  let depth = 0
  let i = open
  while (i < src.length) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i + 1
    } else if (c === '`') {
      i = skipTemplate(src, i)[0]
      continue
    } else if (c === '"' || c === "'") {
      const close = src.indexOf(c, i + 1)
      i = close === -1 ? src.length : close + 1
      continue
    }
    i++
  }
  return i
}

/** A literal the scanner understood; anything else is `undefined`. */
type Value = string | Value[] | { [key: string]: Value } | undefined

const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

class Parser {
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  isP(i: number, v: string): boolean {
    const tok = this.tokens[i]
    return tok?.t === 'p' && tok.v === v
  }

  id(i: number): string | undefined {
    const tok = this.tokens[i]
    return tok?.t === 'id' ? tok.v : undefined
  }

  str(i: number): string | undefined {
    const tok = this.tokens[i]
    return tok?.t === 'str' ? tok.v : undefined
  }

  /** Skips one expression; returns the index of the `,` or closer that ends it. */
  skipExpression(i: number): number {
    const stack: string[] = []
    while (i < this.tokens.length) {
      const tok = this.tokens[i]
      if (tok.t === 'p') {
        if (OPEN[tok.v]) stack.push(OPEN[tok.v])
        else if (tok.v === ')' || tok.v === ']' || tok.v === '}') {
          if (stack.length === 0) return i
          stack.pop()
        } else if (tok.v === ',' && stack.length === 0) return i
      }
      i++
    }
    return i
  }

  /** Parses the value at `i`; returns it and the index past it. */
  value(i: number): [Value, number] {
    const tok = this.tokens[i]
    const end = this.skipExpression(i)
    // A literal is only a literal when nothing follows it (`"a" + b` is not).
    if (tok?.t === 'str') return [end === i + 1 ? tok.v : undefined, end]
    if (tok?.t === 'id' && (tok.v === 'true' || tok.v === 'false') && end === i + 1) {
      return [tok.v, end]
    }
    if (this.isP(i, '[')) {
      const items: Value[] = []
      let j = i + 1
      while (j < end && !this.isP(j, ']')) {
        const [item, next] = this.value(j)
        items.push(item)
        j = this.isP(next, ',') ? next + 1 : next
      }
      return [end === j + 1 ? items : undefined, end]
    }
    if (this.isP(i, '{')) {
      const object: { [key: string]: Value } = {}
      let j = i + 1
      while (j < end && !this.isP(j, '}')) {
        const key = this.tokens[j]
        const name = key.t === 'id' || key.t === 'str' ? key.v : undefined
        if (name !== undefined && this.isP(j + 1, ':')) {
          const [item, next] = this.value(j + 2)
          object[name] = item
          j = next
        } else {
          j = this.skipExpression(j)
        }
        if (this.isP(j, ',')) j++
      }
      return [end === j + 1 ? object : undefined, end]
    }
    return [undefined, end]
  }

  /** The arguments of the call whose `(` is at `open`, and the index past `)`. */
  args(open: number): [{ value: Value; start: number }[], number] {
    const out: { value: Value; start: number }[] = []
    let i = open + 1
    while (i < this.tokens.length && !this.isP(i, ')')) {
      const [value, next] = this.value(i)
      out.push({ value, start: i })
      i = this.isP(next, ',') ? next + 1 : next
      if (next === i && !this.isP(next, ',')) break
    }
    return [out, i + 1]
  }
}

const isRecord = (v: Value): v is { [key: string]: Value } =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The classes of a string, or of an array of strings; `[]` for anything else. */
function classesOf(v: Value): string[] {
  if (typeof v === 'string') return v.split(/\s+/).filter(Boolean)
  if (Array.isArray(v)) return v.flatMap(classesOf)
  return []
}

interface VariantDefinition {
  base: string[]
  /** Group name → value name → classes, in source order. */
  groups: [string, [string, string[]][]][]
  defaults: Record<string, string>
}

function variantDefinition(base: Value, config: Value): VariantDefinition {
  const groups: VariantDefinition['groups'] = []
  const defaults: Record<string, string> = {}
  if (isRecord(config)) {
    const variants = config.variants
    if (isRecord(variants)) {
      for (const [group, values] of Object.entries(variants)) {
        if (!isRecord(values)) continue
        groups.push([group, Object.entries(values).map(([name, v]) => [name, classesOf(v)])])
      }
    }
    const defaultVariants = config.defaultVariants
    if (isRecord(defaultVariants)) {
      for (const [group, v] of Object.entries(defaultVariants)) {
        if (typeof v === 'string') defaults[group] = v
      }
    }
  }
  return { base: classesOf(base), groups, defaults }
}

/**
 * The base with every group's default, then one style per other value of the
 * first group (`variant` in shadcn/ui), with the other groups' defaults.
 */
function variantStyles(name: string, def: VariantDefinition, extra: string[]): ComponentStyle[] {
  const pick = (group: string, value: string | undefined) =>
    def.groups.find(([g]) => g === group)?.[1].find(([v]) => v === value)?.[1] ?? []
  const withDefaults = (except?: string) =>
    def.groups.flatMap(([g]) => (g === except ? [] : pick(g, def.defaults[g])))
  const styles: ComponentStyle[] = [{ name, classes: [...def.base, ...withDefaults(), ...extra] }]
  const first = def.groups[0]
  if (first) {
    const [group, values] = first
    for (const [value, classes] of values) {
      if (value === def.defaults[group]) continue
      styles.push({
        name: `${name} ${group}="${value}"`,
        classes: [...def.base, ...classes, ...withDefaults(group), ...extra],
      })
    }
  }
  return styles
}

const CLASS_CALLEES = new Set(['cn', 'clsx', 'cx', 'classnames', 'classNames', 'twMerge', 'twJoin'])
const COMPONENT_WRAPPERS = new Set(['forwardRef', 'memo'])
const isComponentName = (name: string | undefined): name is string =>
  name !== undefined && /^[A-Z]/.test(name)
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function scanComponentStyles(source: string): ComponentStyle[] {
  const tokens = lex(source)
  const p = new Parser(tokens)
  const definitions = new Map<string, VariantDefinition>()
  const components: { name: string; start: number }[] = []

  for (let i = 0; i < tokens.length; i++) {
    const kw = p.id(i)
    if (kw === 'function' && isComponentName(p.id(i + 1)) && p.isP(i + 2, '(')) {
      components.push({ name: p.id(i + 1)!, start: i + 2 })
    } else if ((kw === 'const' || kw === 'let' || kw === 'var') && p.isP(i + 2, '=')) {
      const name = p.id(i + 1)
      if (!name) continue
      const callee = p.id(i + 3)
      if ((callee === 'cva' || callee === 'tv') && p.isP(i + 4, '(')) {
        const [args] = p.args(i + 4)
        const [first, second] = args.map((a) => a.value)
        definitions.set(
          name,
          callee === 'cva'
            ? variantDefinition(first, second)
            : variantDefinition(isRecord(first) ? first.base : undefined, first),
        )
      } else if (isComponentName(name) && isComponentInit(p, i + 3)) {
        components.push({ name, start: i + 3 })
      }
    }
  }

  const styles: ComponentStyle[] = []
  const named = new Set<string>()
  components.forEach((component, k) => {
    const end = components[k + 1]?.start ?? tokens.length
    const root = rootClasses(p, component.start, end, definitions)
    if (!root) return
    const definition = root.variants ? definitions.get(root.variants) : undefined
    if (definition && root.variants) {
      named.add(root.variants)
      styles.push(...variantStyles(component.name, definition, root.classes))
    } else if (root.classes.length > 0) {
      styles.push({ name: component.name, classes: root.classes })
    }
  })
  for (const [variable, definition] of definitions) {
    if (named.has(variable)) continue
    styles.push(...variantStyles(capitalize(variable.replace(/Variants$/, '')), definition, []))
  }
  return styles
}

/** `(…) =>`, `forwardRef(…)`, `React.memo(…)`: a component, not a value. */
function isComponentInit(p: Parser, i: number): boolean {
  if (p.isP(i, '(')) return true
  let j = i
  let last: string | undefined
  while (p.id(j)) {
    last = p.id(j)
    if (!p.isP(j + 1, '.')) break
    j += 2
  }
  return last !== undefined && COMPONENT_WRAPPERS.has(last) && p.isP(j + 1, '(')
}

/**
 * The first `className` in a component: its literal classes, and the variant
 * definition it calls, if any.
 */
function rootClasses(
  p: Parser,
  start: number,
  end: number,
  definitions: Map<string, VariantDefinition>,
): { classes: string[]; variants?: string } | undefined {
  for (let i = start; i < end; i++) {
    if (p.id(i) !== 'className' || !p.isP(i + 1, '=')) continue
    // `{ className = "" }` is a parameter default, not the root's attribute.
    if (p.isP(i - 1, '{') || p.isP(i - 1, ',')) continue
    const literal = p.str(i + 2)
    if (literal !== undefined) return { classes: classesOf(literal) }
    if (!p.isP(i + 2, '{')) return undefined
    const callee = p.id(i + 3)
    if (callee && definitions.has(callee) && p.isP(i + 4, '(')) {
      return { classes: [], variants: callee }
    }
    if (!callee || !CLASS_CALLEES.has(callee) || !p.isP(i + 4, '(')) {
      const [value] = p.value(i + 3)
      return typeof value === 'string' ? { classes: classesOf(value) } : undefined
    }
    const [args] = p.args(i + 4)
    const classes: string[] = []
    let variants: string | undefined
    for (const arg of args) {
      if (typeof arg.value === 'string') classes.push(...classesOf(arg.value))
      const name = p.id(arg.start)
      if (name && definitions.has(name) && p.isP(arg.start + 1, '(')) variants = name
    }
    return { classes, variants }
  }
  return undefined
}
