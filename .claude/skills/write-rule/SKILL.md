---
name: write-rule
description: Patterns, conventions, and examples for implementing new oxlint Tailwind CSS rules and their tests. Use when creating, scaffolding, or understanding rule implementation.
argument-hint: '[rule-name]'
---

If a rule name is provided as `$ARGUMENTS`, scaffold the rule file at `src/rules/$ARGUMENTS.ts` and its test at `tests/rules/$ARGUMENTS.test.ts` following the patterns below. Read existing rules for reference.

## Design-system-dependent rule

DS loading is **deferred** to the first visitor call via `createLazyLoader(context)`. Never call `getLoadedDesignSystem()` directly in `createOnce()` — `context.settings` and `context.filename` are not available there.

```ts
import { createLazyLoader } from '../design-system/loader'
import { safeOptions } from '../types'

export const myRule = defineRule({
  meta: { ... },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      const ds = getDS()
      if (!ds) return  // Graceful degradation — never crash
      const { cache } = ds
      for (const loc of locations) { /* ... */ }
    }

    return {
      JSXAttribute(node) { check(extractFromJSXAttribute(node, DEFAULT_EXTRACTOR_CONFIG)) },
      CallExpression(node) { check(extractFromCallExpression(node, DEFAULT_EXTRACTOR_CONFIG)) },
      TaggedTemplateExpression(node) { check(extractFromTaggedTemplate(node, DEFAULT_EXTRACTOR_CONFIG)) },
      VariableDeclarator(node) { check(extractFromVariableDeclarator(node, DEFAULT_EXTRACTOR_CONFIG)) },
    }
  },
})
```

## Non-DS rule with options

Use a lazy getter pattern — options are null in `createOnce()`, only available in visitors:

```ts
let _max: number | null = null
function getMax(): number {
  if (_max === null) {
    const options = safeOptions<Options>(context)
    _max = options?.max ?? 20
  }
  return _max
}
```

## Fix pattern: avoid double computation

When a rule collects offending classes and builds a fixed string, reuse results from the first pass. Use `preserveSpaces()` to maintain spacing in template literals and expressions:

```ts
import { preserveSpaces, type ClassLocation } from '../utils/extractors'

const offending: Array<{ cls: string; replacement: string }> = []
for (const cls of classes) {
  const fixed = transform(cls)
  if (fixed) offending.push({ cls, replacement: fixed })
}
if (offending.length === 0) continue

const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
const fixedValue = classes.map((cls) => replacements.get(cls) ?? cls).join(' ')

// Attach fix only to the first report
for (let i = 0; i < offending.length; i++) {
  const { cls, replacement } = offending[i]
  if (i === 0) {
    context.report({
      node: loc.node,
      messageId: '...',
      data: { className: cls, replacement },
      fix(fixer) {
        return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
      },
    })
  } else {
    context.report({
      node: loc.node,
      messageId: '...',
      data: { className: cls, replacement },
    })
  }
}
```

## Testing with RuleTester

Tests live in `tests/rules/<rule-name>.test.ts`.

### DS-dependent rule (simple)

Pre-load the singleton before tests run:

```ts
import { resolve } from 'node:path'
import { beforeAll } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()
ruleTester.run('my-rule', myRule, { valid: [...], invalid: [...] })
```

### Rule with multiple test suites (e.g., static fallback + DS)

Use separate `describe` blocks when testing behavior with and without the design system:

```ts
import { beforeAll, afterAll, describe } from 'vitest'

describe('my-rule (static fallback)', () => {
  beforeAll(() => {
    resetDesignSystem()  // No DS loaded
  })
  const ruleTester = new RuleTester()
  ruleTester.run('my-rule', myRule, { valid: [...], invalid: [...] })
})

describe('my-rule (design system)', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(ENTRY_POINT)
  })
  afterAll(() => {
    resetDesignSystem()  // Clean up for other tests
  })
  const ruleTester = new RuleTester()
  ruleTester.run('my-rule', myRule, { valid: [...], invalid: [...] })
})
```

### Test case format

Each test case must include `filename: 'test.tsx'` for JSX:

```ts
// valid
{ code: '<div className="flex items-center" />', filename: 'test.tsx' }
// invalid with autofix
{ code: '<div className="bad-class" />', filename: 'test.tsx', errors: [{ messageId: 'myError' }], output: '<div className="fixed-class" />' }
```

## Self-maintenance

After finishing the rule implementation and tests, review whether any pattern used in the new rule diverges from what this skill documents. If you find new patterns, conventions, or API changes not covered here, update this SKILL.md to reflect them.
