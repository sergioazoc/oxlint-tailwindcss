import type { ESTree } from '@oxlint/plugins'
import type { PluginSettings } from '../types'
import { compileRegexList } from './allowlist'

export interface ClassLocation {
  value: string
  node: ESTree.Node
  range: [number, number]
  /** Preserve a leading space (quasi preceded by template expression) */
  preserveLeadingSpace?: boolean
  /** Preserve a trailing space (quasi followed by template expression) */
  preserveTrailingSpace?: boolean
}

/**
 * Preserves leading/trailing spaces in fixed class strings for template literals.
 * Without this, `h-3 w-3 ${x}` fixed to `size-3${x}` would break classes.
 */
export function preserveSpaces(loc: ClassLocation, fixed: string): string {
  if (loc.preserveLeadingSpace && !fixed.startsWith(' ')) fixed = ` ${fixed}`
  if (loc.preserveTrailingSpace && !fixed.endsWith(' ')) fixed = `${fixed} `
  return fixed
}

export interface ExtractorConfig {
  attributes: string[]
  callees: string[]
  tags: string[]
  variablePatterns: RegExp[]
}

const DEFAULT_VARIABLE_PATTERNS = [/^classNames?$/, /^classes$/, /^styles?$/]

export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  attributes: ['className', 'class'],
  callees: [
    'cn',
    'clsx',
    'cva',
    'twMerge',
    'tv',
    'cx',
    'classnames',
    'ctl',
    'twJoin',
    'cc',
    'clb',
    'cnb',
    'objstr',
    'classed',
  ],
  tags: ['tw'],
  variablePatterns: DEFAULT_VARIABLE_PATTERNS,
}

// --- Custom config resolution via settings.tailwindcss ---

/**
 * v1: per-context extractor config cache. Each oxlint rule context gets its
 * own cached config, keyed by reference identity in a WeakMap. This prevents
 * the cross-contamination bug where two test suites (or parallel rule
 * contexts) would race on a module-level global and the first one to read
 * settings would freeze the config for everyone else.
 *
 * WeakMap also lets us drop entries automatically when a context goes out of
 * scope — no manual cache eviction needed.
 */
type ContextKey = object
const configCache = new WeakMap<ContextKey, ExtractorConfig>()

function mergeUnique(defaults: string[], extras?: string[], exclusions?: string[]): string[] {
  let base = defaults
  if (exclusions && exclusions.length > 0) {
    const excludeSet = new Set(exclusions)
    base = base.filter((d) => !excludeSet.has(d))
  }
  if (!extras || extras.length === 0) return base
  const set = new Set(base)
  for (const e of extras) set.add(e)
  return [...set]
}

/**
 * Returns the extractor config for this rule context, merging defaults with
 * user settings from `settings.tailwindcss`. The result is cached per
 * context (WeakMap-keyed) so settings are read once per rule lifetime.
 *
 * In `createOnce` the settings getter throws — we fall back to the defaults
 * without caching so the next visitor call (where settings ARE available)
 * still resolves the user's overrides.
 */
export function getExtractorConfig(context: {
  settings?: Readonly<Record<string, unknown>>
}): ExtractorConfig {
  const cached = configCache.get(context as ContextKey)
  if (cached) return cached

  let tw: PluginSettings | undefined
  try {
    const raw = context.settings?.tailwindcss
    if (raw && typeof raw === 'object') {
      tw = raw as PluginSettings
    }
  } catch {
    // createOnce — settings not available yet. Return defaults without
    // caching so a later call from a visitor still gets a chance to read
    // the real settings.
    return DEFAULT_EXTRACTOR_CONFIG
  }

  if (!tw) {
    configCache.set(context as ContextKey, DEFAULT_EXTRACTOR_CONFIG)
    return DEFAULT_EXTRACTOR_CONFIG
  }

  const exclude = tw.exclude

  // Variable patterns: exclude by regex source, then add new patterns
  const excludedPatternSources = new Set(exclude?.variablePatterns ?? [])
  const filteredPatterns =
    excludedPatternSources.size > 0
      ? DEFAULT_EXTRACTOR_CONFIG.variablePatterns.filter(
          (re) => !excludedPatternSources.has(re.source),
        )
      : DEFAULT_EXTRACTOR_CONFIG.variablePatterns

  const resolved: ExtractorConfig = {
    attributes: mergeUnique(
      DEFAULT_EXTRACTOR_CONFIG.attributes,
      tw.attributes,
      exclude?.attributes,
    ),
    callees: mergeUnique(DEFAULT_EXTRACTOR_CONFIG.callees, tw.callees, exclude?.callees),
    tags: mergeUnique(DEFAULT_EXTRACTOR_CONFIG.tags, tw.tags, exclude?.tags),
    variablePatterns: [
      // compileRegexList skips invalid sources instead of throwing, so a typo
      // in a user `variablePatterns` entry degrades gracefully rather than
      // crashing the lint with a raw SyntaxError from inside a visitor (SEC-B1).
      ...filteredPatterns,
      ...compileRegexList(tw.variablePatterns),
    ],
  }
  configCache.set(context as ContextKey, resolved)
  return resolved
}

/**
 * Reset cached config for a specific context, or globally for tests that
 * don't track contexts.
 *
 * Kept for backward compat with existing tests that call it from `beforeEach`.
 * With WeakMap-keyed caching, fresh contexts get fresh caches automatically;
 * this helper now only needs to drop a specific entry when callers pass one.
 */
export function resetExtractorConfig(context?: { settings?: unknown }): void {
  if (context) {
    configCache.delete(context as ContextKey)
  }
  // No-op when called without a context: the WeakMap already handles
  // lifecycle. Module-level global state was removed in v1.
}

/**
 * Creates the 4 standard AST visitor callbacks that all rules use.
 * Resolves extractor config lazily from context.settings on first visitor call.
 */
export function createExtractorVisitors(
  context: { settings?: Readonly<Record<string, unknown>> },
  check: (locations: ClassLocation[]) => void,
): {
  JSXAttribute: (node: ESTree.JSXAttribute) => void
  CallExpression: (node: ESTree.CallExpression) => void
  TaggedTemplateExpression: (node: ESTree.TaggedTemplateExpression) => void
  VariableDeclarator: (node: ESTree.VariableDeclarator) => void
} {
  return {
    JSXAttribute(node) {
      check(extractFromJSXAttribute(node, getExtractorConfig(context)))
    },
    CallExpression(node) {
      check(extractFromCallExpression(node, getExtractorConfig(context)))
    },
    TaggedTemplateExpression(node) {
      check(extractFromTaggedTemplate(node, getExtractorConfig(context)))
    },
    VariableDeclarator(node) {
      check(extractFromVariableDeclarator(node, getExtractorConfig(context)))
    },
  }
}

/**
 * Extracts class locations from a JSXAttribute node.
 * Handles: className="...", className={`...`}, className={cond ? "..." : "..."}
 */
export function extractFromJSXAttribute(
  node: ESTree.JSXAttribute,
  config: ExtractorConfig = DEFAULT_EXTRACTOR_CONFIG,
): ClassLocation[] {
  const name = node.name.type === 'JSXIdentifier' ? node.name.name : undefined
  if (!name || !config.attributes.includes(name)) return []

  if (!node.value) return []

  // className="literal string"
  if (node.value.type === 'Literal' && typeof node.value.value === 'string') {
    return [
      {
        value: node.value.value,
        node: node.value,
        range: [node.value.range[0] + 1, node.value.range[1] - 1],
      },
    ]
  }

  // className={expression} or classNames={{ root: "flex" }}
  if (node.value.type === 'JSXExpressionContainer') {
    const expr = node.value.expression
    // classNames={{ root: "flex flex-col", label: "text-sm" }} — extract string values
    if (expr.type === 'ObjectExpression') {
      return extractObjectValues(expr as ESTree.ObjectExpression)
    }
    return extractFromExpression(expr)
  }

  return []
}

/**
 * Extracts class locations from a CallExpression (cn, clsx, cva, tv, etc).
 * For cva() and tv(), uses dedicated extractors that understand their config structure.
 */
export function extractFromCallExpression(
  node: ESTree.CallExpression,
  config: ExtractorConfig = DEFAULT_EXTRACTOR_CONFIG,
): ClassLocation[] {
  const calleeName = getCalleeName(node.callee)
  if (!calleeName || !config.callees.includes(calleeName)) return []

  if (calleeName === 'cva') return extractFromCvaCall(node)
  if (calleeName === 'tv') return extractFromTvCall(node)
  if (calleeName === 'classed') return extractFromClassedCall(node)

  const results: ClassLocation[] = []
  for (const arg of node.arguments) {
    extractFromExpression(arg, results)
  }
  return results
}

/**
 * Extracts class locations from a TaggedTemplateExpression (tw`...`).
 */
export function extractFromTaggedTemplate(
  node: ESTree.TaggedTemplateExpression,
  config: ExtractorConfig = DEFAULT_EXTRACTOR_CONFIG,
): ClassLocation[] {
  const tagName = getCalleeName(node.tag)
  if (!tagName || !config.tags.includes(tagName)) return []

  return extractFromTemplateLiteral(node.quasi)
}

/**
 * Extracts class string values from an ObjectExpression in a JSX attribute.
 * For: classNames={{ root: "flex flex-col", label: "text-sm" }}
 * Recurses into each property value via extractFromExpression.
 */
function extractObjectValues(node: ESTree.ObjectExpression): ClassLocation[] {
  const results: ClassLocation[] = []
  for (const prop of node.properties) {
    if (prop.type === 'Property') {
      extractFromExpression(prop.value, results)
    }
  }
  return results
}

/**
 * Extracts class locations from a classed() call (tw-classed).
 * First string argument is the element type (skipped), rest are class strings
 * or cva-like config objects.
 * classed("button", "flex items-center", { variants: { ... } })
 */
function extractFromClassedCall(node: ESTree.CallExpression): ClassLocation[] {
  const results: ClassLocation[] = []
  let skippedFirst = false

  for (const arg of node.arguments) {
    // Skip the first string argument (element type like "button", "div")
    if (!skippedFirst && arg.type === 'Literal' && typeof arg.value === 'string') {
      skippedFirst = true
      continue
    }
    // If first arg is a component reference (Identifier), also skip it
    if (!skippedFirst && arg.type === 'Identifier') {
      skippedFirst = true
      continue
    }
    // If first arg is a template literal (e.g. classed(`div`, ...)), also skip it
    if (!skippedFirst && arg.type === 'TemplateLiteral') {
      skippedFirst = true
      continue
    }
    skippedFirst = true

    if (arg.type === 'ObjectExpression') {
      results.push(...extractFromCvaConfig(arg as ESTree.ObjectExpression))
    } else {
      extractFromExpression(arg, results)
    }
  }
  return results
}

/**
 * Extracts class locations from a cva() call.
 * Handles: base string, variants config, compoundVariants.
 */
function extractFromCvaCall(node: ESTree.CallExpression): ClassLocation[] {
  const results: ClassLocation[] = []
  for (const arg of node.arguments) {
    if (arg.type === 'ObjectExpression') {
      results.push(...extractFromCvaConfig(arg as ESTree.ObjectExpression))
    } else {
      extractFromExpression(arg, results)
    }
  }
  return results
}

/**
 * Extracts class locations from a cva config object.
 * Properties: variants (nested category→value objects), compoundVariants (array with class/className).
 * Ignores: defaultVariants.
 */
function extractFromCvaConfig(node: ESTree.ObjectExpression): ClassLocation[] {
  const results: ClassLocation[] = []
  for (const prop of node.properties) {
    if (prop.type !== 'Property') continue
    const name = getPropertyName(prop.key)

    if (name === 'variants' && prop.value.type === 'ObjectExpression') {
      // variants: { size: { sm: "p-2", lg: "p-4" } }
      for (const category of (prop.value as ESTree.ObjectExpression).properties) {
        if (category.type !== 'Property' || category.value.type !== 'ObjectExpression') continue
        for (const variant of (category.value as ESTree.ObjectExpression).properties) {
          if (variant.type === 'Property') {
            extractFromExpression(variant.value, results)
          }
        }
      }
    } else if (name === 'compoundVariants' && prop.value.type === 'ArrayExpression') {
      // compoundVariants: [{ size: "sm", class: "p-2" }]
      results.push(...extractClassFromCompoundEntries(prop.value as ESTree.ArrayExpression))
    } else if (name === 'defaultVariants') {
      // Ignore — these are variant names, not class strings
    } else {
      // Other properties (e.g. unknown) — try extracting
      extractFromExpression(prop.value, results)
    }
  }
  return results
}

/**
 * Extracts class locations from a tv() call.
 * Handles: base, slots, variants (with slot objects), compoundVariants, compoundSlots.
 */
function extractFromTvCall(node: ESTree.CallExpression): ClassLocation[] {
  const results: ClassLocation[] = []
  for (const arg of node.arguments) {
    if (arg.type === 'ObjectExpression') {
      results.push(...extractFromTvConfig(arg as ESTree.ObjectExpression))
    } else {
      extractFromExpression(arg, results)
    }
  }
  return results
}

/**
 * Extracts class locations from a tv config object.
 * Properties: base, slots, variants (may have slot sub-objects), compoundVariants, compoundSlots.
 * Ignores: defaultVariants.
 */
function extractFromTvConfig(node: ESTree.ObjectExpression): ClassLocation[] {
  const results: ClassLocation[] = []
  for (const prop of node.properties) {
    if (prop.type !== 'Property') continue
    const name = getPropertyName(prop.key)

    if (name === 'base') {
      extractFromExpression(prop.value, results)
    } else if (name === 'slots' && prop.value.type === 'ObjectExpression') {
      // slots: { header: "p-2", body: "p-4" }
      for (const slot of (prop.value as ESTree.ObjectExpression).properties) {
        if (slot.type === 'Property') {
          extractFromExpression(slot.value, results)
        }
      }
    } else if (name === 'variants' && prop.value.type === 'ObjectExpression') {
      // variants: { size: { sm: "p-2" } } OR { size: { sm: { header: "p-2" } } }
      for (const category of (prop.value as ESTree.ObjectExpression).properties) {
        if (category.type !== 'Property' || category.value.type !== 'ObjectExpression') continue
        for (const variant of (category.value as ESTree.ObjectExpression).properties) {
          if (variant.type !== 'Property') continue
          if (variant.value.type === 'ObjectExpression') {
            // Slot-level: { header: "p-2", body: "p-4" }
            for (const slotProp of (variant.value as ESTree.ObjectExpression).properties) {
              if (slotProp.type === 'Property') {
                extractFromExpression(slotProp.value, results)
              }
            }
          } else {
            extractFromExpression(variant.value, results)
          }
        }
      }
    } else if (
      (name === 'compoundVariants' || name === 'compoundSlots') &&
      prop.value.type === 'ArrayExpression'
    ) {
      results.push(...extractClassFromCompoundEntries(prop.value as ESTree.ArrayExpression))
    } else if (name === 'defaultVariants') {
      // Ignore
    } else {
      extractFromExpression(prop.value, results)
    }
  }
  return results
}

/**
 * Extracts class/className values from an array of compound variant/slot entries.
 * Each entry is an ObjectExpression; we look for "class" or "className" properties.
 */
function extractClassFromCompoundEntries(node: ESTree.ArrayExpression): ClassLocation[] {
  const results: ClassLocation[] = []
  for (const element of node.elements) {
    if (!element || element.type !== 'ObjectExpression') continue
    for (const prop of (element as ESTree.ObjectExpression).properties) {
      if (prop.type !== 'Property') continue
      const name = getPropertyName(prop.key)
      if (name === 'class' || name === 'className') {
        extractFromExpression(prop.value, results)
      }
    }
  }
  return results
}

/**
 * Gets the property name from an object key node.
 */
function getPropertyName(key: ESTree.Node): string | undefined {
  if (key.type === 'Identifier') return (key as ESTree.IdentifierName).name
  if (key.type === 'Literal' && typeof (key as ESTree.StringLiteral).value === 'string')
    return (key as ESTree.StringLiteral).value as string
  return undefined
}

/**
 * Extracts class locations from a VariableDeclarator whose name matches variablePatterns.
 * e.g. const className = "flex items-center"
 */
export function extractFromVariableDeclarator(
  node: ESTree.VariableDeclarator,
  config: ExtractorConfig = DEFAULT_EXTRACTOR_CONFIG,
): ClassLocation[] {
  if (node.id.type !== 'Identifier') return []
  if (!config.variablePatterns.some((p) => p.test((node.id as ESTree.BindingIdentifier).name)))
    return []
  if (!node.init) return []
  return extractFromExpression(node.init)
}

/**
 * Walk an expression and append every class-bearing location to `out`.
 *
 * Internal helpers pass their accumulator down to avoid the
 * `extractFromExpression(x, results)` pattern, which allocates an
 * intermediate array per recursive call. Public callers may omit `out` to
 * receive a fresh array.
 */
function extractFromExpression(node: ESTree.Node, out: ClassLocation[] = []): ClassLocation[] {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    out.push({
      value: node.value,
      node,
      range: [node.range[0] + 1, node.range[1] - 1],
    })
    return out
  }

  if (node.type === 'TemplateLiteral') {
    return appendFromTemplateLiteral(node as ESTree.TemplateLiteral, out)
  }

  if (node.type === 'ConditionalExpression') {
    extractFromExpression((node as ESTree.ConditionalExpression).consequent, out)
    extractFromExpression((node as ESTree.ConditionalExpression).alternate, out)
    return out
  }

  if (node.type === 'LogicalExpression') {
    return extractFromExpression((node as ESTree.LogicalExpression).right, out)
  }

  // Arrays: cn(['flex', 'p-2']) and the idiomatic tv()/cva() multi-line form
  // `base: ['flex', cond && 'p-2']`. Recurse into each element so strings,
  // ternaries, and nested arrays are all reached. SpreadElement and holes
  // (`[, x]`) have nothing statically extractable, so they're skipped.
  if (node.type === 'ArrayExpression') {
    for (const element of (node as ESTree.ArrayExpression).elements) {
      if (element && element.type !== 'SpreadElement') {
        extractFromExpression(element, out)
      }
    }
    return out
  }

  // Objects: cn({ "bg-red-500": isError }) — extract the keys
  if (node.type === 'ObjectExpression') {
    for (const prop of (node as ESTree.ObjectExpression).properties) {
      if (
        prop.type === 'Property' &&
        prop.key.type === 'Literal' &&
        typeof prop.key.value === 'string'
      ) {
        out.push({
          value: prop.key.value,
          node: prop.key,
          range: [prop.key.range[0] + 1, prop.key.range[1] - 1],
        })
      }
    }
    return out
  }

  return out
}

function appendFromTemplateLiteral(
  node: ESTree.TemplateLiteral,
  out: ClassLocation[],
): ClassLocation[] {
  for (let i = 0; i < node.quasis.length; i++) {
    const quasi = node.quasis[i]
    const value = quasi.value.raw
    if (value.trim().length > 0) {
      // +1 skips the opening delimiter (` or })
      // Use value length to compute end — avoids issues with non-tail quasis
      // whose range includes the closing `${` (2 chars, not 1)
      const start = quasi.range[0] + 1
      out.push({
        value,
        node: quasi,
        range: [start, start + value.length],
        preserveLeadingSpace: i > 0,
        preserveTrailingSpace: i < node.quasis.length - 1,
      })
    }
  }
  return out
}

function extractFromTemplateLiteral(node: ESTree.TemplateLiteral): ClassLocation[] {
  return appendFromTemplateLiteral(node, [])
}

function getCalleeName(node: ESTree.Node): string | undefined {
  if (node.type === 'Identifier') return (node as ESTree.IdentifierReference).name
  if (node.type === 'MemberExpression') {
    const prop = (node as ESTree.StaticMemberExpression).property
    if (prop.type === 'Identifier') return prop.name
  }
  return undefined
}
