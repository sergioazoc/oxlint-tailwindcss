import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLoadedDesignSystem } from '../../src/design-system/loader'
import { resemblance, signatureOf } from '../../src/utils/style-signature'

const CSS = resolve(__dirname, '../fixtures/shadcn.css')
const { cache } = getLoadedDesignSystem(CSS)
const sig = (classes: string) => signatureOf(classes.split(' '), cache, CSS)

describe('signatureOf', () => {
  it('compares declarations, so two spellings of one style are equal', () => {
    expect(sig('pl-4 pr-4 pt-2 pb-2')).toEqual(sig('px-4 py-2'))
    expect(sig('px-4 py-4')).toEqual(sig('p-4'))
    expect(sig('rounded-t-md rounded-b-md')).toEqual(sig('rounded-md'))
    expect(sig('border-x border-y')).toEqual(sig('border'))
  })

  it('keeps an axis whose sides differ apart', () => {
    expect([...sig('pl-4 pr-2 py-2').keys()].sort()).toEqual([
      'padding-block',
      'padding-left',
      'padding-right',
    ])
  })

  it('leaves out layout, variants and classes with no CSS', () => {
    expect(
      sig('flex w-full items-center gap-2 mt-4 hover:bg-primary md:text-lg not-a-class'),
    ).toEqual(new Map())
  })

  it('tells shadows apart by the shadow they set', () => {
    expect(sig('shadow-xs')).not.toEqual(sig('shadow-sm'))
    expect(sig('shadow-xs').get('box-shadow')).toContain('0 1px 2px 0')
  })

  it('counts a property once even when the class sets its --tw- twin', () => {
    expect(sig('font-medium')).toEqual(new Map([['font-weight', 'var(--font-weight-medium)']]))
  })

  it('resolves arbitrary values the precompute never saw', () => {
    expect(sig('h-[36px]').get('height')).toBe('36px')
  })
})

describe('resemblance', () => {
  const button = sig(
    'rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2',
  )

  it('matches a copy written in another order and spelling', () => {
    const copy = sig(
      'bg-primary text-primary-foreground pl-4 pr-4 py-2 h-9 rounded-md text-sm font-medium',
    )
    expect(resemblance(button, copy)).toMatchObject({
      shared: button.size,
      union: button.size,
      sharedColor: true,
      conflictingColor: false,
    })
  })

  it('flags a color set to something else', () => {
    const muted = sig('rounded-md bg-muted px-4 py-2 text-sm')
    expect(resemblance(button, muted)).toMatchObject({ sharedColor: false, conflictingColor: true })
  })
})
