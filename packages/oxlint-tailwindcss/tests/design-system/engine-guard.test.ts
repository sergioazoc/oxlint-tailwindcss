import { describe, it, expect } from 'vitest'
import {
  allowUntestedEngineFromSettings,
  assessEngine,
  compareVersions,
  parseVersion,
  sameMajor,
  sameMinor,
  type Semver,
} from '../../src/design-system/engine-guard'

// The whole guard is pure and testable with literal versions — the suite runs
// against a single installed Tailwind, so the fail-loud / warn behavior for
// older, newer, and drifting engines can only be exercised this way.

const pv = (s: string): Semver => {
  const v = parseVersion(s)
  if (v === null) throw new Error(`expected ${s} to parse`)
  return v
}

describe('parseVersion', () => {
  it('parses plain semver', () => {
    expect(parseVersion('4.3.3')).toEqual({ major: 4, minor: 3, patch: 3, prerelease: null })
  })

  it('strips a leading v', () => {
    expect(parseVersion('v4.3.3')).toEqual({ major: 4, minor: 3, patch: 3, prerelease: null })
  })

  it('splits off a prerelease at the first dash', () => {
    expect(parseVersion('4.4.0-beta.2')).toEqual({
      major: 4,
      minor: 4,
      patch: 0,
      prerelease: 'beta.2',
    })
  })

  it('drops build metadata after +', () => {
    expect(parseVersion('4.3.3+build.9')).toEqual({
      major: 4,
      minor: 3,
      patch: 3,
      prerelease: null,
    })
  })

  it('defaults missing minor/patch to 0', () => {
    expect(parseVersion('4')).toEqual({ major: 4, minor: 0, patch: 0, prerelease: null })
    expect(parseVersion('4.2')).toEqual({ major: 4, minor: 2, patch: 0, prerelease: null })
  })

  it('returns null for unparseable / unknown input', () => {
    for (const bad of ['', 'unknown', '^4.3.3', '~4.3', 'next', 'latest']) {
      expect(parseVersion(bad), bad).toBeNull()
    }
    expect(parseVersion(null)).toBeNull()
    expect(parseVersion(undefined)).toBeNull()
    // non-string
    expect(parseVersion(123 as unknown as string)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions(pv('4.3.3'), pv('4.3.3'))).toBe(0)
    expect(compareVersions(pv('4.3.3'), pv('4.3.9'))).toBe(-1)
    expect(compareVersions(pv('4.3.9'), pv('4.3.3'))).toBe(1)
    expect(compareVersions(pv('5.0.0'), pv('4.9.9'))).toBe(1)
    expect(compareVersions(pv('4.4.0'), pv('4.3.99'))).toBe(1)
  })

  it('ranks a release above a prerelease at equal core', () => {
    expect(compareVersions(pv('4.3.3'), pv('4.3.3-beta.1'))).toBe(1)
    expect(compareVersions(pv('4.3.3-beta.1'), pv('4.3.3'))).toBe(-1)
    expect(compareVersions(pv('4.0.0-beta.1'), pv('4.0.0-beta.1'))).toBe(0)
  })
})

describe('sameMajor / sameMinor', () => {
  it('sameMajor compares only the major', () => {
    expect(sameMajor(pv('4.3.3'), pv('4.9.9'))).toBe(true)
    expect(sameMajor(pv('4.3.3'), pv('3.4.0'))).toBe(false)
    expect(sameMajor(pv('4.3.3'), pv('5.0.0'))).toBe(false)
  })

  it('sameMinor is true for patch-only differences', () => {
    expect(sameMinor(pv('4.3.3'), pv('4.3.9'))).toBe(true)
    expect(sameMinor(pv('4.3.3'), pv('4.4.0'))).toBe(false)
    expect(sameMinor(pv('4.3.3'), pv('5.3.3'))).toBe(false)
  })
})

describe('assessEngine — decision table (bundled = 4.3.3 unless noted)', () => {
  const B33 = { allowUntested: false, bundledVersion: '4.3.3' }
  const A33 = { allowUntested: true, bundledVersion: '4.3.3' }

  type Case = {
    name: string
    E: string
    B: string
    opts: { allowUntested: boolean; bundledVersion: string }
    verdict: 'ok' | 'warn' | 'fatal'
    kind: string
  }

  const cases: Case[] = [
    // Row 1 — E unknown short-circuits.
    {
      name: 'E unknown',
      E: 'unknown',
      B: '4.3.3',
      opts: B33,
      verdict: 'ok',
      kind: 'engine-version-unknown',
    },
    {
      name: 'E unknown, allow on',
      E: 'unknown',
      B: '4.3.3',
      opts: A33,
      verdict: 'ok',
      kind: 'engine-version-unknown',
    },
    // Rows 2/3 — too old (allow is ignored).
    {
      name: 'v3 engine',
      E: '3.4.17',
      B: '3.4.17',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-too-old',
    },
    {
      name: 'v3 engine, allow on stays fatal',
      E: '3.4.17',
      B: '3.4.17',
      opts: A33,
      verdict: 'fatal',
      kind: 'engine-too-old',
    },
    {
      name: 'v2 engine',
      E: '2.0.0',
      B: '2.0.0',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-too-old',
    },
    {
      name: '4.0.0 prerelease is below the floor',
      E: '4.0.0-beta.1',
      B: '4.0.0-beta.1',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-too-old',
    },
    {
      // 4.0.x lacks ds.canonicalizeCandidates (added in 4.1) — fail loud before the precompute.
      name: 'released 4.0.x is below the floor',
      E: '4.0.9',
      B: '4.0.9',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-too-old',
    },
    {
      name: 'a 4.1.0 prerelease is below the floor',
      E: '4.1.0-beta.1',
      B: '4.1.0-beta.1',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-too-old',
    },
    // Row 4 — future major.
    {
      name: 'v5 blocks by default',
      E: '5.0.0',
      B: '5.0.0',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-future-major',
    },
    {
      name: 'v5 allowed runs with a warn',
      E: '5.0.0',
      B: '5.0.0',
      opts: A33,
      verdict: 'warn',
      kind: 'engine-future-major-allowed',
    },
    {
      name: 'v5 prerelease blocks',
      E: '5.1.0-alpha.1',
      B: '5.1.0-alpha.1',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-future-major',
    },
    {
      name: 'future major dominates a major drift',
      E: '5.0.0',
      B: '3.0.0',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-future-major',
    },
    // Row 5 — build drift across majors.
    {
      name: 'engine v4, build v3 → drift-major',
      E: '4.3.3',
      B: '3.4.0',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-build-drift-major',
    },
    {
      name: 'drift-major allowed → warn',
      E: '4.3.3',
      B: '3.4.0',
      opts: A33,
      verdict: 'warn',
      kind: 'engine-build-drift-major-allowed',
    },
    {
      name: 'engine v4, build v5 → drift-major',
      E: '4.3.3',
      B: '5.0.0',
      opts: B33,
      verdict: 'fatal',
      kind: 'engine-build-drift-major',
    },
    // Row 6 — build drift within the major.
    {
      name: 'minor drift → warn',
      E: '4.3.3',
      B: '4.5.0',
      opts: B33,
      verdict: 'warn',
      kind: 'engine-build-drift-minor',
    },
    {
      name: 'drift-minor dominates newer-minor',
      E: '4.5.0',
      B: '4.4.0',
      opts: B33,
      verdict: 'warn',
      kind: 'engine-build-drift-minor',
    },
    // Row 7 — E newer than tested.
    {
      name: 'engine newer than bundled',
      E: '4.3.4',
      B: '4.3.4',
      opts: B33,
      verdict: 'warn',
      kind: 'engine-newer-minor',
    },
    {
      name: 'much newer minor',
      E: '4.5.0',
      B: '4.5.0',
      opts: B33,
      verdict: 'warn',
      kind: 'engine-newer-minor',
    },
    {
      name: 'newer prerelease within v4 warns, not fatal',
      E: '4.4.0-beta.2',
      B: '4.4.0-beta.2',
      opts: B33,
      verdict: 'warn',
      kind: 'engine-newer-minor',
    },
    {
      name: 'B unknown skips drift but newer still warns',
      E: '4.4.0',
      B: 'unknown',
      opts: B33,
      verdict: 'warn',
      kind: 'engine-newer-minor',
    },
    // Row 8 — ok.
    { name: 'exactly bundled', E: '4.3.3', B: '4.3.3', opts: B33, verdict: 'ok', kind: 'ok' },
    { name: 'floor version', E: '4.1.0', B: '4.1.0', opts: B33, verdict: 'ok', kind: 'ok' },
    {
      name: 'older-but-supported is silent',
      E: '4.2.0',
      B: '4.2.0',
      opts: B33,
      verdict: 'ok',
      kind: 'ok',
    },
    {
      name: 'patch drift within minor, at/below bundled',
      E: '4.3.1',
      B: '4.3.9',
      opts: B33,
      verdict: 'ok',
      kind: 'ok',
    },
    {
      name: 'B unknown, E at bundled',
      E: '4.3.3',
      B: 'unknown',
      opts: B33,
      verdict: 'ok',
      kind: 'ok',
    },
  ]

  for (const c of cases) {
    it(`${c.name} → ${c.verdict}/${c.kind}`, () => {
      const r = assessEngine(c.E, c.B, c.opts)
      expect(r.verdict).toBe(c.verdict)
      expect(r.kind).toBe(c.kind)
    })
  }

  it('names the literal versions in fatal/warn messages', () => {
    const fut = assessEngine('5.0.0', '5.0.0', B33)
    expect(fut.message).toContain('5.0.0')
    expect(fut.message).toContain('4.3.3')
    expect(fut.hint).toContain('allowUntestedEngine')

    const drift = assessEngine('4.3.3', '4.5.0', B33)
    expect(drift.message).toContain('4.3.3')
    expect(drift.message).toContain('4.5.0')

    const old = assessEngine('3.4.17', '3.4.17', B33)
    expect(old.message).toContain('3.4.17')
    expect(old.message).toContain('v4.1') // names the supported floor

    const tooOld40 = assessEngine('4.0.9', '4.0.9', B33)
    expect(tooOld40.verdict).toBe('fatal')
    expect(tooOld40.message).toContain('4.0.9')

    const driftMajor = assessEngine('4.3.3', '3.4.0', B33)
    expect(driftMajor.hint).toContain('allowUntestedEngine')
  })

  it('is silent (empty message) only for the ok verdict', () => {
    expect(assessEngine('4.3.3', '4.3.3', B33).message).toBe('')
  })
})

describe('allowUntestedEngineFromSettings', () => {
  it('is true only for the boolean literal true', () => {
    expect(allowUntestedEngineFromSettings({ tailwindcss: { allowUntestedEngine: true } })).toBe(
      true,
    )
  })

  it('is false for everything else', () => {
    expect(allowUntestedEngineFromSettings({ tailwindcss: { allowUntestedEngine: false } })).toBe(
      false,
    )
    expect(allowUntestedEngineFromSettings({ tailwindcss: { allowUntestedEngine: 'true' } })).toBe(
      false,
    )
    expect(allowUntestedEngineFromSettings({ tailwindcss: { allowUntestedEngine: 1 } })).toBe(false)
    expect(allowUntestedEngineFromSettings({ tailwindcss: {} })).toBe(false)
    expect(allowUntestedEngineFromSettings({})).toBe(false)
    expect(allowUntestedEngineFromSettings(undefined)).toBe(false)
  })
})
