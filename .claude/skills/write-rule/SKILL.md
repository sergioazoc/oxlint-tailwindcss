---
name: write-rule
description: Patterns, conventions, and examples for implementing new oxlint Tailwind CSS rules and their tests. Use when creating, scaffolding, or understanding rule implementation.
argument-hint: '[rule-name]'
---

If a rule name is provided as `$ARGUMENTS`, scaffold the rule file at `src/rules/$ARGUMENTS.ts` and its test at `tests/rules/$ARGUMENTS.test.ts` following the patterns below. Read existing rules for reference.

## Design-system-dependent rule

```ts
export const myRule = defineRule({
  meta: { ... },
  createOnce(context) {
    // entryPoint is the ONE option read at createOnce time (needed to load DS)
    const options = safeOptions<{ entryPoint?: string }>(context)
    const result = getLoadedDesignSystem(options?.entryPoint)
    if (!result) return {}  // Graceful degradation — never crash
    const { cache } = result

    function check(locations: ClassLocation[]) {
      // Read OTHER options lazily here, not at createOnce top level
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

When a rule collects offending classes and builds a fixed string, reuse results from the first pass:

```ts
// Reuse already-computed replacements
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
  context.report({
    ...,
    ...(i === 0 && { fix(fixer) { return fixer.replaceTextRange(loc.range, fixedValue) } }),
  })
}
```

## Testing with RuleTester

Tests live in `tests/rules/<rule-name>.test.ts`. For DS-dependent rules, pre-load the singleton:

```ts
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})
```
