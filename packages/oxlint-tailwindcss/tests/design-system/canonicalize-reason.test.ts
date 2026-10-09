import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CANONICALIZE_HANDLER,
  canonicalizeClassesSync,
  resetCanonicalizeService,
} from '../../src/design-system/canonicalize-service'

/**
 * Why a canonical rewrite is NOT equivalent (R5). `safe: false` used to be all
 * the rule knew; now the worker also says what differs:
 *
 *   'variant'  — the declarations are the same, only the selector differs,
 *                and stock Tailwind says the two ARE the same: the project
 *                defines the canonical variant differently (shadcn's
 *                `data-disabled:` is `:where([data-disabled="true"]), …`, not
 *                `[data-disabled]`), so the two select different elements;
 *   'selector' — only the selector differs, but stock Tailwind emits different
 *                selectors too (`has-[[data-slot=x]]:` vs `has-data-[slot=x]:`):
 *                a spelling difference, nothing the project defined;
 *   'value'   — the declarations differ (`p-[2px]` → `p-0.5` reads
 *               `--spacing`, which the theme can change: #78);
 *   'variable' — the same CSS plus mirror `--tw-*` declarations other
 *               utilities read (`font-(--x)` also sets `--tw-font-weight`,
 *               which a `text-*` size reads: #217).
 */
const SHADCN_VARIANTS = resolve(__dirname, '../fixtures/with-shadcn-variants.css')
const DEFAULT = resolve(__dirname, '../fixtures/default.css')

describe('canonicalize: why a rewrite is not equivalent', () => {
  beforeEach(() => resetCanonicalizeService())

  it('a project-defined variant: same declarations, different selector', () => {
    const [disabled, open] = canonicalizeClassesSync(SHADCN_VARIANTS, [
      'data-[disabled]:opacity-50',
      'data-[open]:flex',
    ])
    expect(disabled).toEqual({
      canonical: 'data-disabled:opacity-50',
      safe: false,
      reason: 'variant',
    })
    expect(open).toEqual({ canonical: 'data-open:flex', safe: false, reason: 'variant' })
  })

  it('a selector that differs in stock Tailwind too is not a project variant', () => {
    // shadcn apps/v4, verbatim.
    const [r] = canonicalizeClassesSync(SHADCN_VARIANTS, [
      'has-[[data-slot=rtl-components]]:bg-transparent',
    ])
    expect(r).toEqual({
      canonical: 'has-data-[slot=rtl-components]:bg-transparent',
      safe: false,
      reason: 'selector',
    })
  })

  it('a value that reads the theme: different declarations', () => {
    // With a root font size (the rule always passes one), p-[2px] → p-0.5.
    expect(canonicalizeClassesSync(DEFAULT, ['p-[2px]'], 16)[0]).toMatchObject({
      safe: false,
      reason: 'value',
    })
  })

  it('an equivalent rewrite carries no reason', () => {
    // Stock Tailwind: data-[disabled]: and data-disabled: are the same selector.
    expect(canonicalizeClassesSync(DEFAULT, ['data-[disabled]:opacity-50'])[0]).toEqual({
      canonical: 'data-disabled:opacity-50',
      safe: true,
    })
  })

  it('a canonical form that only adds the --tw-* variables other utilities read', () => {
    const results = canonicalizeClassesSync(DEFAULT, [
      '[font-weight:var(--x)]',
      '[border-style:dashed]',
      '[transition-duration:300ms]',
      '[line-height:var(--x)]',
      '![font-weight:var(--x)]',
    ])
    expect(results).toEqual([
      {
        canonical: 'font-(--x)',
        safe: false,
        reason: 'variable',
        variables: ['--tw-font-weight'],
      },
      {
        canonical: 'border-dashed',
        safe: false,
        reason: 'variable',
        variables: ['--tw-border-style'],
      },
      {
        canonical: 'duration-300',
        safe: false,
        reason: 'variable',
        variables: ['--tw-duration'],
      },
      {
        canonical: 'leading-(--x)',
        safe: false,
        reason: 'variable',
        variables: ['--tw-leading'],
      },
      {
        canonical: 'font-(--x)!',
        safe: false,
        reason: 'variable',
        variables: ['--tw-font-weight'],
      },
    ])
  })

  it('a different value is still a value, mirror or not', () => {
    // font-bold reads var(--font-weight-bold), not 700.
    expect(canonicalizeClassesSync(DEFAULT, ['[font-weight:700]'])[0]).toMatchObject({
      safe: false,
      reason: 'value',
    })
  })

  it('a project variant that also adds a mirror is still a variant', () => {
    const [r] = canonicalizeClassesSync(SHADCN_VARIANTS, ['data-[disabled]:[font-weight:var(--x)]'])
    expect(r).toEqual({ canonical: 'data-disabled:font-(--x)', safe: false, reason: 'variant' })
  })
})

/**
 * The mirror test itself, on the exact handler string that ships, against a
 * fake design system: every shape here is CSS the real one never prints for
 * these classes, so only a stub can pin it.
 */
describe('canonicalize: what counts as a mirror', () => {
  type Result = { canonical: string; safe: boolean; reason?: string; variables?: string[] }
  const handler = new Function(`return (${CANONICALIZE_HANDLER})`)() as (
    ds: unknown,
    req: unknown,
    env: unknown,
  ) => Promise<Result[]>

  /** `[w]` canonicalizes to `c`; each prints the CSS given. */
  async function classify(written: string, canonical: string): Promise<Result> {
    const css: Record<string, string> = { '[w]': written, c: canonical }
    const ds = {
      canonicalizeCandidates: () => ['c'],
      candidatesToCss: ([cls]: string[]) => [css[cls] ?? null],
    }
    const env = { loadStock: () => Promise.resolve(ds) }
    return (await handler(ds, { classes: ['[w]'] }, env))[0]
  }

  const rule = (name: string, ...decls: string[]) =>
    `.${name} {\n${decls.map((d) => `  ${d};`).join('\n')}\n}\n`
  const property = (name: string) => `@property ${name} {\n  syntax: "*";\n  inherits: false;\n}\n`

  it('a --tw-* declaration repeating a sibling value, and its @property', async () => {
    const r = await classify(
      rule('\\[w\\]', 'font-weight: var(--x)'),
      rule('c', '--tw-font-weight: var(--x)', 'font-weight: var(--x)') +
        property('--tw-font-weight'),
    )
    expect(r).toEqual({
      canonical: 'c',
      safe: false,
      reason: 'variable',
      variables: ['--tw-font-weight'],
    })
  })

  it('not with a different !important', async () => {
    const r = await classify(
      rule('\\[w\\]', 'font-weight: var(--x)'),
      rule('c', '--tw-font-weight: var(--x)', 'font-weight: var(--x) !important'),
    )
    expect(r.reason).toBe('value')
  })

  it('not with a different value', async () => {
    const r = await classify(
      rule('\\[w\\]', 'font-weight: var(--x)'),
      rule('c', '--tw-font-weight: var(--y)', 'font-weight: var(--x)'),
    )
    expect(r.reason).toBe('value')
  })

  it('not when the real property reads the variable instead of repeating it', async () => {
    // content-[';'] prints `--tw-content: ';'` and `content: var(--tw-content)`.
    const r = await classify(
      rule('\\[w\\]', "content: ';'"),
      rule('c', "--tw-content: ';'", 'content: var(--tw-content)'),
    )
    expect(r.reason).toBe('value')
  })

  it('a value holding a ";" stays whole', async () => {
    const r = await classify(
      rule('\\[w\\]', "content: ';'"),
      rule('c', "--tw-content: ';'", "content: ';'"),
    )
    expect(r).toMatchObject({ reason: 'variable', variables: ['--tw-content'] })
  })

  it('not when only an @property differs', async () => {
    const r = await classify(
      rule('\\[w\\]', 'font-weight: var(--x)'),
      rule('c', 'font-weight: var(--x)') + property('--tw-font-weight'),
    )
    expect(r.reason).toBe('value')
  })

  it('not when the canonical form drops a mirror the written one had', async () => {
    // Without their mirrors the two are the same CSS, but the written form's
    // --tw-leading is gone from the canonical one.
    const r = await classify(
      rule('\\[w\\]', '--tw-leading: 1', 'line-height: 1', 'font-weight: var(--x)'),
      rule('c', 'line-height: 1', '--tw-font-weight: var(--x)', 'font-weight: var(--x)'),
    )
    expect(r.reason).toBe('value')
  })
})
