/**
 * Shared regex-allowlist helpers used by rules that accept an `allowlist`
 * option of regex source strings (currently enforce-logical / enforce-physical).
 *
 * Invalid regex sources are skipped rather than thrown so a typo in one
 * pattern doesn't blow up the entire lint run.
 */

export function compileRegexList(patterns?: string[]): RegExp[] {
  if (!patterns || patterns.length === 0) return []
  const compiled: RegExp[] = []
  for (const p of patterns) {
    try {
      compiled.push(new RegExp(p))
    } catch {
      // Skip invalid regex sources rather than blowing up the lint.
    }
  }
  return compiled
}

export function matchesAny(value: string, list: readonly RegExp[]): boolean {
  return list.some((re) => re.test(value))
}
