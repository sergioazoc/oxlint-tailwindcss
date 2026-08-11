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

describe('rebuildClassString with sourceIndices (structure-preserving)', () => {
  // no-duplicate: remove a MID-line dup — each line keeps its grouping.
  it('dedup preserves per-line grouping in a block', () => {
    const split = splitClassesWithSeparators('\n  flex flex items-center\n  bg-white p-4\n')
    // unique = [flex, items-center, bg-white, p-4]; first-occurrence indices.
    expect(
      rebuildClassString(split, ['flex', 'items-center', 'bg-white', 'p-4'], [0, 2, 3, 4]),
    ).toBe('\n  flex items-center\n  bg-white p-4\n')
  })

  // no-duplicate: removing the class that OPENED a line transfers the `\n` to
  // the next survivor, so it keeps its own line instead of joining the previous.
  it('dedup transfers the newline when a line-leading class is removed', () => {
    const split = splitClassesWithSeparators('\n  flex items-center\n  flex bg-white\n')
    // unique = [flex, items-center, bg-white]; first-occurrence indices.
    expect(rebuildClassString(split, ['flex', 'items-center', 'bg-white'], [0, 1, 3])).toBe(
      '\n  flex items-center\n  bg-white\n',
    )
  })

  // shorthand: the merged replacement is appended (non-monotonic index). It must
  // never inherit the empty leader — a single space keeps classes from gluing.
  it('appended replacement never glues to the previous class (single line)', () => {
    const split = splitClassesWithSeparators('flex mt-2 mb-2 items-center')
    // remaining = [flex, items-center] then push my-2 (firstMatchedIdx = 1).
    expect(rebuildClassString(split, ['flex', 'items-center', 'my-2'], [0, 3, 1])).toBe(
      'flex items-center my-2',
    )
  })

  // shorthand: when the merged pair opened a block line, the appended
  // replacement inherits that newline+indent and lands on its own line.
  it('appended replacement inherits the block newline when the pair opened a line', () => {
    const split = splitClassesWithSeparators('\n  mt-2 mb-2\n  flex\n')
    // remaining = [flex] then push my-2 (firstMatchedIdx = 0).
    expect(rebuildClassString(split, ['flex', 'my-2'], [2, 0])).toBe('\n  flex\n  my-2\n')
  })

  // shorthand on a hanging first line (no leading newline): the appended
  // replacement gets a space, not the empty leader.
  it('appended replacement on a hanging first line gets a space', () => {
    const split = splitClassesWithSeparators('pl-2 pr-2\n   text-white')
    // remaining = [text-white] then push px-2 (firstMatchedIdx = 0).
    expect(rebuildClassString(split, ['text-white', 'px-2'], [2, 0])).toBe('text-white px-2')
  })
})
