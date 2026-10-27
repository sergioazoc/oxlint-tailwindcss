import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLoadedDesignSystem } from '../../src/design-system/loader'
import { closestOnScale, formatOptions, lengthUnit, measure } from '../../src/utils/measure'

const { cache } = getLoadedDesignSystem(resolve(__dirname, '../fixtures/default.css'))
const closest = (bare: string) => formatOptions(closestOnScale(cache, bare, 16))

describe('measure', () => {
  it('reads lengths and keeps unitless numbers apart', () => {
    expect(measure('0.5rem', 16)).toEqual({ px: 8, unitless: false })
    expect(measure('10px', 16)).toEqual({ px: 10, unitless: false })
    expect(measure('10', 16)).toEqual({ px: 10, unitless: true })
    expect(measure('calc(1px+2px)', 16)).toBeNull()
  })

  it('names the unit a length is written in', () => {
    expect(lengthUnit('0.5rem')).toBe('rem')
    expect(lengthUnit('10px')).toBe('px')
    expect(lengthUnit('1.5em')).toBe('em')
    expect(lengthUnit('10')).toBe('')
    expect(lengthUnit('50%')).toBeNull()
  })
})

describe('closestOnScale (default Tailwind theme: --spacing 0.25rem, steps of 0.5)', () => {
  it('an exact step comes alone', () => {
    expect(closest('w-[200px]')).toBe('w-50 (200px)')
  })

  it('an off-step value gets the steps on either side, in its own unit', () => {
    expect(closest('w-[203px]')).toBe('w-50.5 (202px) or w-51 (204px)')
    expect(closest('p-[0.3rem]')).toBe('p-1 (0.25rem) or p-1.5 (0.375rem)')
  })

  it('a negative value gets the negative utility, never the positive one', () => {
    expect(closest('bottom-[-4px]')).toBe('-bottom-1 (-4px)')
    expect(closest('bottom-[-5px]')).toBe('-bottom-1.5 (-6px) or -bottom-1 (-4px)')
    expect(closest('ml-[-0.35rem]')).toBe('-ml-1.5 (-0.375rem) or -ml-1 (-0.25rem)')
    // No negative zero: only the step beyond it.
    expect(closest('ml-[-1px]')).toBe('-ml-0.5 (-2px)')
    // A prefix with no negative form has nothing to offer.
    expect(closestOnScale(cache, 'w-[-4px]', 16)).toEqual([])
  })

  it('theme tokens compete with scale steps: the nearest below and above', () => {
    expect(closest('rounded-[5px]')).toBe('rounded-sm (4px) or rounded-md (6px)')
    expect(closest('max-w-[40rem]')).toBe('max-w-160 (40rem)')
    // A token and a step of the same value: the named token first.
    expect(closest('max-w-[42rem]')).toBe('max-w-2xl (42rem) or max-w-168 (42rem)')
    // A far-away token never crowds out the nearby steps.
    expect(closest('w-[203px]')).not.toContain('w-3xs')
  })

  it('nothing for what is not a length on a known prefix', () => {
    expect(closestOnScale(cache, 'bg-[#ff0000]', 16)).toEqual([])
    expect(closestOnScale(cache, 'z-[10]', 16)).toEqual([])
    expect(closestOnScale(cache, 'w-[calc(100%-2rem)]', 16)).toEqual([])
    expect(closestOnScale(cache, '[color:red]', 16)).toEqual([])
  })
})
