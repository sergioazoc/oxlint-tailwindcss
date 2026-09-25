import { describe, expect, it } from 'vitest'
import { parseRequestTimeout } from '../../src/design-system/ds-worker'

// OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT, as documented on /settings:
// milliseconds; anything else falls back to the 30 s default rather than
// failing the lint or disabling the timeout.
describe('parseRequestTimeout', () => {
  it('reads milliseconds', () => {
    expect(parseRequestTimeout('60000')).toBe(60000)
    expect(parseRequestTimeout(' 45000 ')).toBe(45000)
    expect(parseRequestTimeout('1.5e4')).toBe(15000)
  })

  it('falls back to the default for unset or blank values', () => {
    expect(parseRequestTimeout(undefined)).toBeUndefined()
    expect(parseRequestTimeout('')).toBeUndefined()
    expect(parseRequestTimeout('   ')).toBeUndefined()
  })

  it('never disables the timeout or accepts garbage', () => {
    for (const raw of ['0', '-1', 'abc', '60s', 'Infinity', 'NaN']) {
      expect(parseRequestTimeout(raw), raw).toBeUndefined()
    }
  })
})
