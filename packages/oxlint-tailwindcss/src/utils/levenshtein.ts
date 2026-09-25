// Rolling rows reused across calls: the suggestion scan runs this against every
// known class (~26k) for each unknown one, so allocating per call dominated.
let bufA = new Int32Array(64)
let bufB = new Int32Array(64)
let bufC = new Int32Array(64)

/**
 * Edit distance between two strings: insertions, deletions, substitutions and
 * swaps of two adjacent characters each cost 1 (optimal string alignment, the
 * restricted Damerau–Levenshtein). Counting the swap as one edit matters for
 * typo suggestions: `opne` → `open` is the commonest slip there is, and plain
 * Levenshtein charges it 2.
 *
 * With `max`, gives up as soon as the distance must exceed it and returns some
 * value greater than `max`. Every cell is at most the one above it plus 1, so
 * once a whole row is past `max`, every later row is too.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const n = b.length
  if (bufA.length <= n) {
    const size = (n + 1) * 2
    bufA = new Int32Array(size)
    bufB = new Int32Array(size)
    bufC = new Int32Array(size)
  }

  // Three rolling rows: the transposition looks two rows back.
  let twoBack = bufA
  let prev = bufB
  let row = bufC
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    const ai = a.charCodeAt(i - 1)
    const aPrev = i > 1 ? a.charCodeAt(i - 2) : -1
    row[0] = i
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      const bj = b.charCodeAt(j - 1)
      let current = prev[j - 1] + (ai === bj ? 0 : 1) // substitution
      if (prev[j] + 1 < current) current = prev[j] + 1 // deletion
      if (row[j - 1] + 1 < current) current = row[j - 1] + 1 // insertion
      if (j > 1 && ai === b.charCodeAt(j - 2) && aPrev === bj && twoBack[j - 2] + 1 < current) {
        current = twoBack[j - 2] + 1 // transposition
      }
      row[j] = current
      if (current < rowMin) rowMin = current
    }
    if (rowMin > max) return max + 1
    const recycled = twoBack
    twoBack = prev
    prev = row
    row = recycled
  }

  return prev[n]
}

/**
 * The largest edit distance worth offering as a typo fix for `input`:
 * `max(1, floor(length / 3))`, capped at 3. A flat cap of 3 turned short
 * project markers into confident, wrong quick-fixes — `line` → `inline` (a
 * display change), `w-[]` → `w-0` — while real typos (`fex`, `itms-center`,
 * `bg-primray`, `md:grids-col-2`) sit well inside the proportional budget.
 */
export function suggestionDistance(input: string): number {
  return Math.min(3, Math.max(1, Math.floor(input.length / 3)))
}

/**
 * Finds the best suggestion for a given string within a list of candidates.
 * Returns null if no suggestion is close enough.
 */
export function findBestSuggestion(
  input: string,
  candidates: string[],
  maxDistance = 3,
): string | null {
  let best: string | null = null
  let bestDistance = maxDistance + 1

  for (const candidate of candidates) {
    // The length difference alone is a lower bound on the distance.
    if (Math.abs(input.length - candidate.length) >= bestDistance) continue

    // Only a strictly closer candidate can replace the current best.
    const dist = levenshtein(input, candidate, bestDistance - 1)
    if (dist < bestDistance) {
      bestDistance = dist
      best = candidate
      if (dist === 0) break
    }
  }

  return best
}
