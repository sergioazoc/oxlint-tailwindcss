/**
 * Vitest global setup — pre-warms the design system disk cache.
 *
 * Without this, multiple test files running in parallel all attempt cold loads
 * simultaneously (~2.5s each), causing unnecessary contention. By loading once
 * here, all test files hit the disk cache (<20ms).
 */

import { resolve } from 'node:path'
import { loadDesignSystemSync } from '../src/design-system/sync-loader'

const ENTRY_POINT = resolve(__dirname, 'fixtures/default.css')

export function setup() {
  loadDesignSystemSync(ENTRY_POINT)
}
