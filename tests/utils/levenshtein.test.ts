import { describe, expect, it } from 'vitest'
import { levenshtein, findBestSuggestion } from '../../src/utils/levenshtein'

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
