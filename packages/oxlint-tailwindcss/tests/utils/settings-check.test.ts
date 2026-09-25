import { describe, expect, it } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { settingsProblems, SETTINGS_MESSAGE_ID } from '../../src/utils/settings-check'
import { noDuplicateClasses } from '../../src/rules/no-duplicate-classes'
import plugin from '../../src/index'

describe('settingsProblems', () => {
  it('accepts every setting with a value of its type', () => {
    expect(
      settingsProblems({
        entryPoint: 'src/styles.css',
        debug: true,
        allowUntestedEngine: false,
        rootFontSize: 16,
        timeout: 60000,
        attributes: ['xyzClassName'],
        attributePatterns: ['ClassName$'],
        callees: ['myHelper'],
        calleeExtractors: {
          defineStyles: 'tv',
          makeVariants: 'cva',
          styledEl: 'classed',
          f: 'flat',
        },
        tags: ['css'],
        variablePatterns: ['^tw[A-Z]'],
        exclude: {
          attributes: ['class'],
          callees: ['objstr'],
          tags: ['tw'],
          variablePatterns: ['^styles?$'],
        },
      }),
    ).toEqual([])
  })

  it('has nothing to say without settings', () => {
    expect(settingsProblems(undefined)).toEqual([])
    expect(settingsProblems({})).toEqual([])
  })

  it('leaves entryPoint to the loader, which explains a bad one', () => {
    expect(settingsProblems({ entryPoint: ['a.css'] })).toEqual([])
  })

  it('names an unknown key, with the setting it was likely meant to be', () => {
    expect(settingsProblems({ rootfontsize: 16 })).toEqual([
      '"rootfontsize" is not a setting (did you mean "rootFontSize"?)',
    ])
    expect(settingsProblems({ atributes: ['x'] })).toEqual([
      '"atributes" is not a setting (did you mean "attributes"?)',
    ])
    expect(settingsProblems({ entrypoint: 'src/app.css' })).toEqual([
      '"entrypoint" is not a setting (did you mean "entryPoint"?)',
    ])
    expect(settingsProblems({ config: 'tailwind.config.js' })).toEqual([
      '"config" is not a setting',
    ])
  })

  it('names a value of the wrong type', () => {
    expect(
      settingsProblems({
        debug: 'yes',
        rootFontSize: '16',
        attributes: 'className',
        tags: [1],
      }),
    ).toEqual([
      '"debug" must be true or false',
      '"rootFontSize" must be a number',
      '"attributes" must be an array of strings',
      '"tags" must be an array of strings',
    ])
  })

  it('names a pattern that is not a regular expression', () => {
    expect(settingsProblems({ variablePatterns: ['^ok$', '(unclosed'] })).toEqual([
      '"variablePatterns" has an invalid regular expression: "(unclosed"',
    ])
  })

  it('names an extractor kind that does not exist', () => {
    expect(settingsProblems({ calleeExtractors: { defineStyles: 'tvv' } })).toEqual([
      '"calleeExtractors.defineStyles" must be one of "tv", "cva", "classed", "flat"',
    ])
  })

  it('checks exclude the same way', () => {
    expect(settingsProblems({ exclude: { calee: ['x'], tags: 'css' } })).toEqual([
      '"exclude.calee" is not a setting (did you mean "exclude.callees"?)',
      '"exclude.tags" must be an array of strings',
    ])
  })

  it('names settings.tailwindcss that is not an object', () => {
    expect(settingsProblems('src/styles.css')).toEqual(['settings.tailwindcss must be an object'])
  })
})

describe('invalidSetting', () => {
  it('every rule can report it', () => {
    const missing = Object.entries(plugin.rules)
      .filter(([, rule]) => !(SETTINGS_MESSAGE_ID in (rule.meta?.messages ?? {})))
      .map(([name]) => name)
    expect(missing).toEqual([])
  })

  new RuleTester().run('no-duplicate-classes (settings check)', noDuplicateClasses, {
    valid: [
      {
        code: '<div className="flex" />',
        filename: 'test.tsx',
        settings: { tailwindcss: { rootFontSize: 16 } },
      },
    ],
    invalid: [
      {
        // Once per file, on its first line, whatever the file holds.
        code: 'const x = 1\nexport const A = <div className="flex" />',
        filename: 'test.tsx',
        settings: { tailwindcss: { rootfontsize: 16, debug: 'yes' } },
        errors: [
          {
            messageId: SETTINGS_MESSAGE_ID,
            data: {
              message:
                'Check settings.tailwindcss: "rootfontsize" is not a setting (did you mean "rootFontSize"?); "debug" must be true or false',
            },
            line: 1,
            column: 0,
          },
        ],
      },
      {
        // The rule's own diagnostics are unaffected.
        code: '<div className="flex flex" />',
        filename: 'test.tsx',
        settings: { tailwindcss: { atributes: ['x'] } },
        output: '<div className="flex" />',
        errors: [
          {
            messageId: SETTINGS_MESSAGE_ID,
            data: {
              message:
                'Check settings.tailwindcss: "atributes" is not a setting (did you mean "attributes"?)',
            },
          },
          { messageId: 'duplicate', data: { className: 'flex' } },
        ],
      },
    ],
  })
})
