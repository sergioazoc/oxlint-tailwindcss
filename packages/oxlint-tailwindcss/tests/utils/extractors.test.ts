import type { ESTree } from '@oxlint/plugins'
import { describe, expect, it } from 'vitest'
import type { CalleeExtractorKind } from '../../src/types'
import {
  DEFAULT_EXTRACTOR_CONFIG,
  type ExtractorConfig,
  extractFromCallExpression,
  extractFromJSXAttribute,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  getExtractorConfig,
  narrowGluedFragments,
  type ClassLocation,
} from '../../src/utils/extractors'

/**
 * Contract test for the `origin` tag added in issue #117. The gated relational
 * rules (`no-contradicting-variants`, `no-dark-without-light`) are exercised
 * end-to-end through a real parser in their own suites; this pins the exact
 * origin value each extraction site emits — including `variable`,
 * `template-tag`, and `jsx-object`, which the gated rules never surface.
 *
 * Nodes are hand-built with only the fields the extractor reads, cast to the
 * plugin AST types. Ranges are arbitrary but valid `[start, end]` pairs.
 */

const RANGE: [number, number] = [0, 20]

function stringLiteral(value: string): ESTree.Node {
  return { type: 'Literal', value, range: RANGE } as unknown as ESTree.Node
}

function jsxAttribute(hostName: string, value: ESTree.Node): ESTree.JSXAttribute {
  const attr = {
    type: 'JSXAttribute',
    name: { type: 'JSXIdentifier', name: 'className' },
    value,
  } as unknown as ESTree.JSXAttribute
  // The extractor reads the host via `node.parent` (the JSXOpeningElement).
  ;(attr as unknown as { parent: unknown }).parent = {
    type: 'JSXOpeningElement',
    name: { type: 'JSXIdentifier', name: hostName },
  }
  return attr
}

describe('extractor origin (issue #117)', () => {
  it('tags a literal on a native (lowercase) host as jsx-native', () => {
    const locs = extractFromJSXAttribute(
      jsxAttribute('div', {
        type: 'Literal',
        value: 'flex dark:flex',
        range: RANGE,
      } as unknown as ESTree.Node),
    )
    expect(locs).toHaveLength(1)
    expect(locs[0].origin).toBe('jsx-native')
  })

  it('tags a literal on a custom (capitalized) component host as jsx-component', () => {
    const locs = extractFromJSXAttribute(
      jsxAttribute('Button', {
        type: 'Literal',
        value: 'flex dark:flex',
        range: RANGE,
      } as unknown as ESTree.Node),
    )
    expect(locs).toHaveLength(1)
    expect(locs[0].origin).toBe('jsx-component')
  })

  it('tags classNames={{ ... }} object values as jsx-object', () => {
    const objectContainer = {
      type: 'JSXExpressionContainer',
      expression: {
        type: 'ObjectExpression',
        properties: [
          {
            type: 'Property',
            key: { type: 'Identifier', name: 'root' },
            value: stringLiteral('flex'),
          },
        ],
      },
    } as unknown as ESTree.Node
    const locs = extractFromJSXAttribute(jsxAttribute('div', objectContainer))
    expect(locs).toHaveLength(1)
    expect(locs[0].origin).toBe('jsx-object')
  })

  it('tags merge-call arguments as callee', () => {
    const call = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'cn' },
      arguments: [stringLiteral('flex'), stringLiteral('dark:flex')],
    } as unknown as ESTree.CallExpression
    const locs = extractFromCallExpression(call)
    expect(locs).toHaveLength(2)
    expect(locs.every((l) => l.origin === 'callee')).toBe(true)
  })

  it('tags tagged-template classes as template-tag', () => {
    const tagged = {
      type: 'TaggedTemplateExpression',
      tag: { type: 'Identifier', name: 'tw' },
      quasi: {
        type: 'TemplateLiteral',
        quasis: [{ type: 'TemplateElement', value: { raw: 'flex dark:flex' }, range: RANGE }],
        expressions: [],
      },
    } as unknown as ESTree.TaggedTemplateExpression
    const locs = extractFromTaggedTemplate(tagged)
    expect(locs).toHaveLength(1)
    expect(locs[0].origin).toBe('template-tag')
  })

  it('tags a matching variable initializer as variable', () => {
    const declarator = {
      type: 'VariableDeclarator',
      id: { type: 'Identifier', name: 'className' },
      init: stringLiteral('flex dark:flex'),
    } as unknown as ESTree.VariableDeclarator
    const locs = extractFromVariableDeclarator(declarator)
    expect(locs).toHaveLength(1)
    expect(locs[0].origin).toBe('variable')
  })
})

/**
 * Issue #134: `attributePatterns` matches JSX attribute NAMES by regex, additive
 * to the exact `attributes` list — so `*ClassName` conventions (React Native /
 * Uniwind) are caught without listing every prop.
 */
describe('attributePatterns — regex JSX attribute matching (#134)', () => {
  const withPatterns = (patterns: RegExp[]): ExtractorConfig => ({
    ...DEFAULT_EXTRACTOR_CONFIG,
    attributePatterns: patterns,
  })
  const namedAttr = (attrName: string, value: string): ESTree.JSXAttribute => {
    const a = {
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: attrName },
      value: { type: 'Literal', value, range: RANGE },
    } as unknown as ESTree.JSXAttribute
    ;(a as unknown as { parent: unknown }).parent = {
      type: 'JSXOpeningElement',
      name: { type: 'JSXIdentifier', name: 'ScrollView' },
    }
    return a
  }

  it('extracts a *ClassName prop matched by a pattern', () => {
    const locs = extractFromJSXAttribute(
      namedAttr('contentContainerClassName', 'p-4'),
      withPatterns([/ClassName$/]),
    )
    expect(locs).toHaveLength(1)
    expect(locs[0].value).toBe('p-4')
  })

  it('ignores an attribute no pattern matches', () => {
    expect(
      extractFromJSXAttribute(namedAttr('data-foo', 'p-4'), withPatterns([/ClassName$/])),
    ).toHaveLength(0)
  })

  it('is additive: the default exact `attributes` still match under a pattern', () => {
    expect(
      extractFromJSXAttribute(namedAttr('className', 'p-4'), withPatterns([/^tw[A-Z]/])),
    ).toHaveLength(1)
  })

  it('matches nothing extra with the default empty patterns', () => {
    expect(extractFromJSXAttribute(namedAttr('contentContainerClassName', 'p-4'))).toHaveLength(0)
  })
})

/**
 * Issue #155: `calleeExtractors` routes a custom callee (a wrapper re-exported
 * under another name) through a known structured extractor — `tv`/`cva`/
 * `classed` reuse the dedicated extractors; `flat` is the generic cn-style walk.
 */
describe('calleeExtractors — structured routing for custom callees (#155)', () => {
  const prop = (name: string, value: ESTree.Node): ESTree.Node =>
    ({ type: 'Property', key: { type: 'Identifier', name }, value }) as unknown as ESTree.Node
  const obj = (props: ESTree.Node[]): ESTree.Node =>
    ({ type: 'ObjectExpression', properties: props }) as unknown as ESTree.Node
  const arr = (elements: ESTree.Node[]): ESTree.Node =>
    ({ type: 'ArrayExpression', elements }) as unknown as ESTree.Node
  const call = (name: string, args: ESTree.Node[]): ESTree.CallExpression =>
    ({
      type: 'CallExpression',
      callee: { type: 'Identifier', name },
      arguments: args,
    }) as unknown as ESTree.CallExpression

  // Injects a config with the given routes, auto-registering the names as
  // callees (production does this in getExtractorConfig; the unit-level dispatch
  // guard reads config.callees directly).
  const withRoutes = (entries: [string, CalleeExtractorKind][]): ExtractorConfig => ({
    ...DEFAULT_EXTRACTOR_CONFIG,
    callees: [...DEFAULT_EXTRACTOR_CONFIG.callees, ...entries.map(([n]) => n)],
    calleeExtractors: new Map(entries),
  })
  const values = (locs: ReturnType<typeof extractFromCallExpression>): string[] =>
    locs.map((l) => l.value)

  describe('dispatch', () => {
    it('routes a custom callee mapped to "tv" through the tv extractor', () => {
      const node = call('defineStyles', [
        obj([
          prop('base', stringLiteral('flex')),
          prop(
            'slots',
            obj([prop('header', stringLiteral('p-2')), prop('body', stringLiteral('p-4'))]),
          ),
          prop(
            'variants',
            obj([
              prop(
                'size',
                obj([prop('sm', stringLiteral('text-sm')), prop('lg', stringLiteral('text-lg'))]),
              ),
            ]),
          ),
          prop(
            'compoundVariants',
            arr([obj([prop('size', stringLiteral('sm')), prop('class', stringLiteral('gap-1'))])]),
          ),
          prop('defaultVariants', obj([prop('size', stringLiteral('sm'))])),
        ]),
      ])
      const got = values(extractFromCallExpression(node, withRoutes([['defineStyles', 'tv']])))
      // base + both slots + both variant values + compoundVariant class; the
      // variant *names* (`sm`/`lg`) and `defaultVariants` are never classes.
      expect(got.sort()).toEqual(['flex', 'gap-1', 'p-2', 'p-4', 'text-lg', 'text-sm'])
    })

    it('routes a custom callee mapped to "cva" through the cva extractor', () => {
      const node = call('makeVariants', [
        stringLiteral('flex'),
        obj([
          prop('variants', obj([prop('size', obj([prop('sm', stringLiteral('text-sm'))]))])),
          prop(
            'compoundVariants',
            arr([
              obj([prop('size', stringLiteral('sm')), prop('className', stringLiteral('gap-1'))]),
            ]),
          ),
          prop('defaultVariants', obj([prop('size', stringLiteral('sm'))])),
        ]),
      ])
      const got = values(extractFromCallExpression(node, withRoutes([['makeVariants', 'cva']])))
      expect(got.sort()).toEqual(['flex', 'gap-1', 'text-sm'])
    })

    it('routes a custom callee mapped to "classed" and skips the element-type arg', () => {
      const node = call('styledEl', [
        stringLiteral('button'), // element type — must be skipped
        stringLiteral('flex items-center'),
        obj([prop('variants', obj([prop('size', obj([prop('sm', stringLiteral('text-sm'))]))]))]),
      ])
      const got = values(extractFromCallExpression(node, withRoutes([['styledEl', 'classed']])))
      expect(got.sort()).toEqual(['flex items-center', 'text-sm'])
    })

    it('treats a callee mapped to "flat" as generic cn-style extraction', () => {
      const node = call('cnx', [stringLiteral('flex'), stringLiteral('p-2')])
      const got = values(extractFromCallExpression(node, withRoutes([['cnx', 'flat']])))
      expect(got.sort()).toEqual(['flex', 'p-2'])
    })

    it('leaves a built-in structured callee untouched even if remapped (builtins win)', () => {
      // Map the reserved `tv` to "flat"; a real tv({ slots }) must still be
      // extracted structurally, not flattened (flat would find no class here).
      const node = call('tv', [obj([prop('slots', obj([prop('header', stringLiteral('p-2'))]))])])
      const got = values(extractFromCallExpression(node, withRoutes([['tv', 'flat']])))
      expect(got).toEqual(['p-2'])
    })
  })

  describe('config resolution (getExtractorConfig)', () => {
    it('auto-registers mapped names as callees and keeps the routes', () => {
      const cfg = getExtractorConfig({
        settings: { tailwindcss: { calleeExtractors: { defineStyles: 'tv', mk: 'cva' } } },
      })
      expect(cfg.calleeExtractors.get('defineStyles')).toBe('tv')
      expect(cfg.calleeExtractors.get('mk')).toBe('cva')
      expect(cfg.callees).toContain('defineStyles')
      expect(cfg.callees).toContain('mk')
    })

    it('skips an unrecognized kind without throwing', () => {
      const cfg = getExtractorConfig({
        settings: { tailwindcss: { calleeExtractors: { defineStyles: 'tv', bad: 'cvaa' } } },
      })
      expect(cfg.calleeExtractors.get('defineStyles')).toBe('tv')
      expect(cfg.calleeExtractors.has('bad')).toBe(false)
      expect(cfg.callees).not.toContain('bad')
    })

    it('ignores a non-object calleeExtractors without throwing', () => {
      const cfg = getExtractorConfig({
        settings: { tailwindcss: { calleeExtractors: 'nope' } },
      })
      expect(cfg.calleeExtractors.size).toBe(0)
    })

    it('lets exclude.callees win over an auto-registered mapped name', () => {
      const cfg = getExtractorConfig({
        settings: {
          tailwindcss: {
            calleeExtractors: { defineStyles: 'tv' },
            exclude: { callees: ['defineStyles'] },
          },
        },
      })
      expect(cfg.calleeExtractors.has('defineStyles')).toBe(false)
      expect(cfg.callees).not.toContain('defineStyles')
    })
  })
})

/**
 * `narrowGluedFragments` works on the quasi locations the template extractor
 * emits: `preserveLeadingSpace` = preceded by `${}`, `preserveTrailingSpace` =
 * followed by `${}`. `source` is the template body, so `quasi(…)` can compute
 * each quasi's real range the way the extractor does.
 */
describe('narrowGluedFragments — template fragments glued to ${}', () => {
  const NODE = { type: 'TemplateElement' } as unknown as ESTree.Node
  function quasi(
    text: string,
    start: number,
    flags: { lead?: boolean; trail?: boolean } = {},
  ): ClassLocation {
    return {
      value: text,
      node: NODE,
      range: [start, start + text.length],
      preserveLeadingSpace: flags.lead ?? false,
      preserveTrailingSpace: flags.trail ?? false,
    }
  }
  const view = (locs: ClassLocation[]) => locs.map((l) => [l.value, l.range])

  it('cuts the trailing fragment glued to the next expression', () => {
    // `ml-2 text-${c}` — quasi 0 is `ml-2 text-` at [1, 11]
    expect(view(narrowGluedFragments([quasi('ml-2 text-', 1, { trail: true })]))).toEqual([
      ['ml-2 ', [1, 6]],
    ])
  })

  it('cuts the leading fragment glued to the previous expression', () => {
    // `bg-${c}-500 p-4` — quasi 1 is `-500 p-4`
    expect(view(narrowGluedFragments([quasi('-500 p-4', 10, { lead: true })]))).toEqual([
      [' p-4', [14, 18]],
    ])
  })

  it('cuts both ends of a quasi between two expressions', () => {
    // `${a}-500 p-4 bg-${b}` — middle quasi `-500 p-4 bg-`
    expect(
      view(narrowGluedFragments([quasi('-500 p-4 bg-', 5, { lead: true, trail: true })])),
    ).toEqual([[' p-4 ', [9, 14]]])
  })

  it('drops a quasi that is only a fragment', () => {
    expect(narrowGluedFragments([quasi('bg-', 1, { trail: true })])).toEqual([])
    expect(narrowGluedFragments([quasi('-', 5, { lead: true, trail: true })])).toEqual([])
    expect(narrowGluedFragments([quasi('-500 ', 5, { lead: true })])).toEqual([])
  })

  it('leaves quasis with whitespace at the expression boundary untouched (same object)', () => {
    const locs = [
      quasi('flex p-4 ', 1, { trail: true }),
      quasi(' flex ', 12, { lead: true, trail: true }),
    ]
    const out = narrowGluedFragments(locs)
    expect(out).toBe(locs)
  })

  it('treats newlines and tabs as boundary whitespace', () => {
    expect(view(narrowGluedFragments([quasi('flex\n  text-', 1, { trail: true })]))).toEqual([
      ['flex\n  ', [1, 8]],
    ])
  })

  it('never touches a plain string (no expression neighbours)', () => {
    const locs = [quasi('text- -500 bg-', 0)]
    expect(narrowGluedFragments(locs)).toBe(locs)
  })

  it('keeps every other location field', () => {
    const loc = {
      ...quasi('ml-2 text-', 1, { trail: true }),
      origin: 'callee' as const,
      templateLine: 3,
    }
    const [out] = narrowGluedFragments([loc])
    expect(out).toMatchObject({
      origin: 'callee',
      templateLine: 3,
      node: NODE,
      preserveTrailingSpace: true,
    })
  })
})
