import { describe, expect, it } from 'vitest'
import { levenshtein, findBestSuggestion, suggestionDistance } from '../../src/utils/levenshtein'

describe('levenshtein', () => {
  it('distance 0 for equal strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0)
  })

  it('distance equals length for empty string', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })

  it('distance 1 for a single change', () => {
    expect(levenshtein('abc', 'ab')).toBe(1)
    expect(levenshtein('abc', 'abcd')).toBe(1)
    expect(levenshtein('abc', 'adc')).toBe(1)
  })

  it('correct distance for common Tailwind typos', () => {
    expect(levenshtein('itms-center', 'items-center')).toBe(1)
    expect(levenshtein('bg-blu-500', 'bg-blue-500')).toBe(1)
    expect(levenshtein('fex', 'flex')).toBe(1)
    expect(levenshtein('justfy-between', 'justify-between')).toBe(1)
  })

  it('counts a swap of two adjacent characters as one edit', () => {
    // The commonest typo there is. Plain Levenshtein charges 2, which the
    // proportional budget of a short class can't afford.
    expect(levenshtein('opne', 'open')).toBe(1)
    expect(levenshtein('flxe', 'flex')).toBe(1)
    expect(levenshtein('ab', 'ba')).toBe(1)
    // Only ADJACENT swaps: this is still two substitutions.
    expect(levenshtein('abc', 'cba')).toBe(2)
    // A transposed pair is never edited again (optimal string alignment).
    expect(levenshtein('ca', 'abc')).toBe(3)
  })
})

/** Textbook full-matrix OSA, the reference the fast version must agree with. */
function referenceOsa(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

describe('levenshtein with a bound', () => {
  const words = [
    '',
    'a',
    'ab',
    'ba',
    'fex',
    'flex',
    'flxe',
    'line',
    'inline',
    'opne',
    'open',
    'w-[]',
    'w-0',
    'itms-center',
    'items-center',
    'bg-primray',
    'bg-primary',
    'md:grids-col-2',
    'md:grid-cols-2',
    'text-muted-foregound',
    'text-muted-foreground',
    'ca',
    'abc',
    'cba',
  ]

  it('matches the full-matrix reference on every pair and every bound', () => {
    for (const a of words) {
      for (const b of words) {
        const exact = referenceOsa(a, b)
        expect(levenshtein(a, b), `${a} / ${b}`).toBe(exact)
        for (let max = 0; max <= 4; max++) {
          // Within the bound: exact. Past it: anything greater than the bound.
          const got = levenshtein(a, b, max)
          if (exact <= max) expect(got, `${a} / ${b} ≤ ${max}`).toBe(exact)
          else expect(got, `${a} / ${b} ≤ ${max}`).toBeGreaterThan(max)
        }
      }
    }
  })

  it('handles strings longer than any seen before (buffer growth)', () => {
    const long = 'x'.repeat(300)
    expect(levenshtein(long, `${long}y`)).toBe(1)
    expect(levenshtein('ab', 'ba')).toBe(1)
  })
})

describe('findBestSuggestion', () => {
  const candidates = [
    'flex',
    'items-center',
    'justify-between',
    'bg-blue-500',
    'text-red-500',
    'p-4',
    'm-2',
  ]

  it('finds suggestion for a close typo', () => {
    expect(findBestSuggestion('fex', candidates)).toBe('flex')
    expect(findBestSuggestion('itms-center', candidates)).toBe('items-center')
    expect(findBestSuggestion('bg-blu-500', candidates)).toBe('bg-blue-500')
  })

  it('returns null if there is no close match', () => {
    expect(findBestSuggestion('completely-different', candidates)).toBe(null)
  })

  it('respects maxDistance', () => {
    expect(findBestSuggestion('fex', candidates, 1)).toBe('flex')
    expect(findBestSuggestion('fxxx', candidates, 1)).toBe(null)
  })

  it('returns the best among multiple options', () => {
    expect(findBestSuggestion('p-3', ['p-4', 'p-2', 'm-3'])).toBe('p-4') // o p-2, ambos dist 1
  })
})

describe('suggestionDistance — the proportional typo budget', () => {
  it('pins the boundaries', () => {
    expect(suggestionDistance('fex')).toBe(1) // len 3
    expect(suggestionDistance('line')).toBe(1) // len 4: `inline` (d=2) is out
    expect(suggestionDistance('w-[]')).toBe(1)
    expect(suggestionDistance('flexx')).toBe(1)
    expect(suggestionDistance('items-t')).toBe(2) // len 7
    expect(suggestionDistance('bg-primray')).toBe(3) // len 10
    expect(suggestionDistance('text-muted-foregound')).toBe(3) // capped
  })

  it('keeps real typos and drops marker look-alikes', () => {
    const candidates = ['flex', 'inline', 'items-center', 'bg-primary', 'w-0', 'grid-cols-2']
    const suggest = (s: string) => findBestSuggestion(s, candidates, suggestionDistance(s))
    expect(suggest('fex')).toBe('flex')
    expect(suggest('itms-center')).toBe('items-center')
    expect(suggest('bg-primray')).toBe('bg-primary')
    expect(suggest('grids-col-2')).toBe('grid-cols-2')
    expect(suggest('flxe')).toBe('flex')
    expect(suggest('line')).toBe(null)
    expect(suggest('w-[]')).toBe(null)
  })
})
