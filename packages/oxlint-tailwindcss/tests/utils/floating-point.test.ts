import { describe, expect, it } from 'vitest'
import { roundRemValue } from '../../src/utils/floating-point'

describe('roundRemValue', () => {
  it('rounds rem values with excessive decimals', () => {
    expect(roundRemValue('text-lg/[2.4000000000000004rem]')).toBe('text-lg/[2.4rem]')
  })

  it('rounds em values', () => {
    expect(roundRemValue('text-[1.3500000000000001em]')).toBe('text-[1.35em]')
  })

  it('rounds px values', () => {
    expect(roundRemValue('w-[16.000000000000004px]')).toBe('w-[16px]')
  })

  it('rounds % values', () => {
    expect(roundRemValue('w-[33.333333333333336%]')).toBe('w-[33.333333%]')
  })

  it('does not modify values with few decimals', () => {
    expect(roundRemValue('text-[1.5rem]')).toBe('text-[1.5rem]')
    expect(roundRemValue('w-[2.25rem]')).toBe('w-[2.25rem]')
  })

  it('does not modify strings without numeric values in brackets', () => {
    expect(roundRemValue('flex')).toBe('flex')
    expect(roundRemValue('items-center')).toBe('items-center')
  })

  it('handles negative values', () => {
    expect(roundRemValue('translate-x-[-1.5000000000000002rem]')).toBe('translate-x-[-1.5rem]')
  })

  it('handles multiple values in a string', () => {
    expect(roundRemValue('text-[1.3500000000000001rem] leading-[2.4000000000000004rem]')).toBe(
      'text-[1.35rem] leading-[2.4rem]',
    )
  })
})
