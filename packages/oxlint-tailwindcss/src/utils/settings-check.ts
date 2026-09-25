/**
 * `settings.tailwindcss`, checked.
 *
 * oxlint passes `settings` through without validating them, and the plugin
 * reads each key it knows and nothing else — so a misspelt key (`rootfontsize`,
 * `atributes`) or a value of the wrong type (`attributes: "className"`, read
 * letter by letter) changed nothing, or the wrong thing, silently. Every rule
 * reports what's wrong as `invalidSetting`, once per file (the first rule to
 * see the file does), from `createExtractorVisitors`' `Program` visitor.
 *
 * `entryPoint` is left to the loader, which reports a bad one with a hint.
 */

import type { ESTree } from '@oxlint/plugins'
import type { CalleeExtractorKind, ExtractorExclusions, PluginSettings } from '../types'
import { findBestSuggestion } from './levenshtein'

export const SETTINGS_MESSAGE_ID = 'invalidSetting' as const

/** Pre-shaped entry for `meta.messages`: `messages: { ..., ...SETTINGS_MESSAGE }`. */
export const SETTINGS_MESSAGE = { [SETTINGS_MESSAGE_ID]: '{{message}}' } as const

type Check = 'entryPoint' | 'boolean' | 'number' | 'strings' | 'regexes' | 'extractors' | 'exclude'

// Mapped over PluginSettings, so a setting added there without a check here
// (or a check for a setting that's gone) doesn't compile.
const CHECKS: { [K in keyof Required<PluginSettings>]: Check } = {
  entryPoint: 'entryPoint',
  debug: 'boolean',
  allowUntestedEngine: 'boolean',
  rootFontSize: 'number',
  timeout: 'number',
  attributes: 'strings',
  attributePatterns: 'regexes',
  callees: 'strings',
  calleeExtractors: 'extractors',
  tags: 'strings',
  variablePatterns: 'regexes',
  exclude: 'exclude',
}

// `exclude.variablePatterns` holds sources matched against the default
// patterns' sources, not compiled, so any string is fine there.
const EXCLUDE_KEYS: { [K in keyof Required<ExtractorExclusions>]: true } = {
  attributes: true,
  callees: true,
  tags: true,
  variablePatterns: true,
}

const EXTRACTOR_KINDS: { [K in CalleeExtractorKind]: true } = {
  tv: true,
  cva: true,
  classed: true,
  flat: true,
}

const SETTING_NAMES = Object.keys(CHECKS)
const EXCLUDE_NAMES = Object.keys(EXCLUDE_KEYS)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function unknownKey(key: string, names: string[], prefix = ''): string {
  const lower = key.toLowerCase()
  const match =
    names.find((n) => n.toLowerCase() === lower) ?? findBestSuggestion(key, names, 3) ?? null
  const hint = match ? ` (did you mean "${prefix}${match}"?)` : ''
  return `"${prefix}${key}" is not a setting${hint}`
}

function check(key: string, kind: Check, value: unknown): string[] {
  switch (kind) {
    case 'entryPoint':
      return []
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`"${key}" must be true or false`]
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? []
        : [`"${key}" must be a number`]
    case 'strings':
      return isStrings(value) ? [] : [`"${key}" must be an array of strings`]
    case 'regexes': {
      if (!isStrings(value)) return [`"${key}" must be an array of strings`]
      return value.flatMap((source) => {
        try {
          new RegExp(source)
          return []
        } catch {
          return [`"${key}" has an invalid regular expression: "${source}"`]
        }
      })
    }
    case 'extractors': {
      if (!isObject(value)) return [`"${key}" must be an object`]
      const kinds = Object.keys(EXTRACTOR_KINDS)
      return Object.entries(value).flatMap(([name, k]) =>
        typeof k === 'string' && k in EXTRACTOR_KINDS
          ? []
          : [`"${key}.${name}" must be one of ${kinds.map((n) => `"${n}"`).join(', ')}`],
      )
    }
    case 'exclude': {
      if (!isObject(value)) return [`"${key}" must be an object`]
      return Object.entries(value).flatMap(([name, v]) =>
        name in EXCLUDE_KEYS
          ? isStrings(v)
            ? []
            : [`"${key}.${name}" must be an array of strings`]
          : [unknownKey(name, EXCLUDE_NAMES, `${key}.`)],
      )
    }
  }
}

/** What's wrong with a `settings.tailwindcss` value, one entry per problem. */
export function settingsProblems(settings: unknown): string[] {
  if (settings === undefined) return []
  if (!isObject(settings)) return ['settings.tailwindcss must be an object']
  return Object.entries(settings).flatMap(([key, value]) =>
    key in CHECKS
      ? check(key, CHECKS[key as keyof PluginSettings], value)
      : [unknownKey(key, SETTING_NAMES)],
  )
}

// Every file of one config has equal settings, in a fresh object per file.
const messageByContent = new Map<string, string | null>()
const MAX_MEMO = 32

/** The diagnostic for a file's settings, or `null` when they're fine. */
function settingsMessage(settings: Readonly<Record<string, unknown>> | undefined): string | null {
  const tw = settings?.tailwindcss
  if (tw === undefined) return null
  const key = JSON.stringify(tw) ?? ''
  let message = messageByContent.get(key)
  if (message === undefined) {
    const problems = settingsProblems(tw)
    message = problems.length > 0 ? `Check settings.tailwindcss: ${problems.join('; ')}` : null
    if (messageByContent.size >= MAX_MEMO) messageByContent.clear()
    messageByContent.set(key, message)
  }
  return message
}

// The Program node is shared by every rule linting one file and new for the
// next, so the first rule to see a file reports and the rest skip it.
let lastProgram: ESTree.Program | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reporter = { settings?: Readonly<Record<string, unknown>>; report: (diagnostic: any) => void }

/** Report the file's settings problems, if any rule hasn't for this file yet. */
export function reportSettingsProblems(context: Reporter, program: ESTree.Program): void {
  if (program === lastProgram) return
  lastProgram = program
  const message = settingsMessage(context.settings)
  if (message === null) return
  context.report({
    messageId: SETTINGS_MESSAGE_ID,
    data: { message },
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
  })
}
