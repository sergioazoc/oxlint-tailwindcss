/**
 * Version safeguards for the consumer-resolved Tailwind engine.
 *
 * Once the plugin loads the CONSUMER's Tailwind (`resolveTailwindNodeFor`),
 * two version facts matter per entry point:
 *
 * - `E` — the `@tailwindcss/node` version the plugin will actually run.
 * - `B` — the `tailwindcss` version the consumer's build compiles with.
 *
 * `assessEngine` grades `(E, B)` against the plugin's supported range and the
 * drift between the two, returning `ok` / `warn` / `fatal`. `emitEngineVerdict`
 * turns a `fatal` into an `UnsupportedEngineError` (which the fatal-reporter
 * routes to `designSystemUnavailable` with no per-rule `meta` change) and a
 * `warn` into a one-time stderr notice.
 *
 * The comparator is a hand-rolled subset of semver (no `semver` dependency —
 * runtime deps stay `@tailwindcss/node` + `tailwindcss` only). It is total and
 * never throws; unparseable input reads as "unknown".
 */

import { UnsupportedEngineError } from '../utils/fatal'
import { debugLog } from './debug'
import { resolveTailwindNodeFor, TAILWIND_NODE_VERSION } from './tailwind-node'

const WARN_PREFIX = '[oxlint-tailwindcss]'

/** The lowest Tailwind major this plugin supports. */
const SUPPORTED_MAJOR = 4

export interface Semver {
  major: number
  minor: number
  patch: number
  prerelease: string | null
}

/**
 * `4.1.0`, the minimum engine version. The precompute calls
 * `ds.canonicalizeCandidates`, which the design system only exposes from
 * Tailwind 4.1 onward — on 4.0.x it throws `is not a function`, so we fail loud
 * with a clear message before spawning the worker. A `4.1.0-*` prerelease sorts
 * below it.
 */
const MIN_ENGINE: Semver = { major: 4, minor: 1, patch: 0, prerelease: null }

/**
 * Parse a version string into `{ major, minor, patch, prerelease }`, or `null`
 * for anything unparseable (`''`, `'unknown'`, a range like `'^4.3.3'`, a dist
 * tag like `'next'`, non-strings). Total — never throws.
 */
export function parseVersion(v: string | null | undefined): Semver | null {
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (s === '' || s === 'unknown') return null
  if (s[0] === 'v' || s[0] === 'V') s = s.slice(1)
  const plus = s.indexOf('+')
  if (plus !== -1) s = s.slice(0, plus)
  let prerelease: string | null = null
  const dash = s.indexOf('-')
  if (dash !== -1) {
    prerelease = s.slice(dash + 1) || null
    s = s.slice(0, dash)
  }
  const parts = s.split('.')
  const major = Number.parseInt(parts[0], 10)
  if (Number.isNaN(major)) return null
  const minor = Number.parseInt(parts[1] ?? '0', 10)
  const patch = Number.parseInt(parts[2] ?? '0', 10)
  return {
    major,
    minor: Number.isNaN(minor) ? 0 : minor,
    patch: Number.isNaN(patch) ? 0 : patch,
    prerelease,
  }
}

/** Compare by major, minor, patch; at equal core, a release outranks a prerelease. */
export function compareVersions(a: Semver, b: Semver): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === null) return 1
  if (b.prerelease === null) return -1
  return a.prerelease < b.prerelease ? -1 : a.prerelease > b.prerelease ? 1 : 0
}

export function sameMajor(a: Semver, b: Semver): boolean {
  return a.major === b.major
}

export function sameMinor(a: Semver, b: Semver): boolean {
  return a.major === b.major && a.minor === b.minor
}

export type EngineVerdictKind =
  | 'ok'
  | 'engine-version-unknown'
  | 'engine-too-old'
  | 'engine-future-major'
  | 'engine-future-major-allowed'
  | 'engine-newer-minor'
  | 'engine-build-drift-minor'
  | 'engine-build-drift-major'
  | 'engine-build-drift-major-allowed'

export interface EngineVerdict {
  verdict: 'ok' | 'warn' | 'fatal'
  kind: EngineVerdictKind
  message: string
  hint?: string
}

export interface AssessOptions {
  allowUntested: boolean
  bundledVersion: string
}

/**
 * Grade `(E, B)` against the supported range and build drift. First matching
 * row wins (see the decision table in the PR / plan). Pure and total: safe to
 * unit-test with literal version strings.
 */
export function assessEngine(E: string, B: string, opts: AssessOptions): EngineVerdict {
  const pe = parseVersion(E)
  const pb = parseVersion(B)
  const bundled = opts.bundledVersion

  // 1. E unknown → cannot assess; proceed (don't regress unconventional installs).
  if (pe === null) {
    return {
      verdict: 'ok',
      kind: 'engine-version-unknown',
      message:
        'Could not determine the resolved Tailwind engine version; skipping the version guard.',
    }
  }

  // 2 & 3. Older than v4.1 (v3, or a 4.0.x that lacks canonicalizeCandidates) →
  // fatal, always (allow is for the future, not for ancient engines).
  if (pe.major < SUPPORTED_MAJOR || compareVersions(pe, MIN_ENGINE) < 0) {
    return {
      verdict: 'fatal',
      kind: 'engine-too-old',
      message: `oxlint-tailwindcss requires Tailwind CSS v4.1 or newer, but the resolved engine is ${E}.`,
      hint: 'Upgrade tailwindcss / @tailwindcss/node to v4.1+, or pin an older oxlint-tailwindcss.',
    }
  }

  // 4. Future major (v5+): fatal unless opted in.
  if (pe.major > SUPPORTED_MAJOR) {
    if (opts.allowUntested) {
      return {
        verdict: 'warn',
        kind: 'engine-future-major-allowed',
        message: `Running against untested Tailwind engine ${E} (a major newer than the tested ${bundled}) because allowUntestedEngine is set — results may be inaccurate.`,
      }
    }
    return {
      verdict: 'fatal',
      kind: 'engine-future-major',
      message: `The resolved Tailwind engine ${E} is a major version newer than this plugin was built for (tested against ${bundled}); its behavior is unverified.`,
      hint: 'Set settings.tailwindcss.allowUntestedEngine: true to run anyway (results may be inaccurate), or upgrade oxlint-tailwindcss.',
    }
  }

  // From here E is a supported v4 (4.0.0 ≤ E, major 4).

  // 5. Drift across majors — B is non-v4 (legacy v3 build, or a v5 build with a v4 engine resolved/fallen back).
  if (pb !== null && !sameMajor(pe, pb)) {
    if (opts.allowUntested) {
      return {
        verdict: 'warn',
        kind: 'engine-build-drift-major-allowed',
        message: `Linting with Tailwind engine ${E} while your build uses tailwindcss@${B} (a different major) because allowUntestedEngine is set — the plugin enforces different semantics than your build produces.`,
      }
    }
    return {
      verdict: 'fatal',
      kind: 'engine-build-drift-major',
      message: `Linting with Tailwind engine ${E} but your build uses tailwindcss@${B} (a different major); the plugin would enforce different Tailwind semantics than your build produces.`,
      hint: 'Align the versions, or set settings.tailwindcss.allowUntestedEngine: true to override.',
    }
  }

  // 6. Drift within the major (minor differs) → warn, run. Patch-only drift is ok (sameMinor).
  if (pb !== null && !sameMinor(pe, pb)) {
    return {
      verdict: 'warn',
      kind: 'engine-build-drift-minor',
      message: `Linting with Tailwind engine ${E} but your build uses tailwindcss@${B}; lint results may differ from your compiled CSS.`,
      hint: 'Align the versions, or ignore if intentional.',
    }
  }

  // 7. E newer than the tested/bundled ceiling (same major) → warn, run.
  const pBundled = parseVersion(bundled)
  if (pBundled !== null && compareVersions(pe, pBundled) > 0) {
    return {
      verdict: 'warn',
      kind: 'engine-newer-minor',
      message: `The resolved Tailwind engine ${E} is newer than the version this plugin was tested against (${bundled}); newly added utilities may be reported as unknown.`,
      hint: 'Usually safe; upgrade oxlint-tailwindcss if you see false positives.',
    }
  }

  // 8. In range and aligned with the build.
  return { verdict: 'ok', kind: 'ok', message: '' }
}

const warnedEngineKeys = new Set<string>()

export interface EngineContext {
  resolvedPath: string
  E: string
  B: string
}

/**
 * Act on a verdict: `fatal` throws `UnsupportedEngineError` (routed to
 * `designSystemUnavailable`), `warn` emits a one-time stderr notice keyed by
 * `(entryPoint, kind, E, B)`, `ok` is silent. `debugLog` (self-gated) always
 * records the structured detail when debug is on.
 */
export function emitEngineVerdict(v: EngineVerdict, ctx: EngineContext): void {
  if (v.verdict === 'fatal') throw new UnsupportedEngineError(v.message, v.hint)
  if (v.verdict === 'warn') {
    const key = `${ctx.resolvedPath}\0${v.kind}\0${ctx.E}\0${ctx.B}`
    if (!warnedEngineKeys.has(key)) {
      warnedEngineKeys.add(key)
      console.warn(`${WARN_PREFIX} ${v.message}`)
    }
  }
  debugLog(`engine E=${ctx.E} B=${ctx.B} → ${v.kind}`)
}

/** Optional injected engine facts, so the guard is testable without a second Tailwind install. */
export interface EngineOverride {
  E: string
  B: string
  bundledVersion?: string
}

/**
 * Resolve the engine for `resolvedPath` (or use injected facts), assess it, and
 * emit the verdict. Throws `UnsupportedEngineError` on a fatal verdict. Called
 * once per entry point from `getLoadedDesignSystem`, inside its fatal-caching
 * `try`.
 */
export function guardEngine(
  resolvedPath: string,
  allowUntested: boolean,
  override?: EngineOverride,
): void {
  let E: string
  let B: string
  let bundledVersion: string
  if (override) {
    E = override.E
    B = override.B
    bundledVersion = override.bundledVersion ?? TAILWIND_NODE_VERSION
  } else {
    const res = resolveTailwindNodeFor(resolvedPath)
    E = res.nodeVersion
    B = res.buildVersion
    bundledVersion = TAILWIND_NODE_VERSION
  }
  emitEngineVerdict(assessEngine(E, B, { allowUntested, bundledVersion }), { resolvedPath, E, B })
}

/** Read `settings.tailwindcss.allowUntestedEngine` (default `false`). */
export function allowUntestedEngineFromSettings(
  settings?: Readonly<Record<string, unknown>>,
): boolean {
  const tw = settings?.tailwindcss
  if (tw && typeof tw === 'object' && 'allowUntestedEngine' in tw) {
    return (tw as Record<string, unknown>).allowUntestedEngine === true
  }
  return false
}

/** Clear the warn-once memo. For test isolation. */
export function resetEngineGuard(): void {
  warnedEngineKeys.clear()
}
