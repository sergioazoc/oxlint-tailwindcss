import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'
import { ruleDocs } from '../utils/rule-docs'
import {
  createExtractorVisitors,
  extractFromCallExpression,
  extractFromJSXAttribute,
  getExtractorConfig,
  type ClassLocation,
} from '../utils/extractors'
import { splitClassesWithSeparators } from '../utils/class-splitter'
import { createLazyOptions, safeCwd, safeFilename } from '../utils/context'
import { createLazyLoader, resolveStringEntryPoint } from '../design-system/loader'
import type { DesignSystemCache } from '../design-system/cache'
import { DS_UNAVAILABLE_MESSAGE, safeGetDS } from '../utils/fatal'
import { SETTINGS_MESSAGE } from '../utils/settings-check'
import { scanComponentStyles } from '../utils/component-scanner'
import {
  isColorKey,
  isSurfaceKey,
  resemblance,
  signatureOf,
  type Signature,
} from '../utils/style-signature'

interface Options {
  components?: string[]
  entryPoint?: string
}

/** Fewer shared declarations than this is a coincidence, not a copy. */
const MIN_SHARED = 4
/** Shared declarations over all the declarations either side sets. */
const MIN_SIMILARITY = 0.6

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/
const NOT_A_COMPONENT = /\.(?:d|test|spec|stories)\.[cm]?[jt]sx?$/

interface ComponentSignature {
  name: string
  /** The component's file, relative to where oxlint runs. */
  file: string
  signature: Signature
}

/** The source files under each path: a file as is, a directory recursively. */
function expandPaths(paths: string[]): string[] {
  const files: string[] = []
  const visit = (path: string) => {
    let stat
    try {
      stat = statSync(path)
    } catch {
      return
    }
    if (stat.isFile()) {
      files.push(path)
      return
    }
    if (!stat.isDirectory()) return
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (SOURCE_FILE.test(entry.name) && !NOT_A_COMPONENT.test(entry.name)) files.push(child)
    }
  }
  for (const path of paths) visit(path)
  return [...new Set(files)].sort()
}

/**
 * The components' signatures, indexed by each color declaration they set
 * (`background-color\0var(--primary)`): an element is only compared with the
 * ones it shares a color with, since nothing else can match.
 */
type SignatureIndex = Map<string, ComponentSignature[]>

const signaturesMemo = new WeakMap<DesignSystemCache, Map<string, SignatureIndex>>()

/**
 * The signatures of the components in `files`, once per design system and
 * file set. Styles too small to tell apart, or with no color or no box — the
 * design system's identity — are dropped, and of two identical ones the first
 * stays.
 */
function componentSignatures(
  files: string[],
  cache: DesignSystemCache,
  entryPoint: string,
): SignatureIndex {
  let byFiles = signaturesMemo.get(cache)
  if (!byFiles) signaturesMemo.set(cache, (byFiles = new Map()))
  const key = files.join('\0')
  const memo = byFiles.get(key)
  if (memo) return memo

  const index: SignatureIndex = new Map()
  const seen = new Set<string>()
  for (const path of files) {
    let source
    try {
      source = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    for (const style of scanComponentStyles(source)) {
      const signature = signatureOf(style.classes, cache, entryPoint)
      const keys = [...signature.keys()]
      if (signature.size < MIN_SHARED || !keys.some(isColorKey) || !keys.some(isSurfaceKey)) {
        continue
      }
      const id = JSON.stringify([...signature].sort())
      if (seen.has(id)) continue
      seen.add(id)
      const file = relative(process.cwd(), path).split('\\').join('/')
      const component = { name: style.name, file, signature }
      for (const [prop, value] of signature) {
        if (!isColorKey(prop)) continue
        const slot = `${prop}\0${value}`
        const list = index.get(slot)
        if (list) list.push(component)
        else index.set(slot, [component])
      }
    }
  }
  byFiles.set(key, index)
  return index
}

/** The components an element shares at least one color declaration with, once each. */
function candidatesFor(element: Signature, index: SignatureIndex): Set<ComponentSignature> {
  const out = new Set<ComponentSignature>()
  for (const [prop, value] of element) {
    if (!isColorKey(prop)) continue
    for (const component of index.get(`${prop}\0${value}`) ?? []) out.add(component)
  }
  return out
}

const expanded = new Map<string, string[]>()

/** `expandPaths`, once per set of resolved paths: the directories are read once per run. */
function componentFiles(paths: string[]): string[] {
  const key = paths.join('\0')
  let files = expanded.get(key)
  if (!files) expanded.set(key, (files = expandPaths(paths)))
  return files
}

/** A native (lowercase) element's tag name node, or `null` for a component. */
function nativeTag(attribute: ESTree.JSXAttribute): ESTree.JSXIdentifier | null {
  const element = attribute.parent
  if (element?.type !== 'JSXOpeningElement' || element.name.type !== 'JSXIdentifier') return null
  return /^[a-z]/.test(element.name.name) ? element.name : null
}

export const noBorrowedComponentStyles = defineRule({
  meta: {
    type: 'suggestion',
    docs: ruleDocs('no-borrowed-component-styles', {
      description:
        "Disallow a plain element that rebuilds one of your design system's components from its classes",
      category: 'design-system',
      recommended: false,
      designSystem: 'required',
      experimental: true,
    }),
    schema: [
      {
        type: 'object',
        properties: {
          components: { type: 'array', items: { type: 'string' } },
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ components: [] }],
    messages: {
      ...SETTINGS_MESSAGE,
      borrowedStyles:
        '<{{tag}}> rebuilds {{component}}: {{shared}} of its {{total}} style declarations match. Use {{component}} from {{file}} instead, so it follows your design system.',
      ...DS_UNAVAILABLE_MESSAGE,
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)
    const getPaths = createLazyOptions<Options, string[]>(context, (o) => o?.components ?? [])
    // Per file: a relative path is resolved like `entryPoint`, against the
    // nearest .oxlintrc.json, and a nested config can name other components.
    let lastFile: string | undefined
    let files = new Set<string>()

    function check(tag: ESTree.JSXIdentifier, locations: ClassLocation[]) {
      if (locations.length === 0) return
      const paths = getPaths()
      if (paths.length === 0) return
      const filename = resolve(safeFilename(context) ?? '')
      if (filename !== lastFile) {
        lastFile = filename
        const cwd = safeCwd(context)
        files = new Set(componentFiles(paths.map((p) => resolveStringEntryPoint(p, filename, cwd))))
      }
      if (files.has(filename)) return

      const ds = safeGetDS(getDS, context, locations[0].node)
      if (!ds) return
      const index = componentSignatures([...files], ds.cache, ds.entryPoint)
      if (index.size === 0) return

      const classes = locations.flatMap((loc) => splitClassesWithSeparators(loc.value).classes)
      const element = signatureOf(classes, ds.cache, ds.entryPoint)
      if (element.size < MIN_SHARED) return

      let best: { component: ComponentSignature; shared: number; score: number } | null = null
      for (const component of candidatesFor(element, index)) {
        const r = resemblance(component.signature, element)
        // A color set to something else is another style, not a copy of this
        // one; and shared text styles alone are any text, not this component.
        if (r.shared < MIN_SHARED || r.conflictingColor || !r.sharedSurface) continue
        const score = r.shared / r.union
        if (score < MIN_SIMILARITY) continue
        if (!best || score > best.score || (score === best.score && r.shared > best.shared)) {
          best = { component, shared: r.shared, score }
        }
      }
      if (!best) return
      context.report({
        node: tag,
        messageId: 'borrowedStyles',
        data: {
          tag: tag.name,
          component: best.component.name,
          shared: String(best.shared),
          total: String(best.component.signature.size),
          file: best.component.file,
        },
      })
    }

    // Only a native element's own class list: a component's `className` is
    // merged into its styles, not a copy of them. The attribute's classes are
    // read whole — a literal, or the arguments of a `cn()` it calls — so an
    // element is compared once.
    const { Program } = createExtractorVisitors(context, () => {})
    return {
      Program,
      JSXAttribute(node: ESTree.JSXAttribute) {
        const tag = nativeTag(node)
        if (!tag) return
        const config = getExtractorConfig(context)
        const locations = extractFromJSXAttribute(node, config)
        const value = node.value
        if (
          value?.type === 'JSXExpressionContainer' &&
          value.expression.type === 'CallExpression'
        ) {
          locations.push(...extractFromCallExpression(value.expression, config))
        }
        check(tag, locations)
      },
    }
  },
})
