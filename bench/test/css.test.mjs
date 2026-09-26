import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  cssEscape,
  effectiveStyle,
  longhands,
  normalizeValue,
  parseCss,
  normalizeSelector,
  physicalValue,
  styleDiff,
} from '../lib/css.mjs'

// A stand-in for the Tailwind engine: each class's CSS, in emission order.
const CSS = {
  flex: '.flex {\n  display: flex;\n}\n',
  'p-4': '.p-4 {\n  padding: calc(var(--spacing) * 4);\n}\n',
  'p-6': '.p-6 {\n  padding: calc(var(--spacing) * 6);\n}\n',
  'px-4': '.px-4 {\n  padding-inline: calc(var(--spacing) * 4);\n}\n',
  'py-4': '.py-4 {\n  padding-block: calc(var(--spacing) * 4);\n}\n',
  'pl-4': '.pl-4 {\n  padding-left: calc(var(--spacing) * 4);\n}\n',
  'pr-4': '.pr-4 {\n  padding-right: calc(var(--spacing) * 4);\n}\n',
  'mt-4': '.mt-4 {\n  margin-top: calc(var(--spacing) * 4);\n}\n',
  'mt-[16px]': '.mt-\\[16px\\] {\n  margin-top: 16px;\n}\n',
  'ms-4': '.ms-4 {\n  margin-inline-start: calc(var(--spacing) * 4);\n}\n',
  'ml-4': '.ml-4 {\n  margin-left: calc(var(--spacing) * 4);\n}\n',
  'hover:bg-primary':
    '@media (hover: hover) {\n  .hover\\:bg-primary:hover {\n    background-color: var(--primary);\n  }\n}\n',
  'bg-primary': '.bg-primary {\n  background-color: var(--primary);\n}\n',
  'p-4!': '.p-4\\! {\n  padding: calc(var(--spacing) * 4) !important;\n}\n',
  'bg-old': '.bg-old {\n  --tw-gradient-position: to top in oklab;\n}\n',
  'bg-new':
    '.bg-new {\n  --tw-gradient-position: to top;\n  @supports (background-image: linear-gradient(in lab, red, red)) {\n    --tw-gradient-position: to top in oklab;\n  }\n}\n',
  'text-xs': '.text-xs {\n  font-size: 0.75rem;\n  line-height: var(--tw-leading, 1.3);\n}\n',
  'leading-relaxed': '.leading-relaxed {\n  --tw-leading: 1.625;\n  line-height: 1.625;\n}\n',
  'text-xs/relaxed': '.text-xs\\/relaxed {\n  font-size: 0.75rem;\n  line-height: 1.625;\n}\n',
  'md:text-lg':
    '@media (width >= 48rem) {\n  .md\\:text-lg {\n    font-size: 1.125rem;\n    line-height: var(--tw-leading, 1.5);\n  }\n}\n',
  'shadow-sm':
    '.shadow-sm {\n  box-shadow: 0 1px 3px 0;\n}\n@property --tw-shadow {\n  syntax: "*";\n  inherits: false;\n}\n',
}
const ORDER = Object.keys(CSS)
const engine = {
  css: (cls) => CSS[cls] ?? null,
  order: (classes) => classes.map((c) => [c, ORDER.includes(c) ? BigInt(ORDER.indexOf(c)) : null]),
  themeValue: (name) => ({ '--spacing': '0.25rem' })[name],
}
const style = (classes) => effectiveStyle(classes.split(' '), engine)

describe('cssEscape', () => {
  it('escapes what Tailwind escapes in a class selector', () => {
    assert.equal(cssEscape('hover:bg-primary'), 'hover\\:bg-primary')
    assert.equal(cssEscape('w-1/2'), 'w-1\\/2')
    assert.equal(cssEscape('mt-[16px]'), 'mt-\\[16px\\]')
    assert.equal(cssEscape('2xl:p-4'), '\\32 xl\\:p-4')
  })
})

describe('parseCss', () => {
  it('reads escaped quotes and brackets in a selector as part of it', () => {
    const [rule] = parseCss(
      ".\\[\\&_svg\\:not\\(\\[class\\*\\=\\'size-\\'\\]\\)\\]\\:size-4 svg { width: 1px; }",
    )
    assert.equal(rule.type, 'block')
    assert.deepEqual(rule.children, [
      { type: 'decl', prop: 'width', value: '1px', important: false },
    ])
  })

  it('reads nested blocks and declarations, strings included', () => {
    assert.deepEqual(
      parseCss('@media (x) { .a:hover { content: "}; x"; color: red !important } }'),
      [
        {
          type: 'block',
          prelude: '@media (x)',
          children: [
            {
              type: 'block',
              prelude: '.a:hover',
              children: [
                { type: 'decl', prop: 'content', value: '"}; x"', important: false },
                { type: 'decl', prop: 'color', value: 'red', important: true },
              ],
            },
          ],
        },
      ],
    )
  })
})

describe('longhands', () => {
  it('expands to physical sides, read left-to-right', () => {
    assert.deepEqual(longhands('padding-inline'), ['padding-left', 'padding-right'])
    assert.deepEqual(longhands('margin-inline-start'), ['margin-left'])
    assert.deepEqual(longhands('inset-block'), ['top', 'bottom'])
    assert.deepEqual(longhands('border-inline-width'), ['border-left-width', 'border-right-width'])
    assert.deepEqual(longhands('border-start-end-radius'), ['border-top-right-radius'])
    assert.deepEqual(longhands('gap'), ['row-gap', 'column-gap'])
    assert.deepEqual(longhands('color'), ['color'])
  })
})

describe('normalizeSelector', () => {
  it('unwraps :is() of a single selector only', () => {
    assert.equal(normalizeSelector('&:has(:is([role=checkbox]))'), '&:has([role=checkbox])')
    assert.equal(normalizeSelector('&:is(.a, .b)'), '&:is(.a, .b)')
  })

  it('makes two spellings of a child-with-attribute selector equal', () => {
    assert.equal(
      normalizeSelector('&>[data-slot=field-label]'),
      normalizeSelector(':is(& > *)[data-slot="field-label"]'),
    )
  })
})

describe('physicalValue', () => {
  it('reads logical keywords left-to-right', () => {
    assert.equal(physicalValue('text-align', 'start'), 'left')
    assert.equal(physicalValue('float', 'inline-end'), 'right')
    assert.equal(physicalValue('text-align', 'center'), 'center')
  })
})

describe('normalizeValue', () => {
  const theme = (name) => ({ '--spacing': '0.25rem', '--text-sm': '0.875rem' })[name]
  it('substitutes theme variables and evaluates a length times a number', () => {
    assert.equal(normalizeValue('calc(var(--spacing) * 4)', theme), '16px')
    assert.equal(normalizeValue('16px', theme), '16px')
    assert.equal(normalizeValue('1rem', theme), '16px')
    assert.equal(normalizeValue('var(--text-sm)', theme), '14px')
  })
  it('keeps a number a number', () => {
    assert.equal(normalizeValue('calc(2.25 / 1.875)', theme), '1.2')
    assert.equal(normalizeValue('calc(1rem / 2)', theme), '8px')
  })

  it('ignores spacing around * and /', () => {
    assert.equal(
      normalizeValue('calc(1/2 * 100%)', theme),
      normalizeValue('calc(1 / 2 * 100%)', theme),
    )
  })

  it('leaves anything else as written', () => {
    assert.equal(normalizeValue('var(--primary)', theme), 'var(--primary)')
    assert.equal(normalizeValue('calc(100% - 2px)', theme), 'calc(100% - 2px)')
  })
})

describe('effectiveStyle', () => {
  it('equal for two spellings of one style', () => {
    assert.equal(styleDiff(style('px-4'), style('pr-4 pl-4')), null)
    assert.equal(styleDiff(style('p-4'), style('px-4 py-4')), null)
    assert.equal(styleDiff(style('mt-[16px]'), style('mt-4')), null)
    assert.equal(styleDiff(style('ms-4'), style('ml-4')), null)
    assert.equal(styleDiff(style('flex p-4'), style('p-4 flex flex')), null)
  })

  it('the class Tailwind emits last wins, whatever the order written; !important wins over it', () => {
    assert.equal(styleDiff(style('p-6 p-4'), style('p-6')), null)
    assert.notEqual(styleDiff(style('p-6 p-4'), style('p-4')), null)
    assert.equal(styleDiff(style('p-4! p-6'), style('p-4!')), null)
  })

  it('applies @supports blocks, as the browsers Tailwind v4 supports do', () => {
    assert.equal(styleDiff(style('bg-old'), style('bg-new')), null)
  })

  it('counts a --tw- property only when a declaration of the element reads it', () => {
    assert.equal(styleDiff(style('text-xs leading-relaxed'), style('text-xs/relaxed')), null)
    // With md:text-lg reading --tw-leading, dropping it changes the md line-height.
    assert.notEqual(
      styleDiff(style('text-xs leading-relaxed md:text-lg'), style('text-xs/relaxed md:text-lg')),
      null,
    )
  })

  it('keeps variants apart, and skips @property', () => {
    const { style: s } = style('bg-primary hover:bg-primary shadow-sm')
    assert.deepEqual([...s.keys()].sort(), [
      '& | background-color',
      '& | box-shadow',
      '@media (hover: hover) > &:hover | background-color',
    ])
  })

  it('reports what changed, and the unknown classes a fix removed or added', () => {
    assert.deepEqual(styleDiff(style('p-4 flx'), style('p-6 flex')), {
      changed: [
        { key: '& | padding-top', before: '16px', after: '24px' },
        { key: '& | padding-right', before: '16px', after: '24px' },
        { key: '& | padding-bottom', before: '16px', after: '24px' },
        { key: '& | padding-left', before: '16px', after: '24px' },
        { key: '& | display', before: null, after: 'flex' },
      ],
      removedUnknown: ['flx'],
      addedUnknown: [],
    })
  })
})
