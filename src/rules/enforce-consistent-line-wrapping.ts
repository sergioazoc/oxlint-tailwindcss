import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  type ClassLocation,
} from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { safeOptions } from '../types'

interface Options {
  printWidth?: number
  classesPerLine?: number
}

const DEFAULT_PRINT_WIDTH = 80

export const enforceConsistentLineWrapping = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn when a class string exceeds the configured print width',
    },
    fixable: 'whitespace',
    schema: [
      {
        type: 'object',
        properties: {
          printWidth: { type: 'number' },
          classesPerLine: { type: 'number' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooLong:
        'Class string is {{length}} characters long, exceeding the print width of {{printWidth}}. Consider splitting into multiple lines or extracting into a component.',
      tooManyPerLine:
        'Too many classes on a single line ({{count}}). Maximum allowed per line is {{max}}.',
    },
  },
  createOnce(context) {
    let _printWidth: number | null = null
    function getPrintWidth(): number {
      if (_printWidth === null) {
        const options = safeOptions<Options>(context)
        _printWidth = options?.printWidth ?? DEFAULT_PRINT_WIDTH
      }
      return _printWidth
    }

    let _classesPerLine: number | undefined | null = null
    function getClassesPerLine(): number | undefined {
      if (_classesPerLine === null) {
        const options = safeOptions<Options>(context)
        _classesPerLine = options?.classesPerLine ?? undefined
      }
      return _classesPerLine
    }

    function check(locations: ClassLocation[]) {
      const printWidth = getPrintWidth()
      const classesPerLine = getClassesPerLine()

      for (const loc of locations) {
        if (loc.value.length > printWidth) {
          context.report({
            node: loc.node,
            messageId: 'tooLong',
            data: {
              length: String(loc.value.length),
              printWidth: String(printWidth),
            },
          })
        }

        if (classesPerLine !== undefined) {
          const classes = splitClasses(loc.value)
          if (classes.length > classesPerLine) {
            const isTemplateLiteral = loc.node.type === 'TemplateElement'
            if (isTemplateLiteral) {
              // Autofix: split into chunks of classesPerLine
              const chunks: string[] = []
              for (let i = 0; i < classes.length; i += classesPerLine) {
                chunks.push(classes.slice(i, i + classesPerLine).join(' '))
              }
              // Compute base indentation from the node's start column
              const startCol = loc.node.loc?.start.column ?? 0
              const indent = ' '.repeat(startCol)
              const fixedValue = chunks.join('\n' + indent)

              context.report({
                node: loc.node,
                messageId: 'tooManyPerLine',
                data: {
                  count: String(classes.length),
                  max: String(classesPerLine),
                },
                fix(fixer) {
                  return fixer.replaceTextRange(loc.range, fixedValue)
                },
              })
            } else {
              context.report({
                node: loc.node,
                messageId: 'tooManyPerLine',
                data: {
                  count: String(classes.length),
                  max: String(classesPerLine),
                },
              })
            }
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        check(extractFromJSXAttribute(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      CallExpression(node) {
        check(extractFromCallExpression(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      TaggedTemplateExpression(node) {
        check(extractFromTaggedTemplate(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      VariableDeclarator(node) {
        check(extractFromVariableDeclarator(node, DEFAULT_EXTRACTOR_CONFIG))
      },
    }
  },
})
