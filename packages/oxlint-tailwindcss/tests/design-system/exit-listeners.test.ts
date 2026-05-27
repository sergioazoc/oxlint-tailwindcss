import { afterEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { resetSortService, sortClassesSync } from '../../src/design-system/sort-service'
import {
  canonicalizeClassesSync,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

// Invariant: neither service registers listeners on `process` during init.
// Doing so once per module load trips Node's default MaxListeners (10) when
// the plugin runs in many oxlint worker threads at once. `worker.unref()`
// already allows the process to exit without an explicit cleanup listener.

describe('design-system services do not register process exit listeners', () => {
  afterEach(() => {
    resetSortService()
    resetCanonicalizeService()
  })

  it('sortClassesSync does not add listeners to process "exit"', () => {
    const before = process.listenerCount('exit')
    sortClassesSync(ENTRY_POINT, ['p-4', 'm-2'])
    sortClassesSync(ENTRY_POINT, ['text-lg', 'font-bold'])
    expect(process.listenerCount('exit')).toBe(before)
  })

  it('canonicalizeClassesSync does not add listeners to process "exit"', () => {
    const before = process.listenerCount('exit')
    canonicalizeClassesSync(ENTRY_POINT, ['p-[16px]'])
    canonicalizeClassesSync(ENTRY_POINT, ['max-w-[400px]'])
    expect(process.listenerCount('exit')).toBe(before)
  })

  it('neither service leaks listeners across a reset + reinit cycle', () => {
    const before = process.listenerCount('exit')
    sortClassesSync(ENTRY_POINT, ['p-4'])
    canonicalizeClassesSync(ENTRY_POINT, ['p-[8px]'])
    resetSortService()
    resetCanonicalizeService()
    sortClassesSync(ENTRY_POINT, ['p-4'])
    canonicalizeClassesSync(ENTRY_POINT, ['p-[8px]'])
    expect(process.listenerCount('exit')).toBe(before)
  })
})
