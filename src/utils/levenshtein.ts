/**
 * Calculates the Levenshtein distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Use a single row to optimize memory
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const current = Math.min(
        row[j] + 1, // deletion
        prev + 1, // insertion
        row[j - 1] + cost, // substitution
      )
      row[j - 1] = prev
      prev = current
    }
    row[b.length] = prev
  }

  return row[b.length]
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
    // Optimization: if the length difference already exceeds maxDistance, skip
    if (Math.abs(input.length - candidate.length) > maxDistance) continue

    const dist = levenshtein(input, candidate)
    if (dist < bestDistance) {
      bestDistance = dist
      best = candidate
    }
  }

  return best
}
