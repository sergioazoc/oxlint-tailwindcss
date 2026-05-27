import { describe, it, expect } from 'vitest'
import { resolve, sep } from 'node:path'
import {
  entryPointFromSettings,
  resolveByGlobMapping,
  resolveEntryPointForFile,
  type EntryPointMapping,
} from '../../src/design-system/loader'
import { DeprecatedEntryPointShapeError, MissingEntryPointError } from '../../src/utils/fatal'

// v1 dropped auto-detect, lastLoadedPath, and the `string[]` prefix heuristic.
// The remaining resolution surface is pure functions: `entryPointFromSettings`
// parses the user's `settings.tailwindcss.entryPoint`, and
// `resolveByGlobMapping` / `resolveEntryPointForFile` do the matching.

describe('entryPointFromSettings', () => {
  it('returns undefined when settings or tailwindcss is missing', () => {
    expect(entryPointFromSettings(undefined)).toBeUndefined()
    expect(entryPointFromSettings({})).toBeUndefined()
    expect(entryPointFromSettings({ tailwindcss: {} })).toBeUndefined()
  })

  it('returns the string form unchanged', () => {
    expect(entryPointFromSettings({ tailwindcss: { entryPoint: 'src/app.css' } })).toBe(
      'src/app.css',
    )
  })

  it('returns an EntryPointMapping[] when given an array of objects', () => {
    const mappings: EntryPointMapping[] = [
      { files: 'packages/ui/**', use: 'packages/ui/src/styles.css' },
      { files: ['packages/admin/**', 'packages/billing/**'], use: 'shared.css' },
    ]
    expect(entryPointFromSettings({ tailwindcss: { entryPoint: mappings } })).toEqual(mappings)
  })

  it('throws DeprecatedEntryPointShapeError for legacy string[]', () => {
    expect(() =>
      entryPointFromSettings({ tailwindcss: { entryPoint: ['a.css', 'b.css'] } }),
    ).toThrow(DeprecatedEntryPointShapeError)
  })

  it('throws when array entries are neither all strings nor valid mappings', () => {
    expect(() =>
      entryPointFromSettings({
        tailwindcss: {
          entryPoint: [{ files: 'foo', not_use: 'bar' }] as unknown as EntryPointMapping[],
        },
      }),
    ).toThrow(MissingEntryPointError)
  })

  it('treats an empty array as undefined (no rule output)', () => {
    expect(entryPointFromSettings({ tailwindcss: { entryPoint: [] } })).toBeUndefined()
  })
})

describe('resolveByGlobMapping', () => {
  const base = resolve('/workspace')

  function abs(...parts: string[]): string {
    return resolve(base, ...parts)
  }

  it('returns the first matching glob, preserving array order', () => {
    const mappings: EntryPointMapping[] = [
      { files: 'packages/ui/**', use: 'packages/ui/styles.css' },
      { files: '**', use: 'src/global.css' },
    ]
    expect(resolveByGlobMapping(mappings, abs('packages/ui/src/Button.tsx'), base)).toBe(
      resolve(base, 'packages/ui/styles.css'),
    )
    expect(resolveByGlobMapping(mappings, abs('apps/web/index.tsx'), base)).toBe(
      resolve(base, 'src/global.css'),
    )
  })

  it('accepts an array of globs per mapping', () => {
    const mappings: EntryPointMapping[] = [
      { files: ['packages/ui/**', 'packages/icons/**'], use: 'shared.css' },
    ]
    expect(resolveByGlobMapping(mappings, abs('packages/ui/Button.tsx'), base)).toBe(
      resolve(base, 'shared.css'),
    )
    expect(resolveByGlobMapping(mappings, abs('packages/icons/Icon.tsx'), base)).toBe(
      resolve(base, 'shared.css'),
    )
    expect(resolveByGlobMapping(mappings, abs('apps/web/Page.tsx'), base)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    const mappings: EntryPointMapping[] = [{ files: 'packages/ui/**', use: 'ui.css' }]
    expect(resolveByGlobMapping(mappings, abs('apps/web/Page.tsx'), base)).toBeNull()
  })

  it('normalizes backslashes for cross-platform consistency', () => {
    // Simulate a Windows-style path under the same base.
    const mappings: EntryPointMapping[] = [{ files: 'packages/ui/**', use: 'ui.css' }]
    // resolve() will normalize separators, so use sep-built path to assert the matcher itself.
    const winLike = `${base}${sep}packages${sep}ui${sep}Button.tsx`
    expect(resolveByGlobMapping(mappings, winLike, base)).toBe(resolve(base, 'ui.css'))
  })
})

describe('resolveEntryPointForFile', () => {
  it('rule option entryPoint wins over everything', () => {
    expect(resolveEntryPointForFile('/explicit.css', 'will-be-ignored.css', '/any/file.tsx')).toBe(
      '/explicit.css',
    )
  })

  it('falls back to the string-form settings entry', () => {
    expect(resolveEntryPointForFile(undefined, 'src/app.css', '/any/file.tsx')).toBe('src/app.css')
  })

  it('resolves through the mapping array when settings is a mapping', () => {
    const mappings: EntryPointMapping[] = [
      { files: 'packages/ui/**', use: 'packages/ui/styles.css' },
      { files: '**', use: 'src/global.css' },
    ]
    const filePath = resolve(process.cwd(), 'packages/ui/src/Button.tsx')
    expect(resolveEntryPointForFile(undefined, mappings, filePath)).toBe(
      resolve(process.cwd(), 'packages/ui/styles.css'),
    )
  })

  it('throws MissingEntryPointError when nothing resolves', () => {
    expect(() => resolveEntryPointForFile(undefined, undefined, '/some/file.tsx')).toThrow(
      MissingEntryPointError,
    )
  })

  it('throws MissingEntryPointError when the mapping does not match the file', () => {
    const mappings: EntryPointMapping[] = [{ files: 'packages/ui/**', use: 'ui.css' }]
    const filePath = resolve(process.cwd(), 'apps/web/Page.tsx')
    expect(() => resolveEntryPointForFile(undefined, mappings, filePath)).toThrow(
      MissingEntryPointError,
    )
  })

  it('throws when a mapping array is provided without a file path', () => {
    const mappings: EntryPointMapping[] = [{ files: '**', use: 'global.css' }]
    expect(() => resolveEntryPointForFile(undefined, mappings, undefined)).toThrow(
      MissingEntryPointError,
    )
  })
})
