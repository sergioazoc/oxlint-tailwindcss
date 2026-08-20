import type { ESTree } from '@oxlint/plugins'
import { describe, expect, it } from 'vitest'
import {
  extractFromCallExpression,
  extractFromJSXAttribute,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
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
