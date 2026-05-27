import { describe, expect, it } from 'vitest'
import {
  rebuildClassString,
  splitClasses,
  splitClassesWithSeparators,
} from '../../src/utils/class-splitter'

describe('splitClasses', () => {
  it('splits simple classes', () => {
    expect(splitClasses('flex items-center justify-between')).toEqual([
      'flex',
      'items-center',
      'justify-between',
    ])
  })

  it('handles empty string', () => {
    expect(splitClasses('')).toEqual([])
  })

  it('handles whitespace only', () => {
    expect(splitClasses('   ')).toEqual([])
  })

  it('normalizes multiple whitespace', () => {
    expect(splitClasses('  flex   items-center   ')).toEqual(['flex', 'items-center'])
  })

  it('handles tabs and newlines', () => {
    expect(splitClasses('flex\titems-center\njustify-between')).toEqual([
      'flex',
      'items-center',
      'justify-between',
    ])
  })

  it('handles URLs inside brackets', () => {
    expect(splitClasses("bg-[url('https://example.com/img.png')] flex")).toEqual([
      "bg-[url('https://example.com/img.png')]",
      'flex',
    ])
  })

  it('handles nested calc', () => {
    expect(splitClasses('h-[calc(100vh-var(--header-height))] w-full')).toEqual([
      'h-[calc(100vh-var(--header-height))]',
      'w-full',
    ])
  })

  it('handles arbitrary variants with brackets', () => {
    expect(splitClasses('[&>svg]:w-4 [&_p]:mt-2 flex')).toEqual([
      '[&>svg]:w-4',
      '[&_p]:mt-2',
      'flex',
    ])
  })

  it('handles quotes inside brackets', () => {
    expect(splitClasses("content-['hello_world'] flex")).toEqual([
      "content-['hello_world']",
      'flex',
    ])
  })

  it('handles important modifier', () => {
    expect(splitClasses('!font-bold !text-red-500')).toEqual(['!font-bold', '!text-red-500'])
  })

  it('handles negative classes', () => {
    expect(splitClasses('-translate-x-1 -rotate-45')).toEqual(['-translate-x-1', '-rotate-45'])
  })

  it('handles complex variants', () => {
    expect(splitClasses('hover:bg-blue-500 focus:ring-2 dark:hover:bg-blue-700')).toEqual([
      'hover:bg-blue-500',
      'focus:ring-2',
      'dark:hover:bg-blue-700',
    ])
  })

  it('handles brackets with double quotes', () => {
    expect(splitClasses('content-["hello"] flex')).toEqual(['content-["hello"]', 'flex'])
  })

  it('handles nested brackets with calc and operations', () => {
    expect(splitClasses('h-[calc(100%+2rem)] w-[calc(50%-1px)]')).toEqual([
      'h-[calc(100%+2rem)]',
      'w-[calc(50%-1px)]',
    ])
  })

  it('handles a single class', () => {
    expect(splitClasses('flex')).toEqual(['flex'])
  })

  it('handles named groups', () => {
    expect(splitClasses('group/sidebar peer/input flex')).toEqual([
      'group/sidebar',
      'peer/input',
      'flex',
    ])
  })
})

describe('splitClassesWithSeparators', () => {
  it('captures single-space separators', () => {
    const split = splitClassesWithSeparators('flex items-center')
    expect(split.classes).toEqual(['flex', 'items-center'])
    expect(split.separators).toEqual(['', ' ', ''])
  })

  it('captures leading and trailing whitespace', () => {
    const split = splitClassesWithSeparators('  flex items-center  ')
    expect(split.classes).toEqual(['flex', 'items-center'])
    expect(split.separators).toEqual(['  ', ' ', '  '])
  })

  it('captures multiline separators verbatim', () => {
    const split = splitClassesWithSeparators('flex\n   items-center\n   bg-red-500')
    expect(split.classes).toEqual(['flex', 'items-center', 'bg-red-500'])
    expect(split.separators).toEqual(['', '\n   ', '\n   ', ''])
  })

  it('handles bracket-aware splitting', () => {
    const split = splitClassesWithSeparators('bg-[url("a b c")] text-white')
    expect(split.classes).toEqual(['bg-[url("a b c")]', 'text-white'])
    expect(split.separators).toEqual(['', ' ', ''])
  })

  it('returns empty separators slot for empty input', () => {
    const split = splitClassesWithSeparators('')
    expect(split.classes).toEqual([])
    expect(split.separators).toEqual([''])
  })

  it('separators length is always classes.length + 1', () => {
    for (const input of ['flex', 'flex foo', 'a b c', '', '  ', 'a\nb\n c']) {
      const split = splitClassesWithSeparators(input)
      expect(split.separators).toHaveLength(split.classes.length + 1)
    }
  })
})

describe('rebuildClassString', () => {
  it('1-to-1 preserves single-space separators', () => {
    const split = splitClassesWithSeparators('flex items-center')
    expect(rebuildClassString(split, ['block', 'gap-4'])).toBe('block gap-4')
  })

  it('1-to-1 preserves multiline indent', () => {
    const split = splitClassesWithSeparators('text-white bg-red-500\n   focus:ring-2')
    expect(rebuildClassString(split, ['bg-red-500', 'text-white', 'focus:ring-2'])).toBe(
      'bg-red-500 text-white\n   focus:ring-2',
    )
  })

  it('1-to-1 preserves leading and trailing whitespace', () => {
    const split = splitClassesWithSeparators(' flex bar ')
    expect(rebuildClassString(split, ['a', 'b'])).toBe(' a b ')
  })

  it('shorter array degrades to single space when input was single-line', () => {
    const split = splitClassesWithSeparators('a b c')
    expect(rebuildClassString(split, ['a', 'c'])).toBe('a c')
  })

  it('shorter array degrades to multiline join when input had newlines', () => {
    const split = splitClassesWithSeparators('a b\n   c')
    // 3→2: degradation picks the first newline-bearing internal separator
    expect(rebuildClassString(split, ['a', 'c'])).toBe('a\n   c')
  })

  it('longer array pads with single space', () => {
    const split = splitClassesWithSeparators('a b')
    expect(rebuildClassString(split, ['a', 'b', 'c'])).toBe('a b c')
  })
})
