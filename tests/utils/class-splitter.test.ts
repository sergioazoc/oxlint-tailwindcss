import { describe, expect, it } from 'vitest'
import { splitClasses } from '../../src/utils/class-splitter'

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
