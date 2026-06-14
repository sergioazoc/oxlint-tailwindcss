import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { resolve, sep } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  entryPointFromSettings,
  resolveByGlobMapping,
  resolveEntryPointForFile,
  resolveStringEntryPoint,
  resetDesignSystem,
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
    // Use a `resolve()`d absolute path so the assertion holds on Windows too
    // (a bare "/explicit.css" is normalized to "<drive>:\explicit.css").
    const explicit = resolve('/explicit.css')
    expect(resolveEntryPointForFile(explicit, 'will-be-ignored.css', '/any/file.tsx')).toBe(
      explicit,
    )
  })

  it('resolves the string-form settings entry to an absolute path (cwd fallback)', () => {
    // No `.oxlintrc.json` enclosing the file and the file does not exist on
    // disk, so the relative entry is anchored to the passed cwd.
    const cwd = resolve('/workspace/pkg')
    expect(resolveEntryPointForFile(undefined, 'src/app.css', '/any/file.tsx', cwd)).toBe(
      resolve(cwd, 'src/app.css'),
    )
  })

  it('threads cwd into mapping resolution', () => {
    const mappings: EntryPointMapping[] = [{ files: 'packages/ui/**', use: 'packages/ui/ui.css' }]
    const cwd = resolve('/elsewhere')
    const filePath = resolve(cwd, 'packages/ui/Button.tsx')
    expect(resolveEntryPointForFile(undefined, mappings, filePath, cwd)).toBe(
      resolve(cwd, 'packages/ui/ui.css'),
    )
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

// Issue #39: a relative `entryPoint` must resolve relative to the config file's
// directory (the nearest enclosing `.oxlintrc.json`), NOT the process CWD —
// otherwise the same per-package config resolves to different CSS depending on
// whether oxlint runs from the package (CLI) or the workspace root (editor).
//
// These tests build a real on-disk monorepo tree because the resolution probes
// the filesystem for both `.oxlintrc.json` markers and the candidate CSS files.
describe('resolveStringEntryPoint — config-relative anchoring (#39)', () => {
  let MONO: string // a Pattern-B monorepo with nested .oxlintrc.json files
  let NOCFG: string // a tree with no oxlint configs at all

  function touch(path: string): void {
    mkdirSync(resolve(path, '..'), { recursive: true })
    writeFileSync(path, '')
  }

  beforeAll(() => {
    MONO = mkdtempSync(resolve(tmpdir(), 'oxtw-mono-'))
    // Root config + a couple of CSS files only present at the root. `shared.css`
    // exists ONLY at the root — used to prove we never silently reach past the
    // nearest config dir into an unrelated ancestor.
    touch(resolve(MONO, '.oxlintrc.json'))
    touch(resolve(MONO, 'root.css'))
    touch(resolve(MONO, 'shared.css'))
    // Mid-level config with no css of its own.
    touch(resolve(MONO, 'packages/.oxlintrc.json'))
    // Leaf package config + its own CSS, plus a `root.css` that shadows the
    // root's to prove the nearest config dir wins.
    touch(resolve(MONO, 'packages/ui/.oxlintrc.json'))
    touch(resolve(MONO, 'packages/ui/styles.css'))
    touch(resolve(MONO, 'packages/ui/root.css'))
    touch(resolve(MONO, 'packages/ui/src/Button.tsx'))

    NOCFG = mkdtempSync(resolve(tmpdir(), 'oxtw-nocfg-'))
    touch(resolve(NOCFG, 'work/cwd-only.css'))
    touch(resolve(NOCFG, 'leaf/File.tsx'))
  })

  afterAll(() => {
    for (const dir of [MONO, NOCFG]) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {}
    }
  })

  beforeEach(() => resetDesignSystem()) // clears the nearest-config-dir cache

  it('returns absolute paths normalized and untouched', () => {
    const abs = resolve(MONO, 'packages/ui/styles.css')
    expect(resolveStringEntryPoint(abs, resolve(MONO, 'packages/ui/src/Button.tsx'), MONO)).toBe(
      abs,
    )
  })

  it('anchors to the nearest config dir regardless of CWD (the bug)', () => {
    const file = resolve(MONO, 'packages/ui/src/Button.tsx')
    const expected = resolve(MONO, 'packages/ui/styles.css')
    // Editor (CWD = workspace root), CLI (CWD = package dir), and an unrelated
    // CWD must ALL resolve to the same package-local CSS.
    expect(resolveStringEntryPoint('./styles.css', file, MONO)).toBe(expected)
    expect(resolveStringEntryPoint('./styles.css', file, resolve(MONO, 'packages/ui'))).toBe(
      expected,
    )
    expect(resolveStringEntryPoint('./styles.css', file, resolve('/some/other/cwd'))).toBe(expected)
  })

  it('prefers the nearest config dir when an ancestor also has the file', () => {
    const file = resolve(MONO, 'packages/ui/src/Button.tsx')
    // Both packages/ui/root.css and <root>/root.css exist — nearest wins.
    expect(resolveStringEntryPoint('./root.css', file, MONO)).toBe(
      resolve(MONO, 'packages/ui/root.css'),
    )
  })

  it('falls back to CWD when the nearest config dir lacks the file', () => {
    const file = resolve(MONO, 'packages/ui/src/Button.tsx')
    // packages/ui has no `shared.css`; CWD (the monorepo root) does. The
    // two-step [nearest config dir → CWD] resolution lands on the root copy.
    expect(resolveStringEntryPoint('./shared.css', file, MONO)).toBe(resolve(MONO, 'shared.css'))
  })

  it('never silently reaches past the nearest config dir into an unrelated ancestor', () => {
    // Determinism / fail-loud guard (review of #39): nearest config dir
    // (packages/ui) lacks `shared.css` AND the CWD lacks it. Even though an
    // ANCESTOR config dir (the monorepo root) has a `shared.css`, resolution
    // must NOT bind to it — it resolves against the nearest config dir so the
    // downstream stat error names the package-local path the user intended.
    const file = resolve(MONO, 'packages/ui/src/Button.tsx')
    const unrelatedCwd = resolve(tmpdir(), 'oxtw-unrelated-cwd-does-not-exist')
    expect(resolveStringEntryPoint('./shared.css', file, unrelatedCwd)).toBe(
      resolve(MONO, 'packages/ui/shared.css'),
    )
  })

  it('falls back to CWD when no enclosing config exists', () => {
    const file = resolve(NOCFG, 'leaf/File.tsx')
    const cwd = resolve(NOCFG, 'work')
    expect(resolveStringEntryPoint('cwd-only.css', file, cwd)).toBe(resolve(cwd, 'cwd-only.css'))
  })

  it('resolves against CWD when no file path is available', () => {
    expect(resolveStringEntryPoint('./root.css', undefined, MONO)).toBe(resolve(MONO, 'root.css'))
  })

  it('resolves against the most-specific base for the error when nothing exists', () => {
    const file = resolve(MONO, 'packages/ui/src/Button.tsx')
    // Nothing matches `missing.css` anywhere — resolve against the nearest
    // config dir so the downstream stat error names the intended location.
    expect(resolveStringEntryPoint('./missing.css', file, MONO)).toBe(
      resolve(MONO, 'packages/ui/missing.css'),
    )
  })
})
