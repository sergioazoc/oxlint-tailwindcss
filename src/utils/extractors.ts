import type { ESTree } from '@oxlint/plugins'

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
  ],
  tags: ['tw'],
  variablePatterns: DEFAULT_VARIABLE_PATTERNS,
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

  // className={expression}
  if (node.value.type === 'JSXExpressionContainer') {
    return extractFromExpression(node.value.expression)
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

  const results: ClassLocation[] = []
  for (const arg of node.arguments) {
    results.push(...extractFromExpression(arg))
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
 * Extracts class locations from a cva() call.
 * Handles: base string, variants config, compoundVariants.
 */
function extractFromCvaCall(node: ESTree.CallExpression): ClassLocation[] {
  const results: ClassLocation[] = []
  for (const arg of node.arguments) {
    if (arg.type === 'ObjectExpression') {
      results.push(...extractFromCvaConfig(arg as ESTree.ObjectExpression))
    } else {
      results.push(...extractFromExpression(arg))
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
            results.push(...extractFromExpression(variant.value))
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
      results.push(...extractFromExpression(prop.value))
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
      results.push(...extractFromExpression(arg))
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
      results.push(...extractFromExpression(prop.value))
    } else if (name === 'slots' && prop.value.type === 'ObjectExpression') {
      // slots: { header: "p-2", body: "p-4" }
      for (const slot of (prop.value as ESTree.ObjectExpression).properties) {
        if (slot.type === 'Property') {
          results.push(...extractFromExpression(slot.value))
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
                results.push(...extractFromExpression(slotProp.value))
              }
            }
          } else {
            results.push(...extractFromExpression(variant.value))
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
      results.push(...extractFromExpression(prop.value))
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
        results.push(...extractFromExpression(prop.value))
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

function extractFromExpression(node: ESTree.Node): ClassLocation[] {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return [
      {
        value: node.value,
        node,
        range: [node.range[0] + 1, node.range[1] - 1],
      },
    ]
  }

  if (node.type === 'TemplateLiteral') {
    return extractFromTemplateLiteral(node as ESTree.TemplateLiteral)
  }

  if (node.type === 'ConditionalExpression') {
    return [
      ...extractFromExpression((node as ESTree.ConditionalExpression).consequent),
      ...extractFromExpression((node as ESTree.ConditionalExpression).alternate),
    ]
  }

  if (node.type === 'LogicalExpression') {
    return extractFromExpression((node as ESTree.LogicalExpression).right)
  }

  // Objects: cn({ "bg-red-500": isError }) — extract the keys
  if (node.type === 'ObjectExpression') {
    const results: ClassLocation[] = []
    for (const prop of (node as ESTree.ObjectExpression).properties) {
      if (
        prop.type === 'Property' &&
        prop.key.type === 'Literal' &&
        typeof prop.key.value === 'string'
      ) {
        results.push({
          value: prop.key.value,
          node: prop.key,
          range: [prop.key.range[0] + 1, prop.key.range[1] - 1],
        })
      }
    }
    return results
  }

  return []
}

function extractFromTemplateLiteral(node: ESTree.TemplateLiteral): ClassLocation[] {
  const results: ClassLocation[] = []
  for (let i = 0; i < node.quasis.length; i++) {
    const quasi = node.quasis[i]
    const value = quasi.value.raw
    if (value.trim().length > 0) {
      // +1 skips the opening delimiter (` or })
      // Use value length to compute end — avoids issues with non-tail quasis
      // whose range includes the closing `${` (2 chars, not 1)
      const start = quasi.range[0] + 1
      results.push({
        value,
        node: quasi,
        range: [start, start + value.length],
        preserveLeadingSpace: i > 0,
        preserveTrailingSpace: i < node.quasis.length - 1,
      })
    }
  }
  return results
}

function getCalleeName(node: ESTree.Node): string | undefined {
  if (node.type === 'Identifier') return (node as ESTree.IdentifierReference).name
  if (node.type === 'MemberExpression') {
    const prop = (node as ESTree.StaticMemberExpression).property
    if (prop.type === 'Identifier') return prop.name
  }
  return undefined
}
