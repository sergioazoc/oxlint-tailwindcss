/**
 * The recommended rules at their severities: what `oxlint-tailwindcss/config`
 * turns on. A static map, so the config entry never loads the plugin itself;
 * `tests/config/recommended.test.ts` holds it equal to each rule's
 * `meta.docs.recommended`.
 */
export const RECOMMENDED_RULES: Readonly<Record<string, 'error' | 'warn'>> = {
  'tailwindcss/consistent-variant-order': 'warn',
  'tailwindcss/enforce-canonical': 'warn',
  'tailwindcss/enforce-consistent-important-position': 'warn',
  'tailwindcss/enforce-consistent-variable-syntax': 'warn',
  'tailwindcss/enforce-negative-arbitrary-values': 'warn',
  'tailwindcss/enforce-shorthand': 'warn',
  'tailwindcss/enforce-sort-order': 'warn',
  'tailwindcss/no-conflicting-classes': 'error',
  'tailwindcss/no-contradicting-variants': 'warn',
  'tailwindcss/no-dark-without-light': 'warn',
  'tailwindcss/no-deprecated-classes': 'error',
  'tailwindcss/no-duplicate-classes': 'warn',
  'tailwindcss/no-dynamic-classes': 'error',
  'tailwindcss/no-hardcoded-colors': 'warn',
  'tailwindcss/no-unknown-classes': 'error',
  'tailwindcss/no-unnecessary-arbitrary-value': 'warn',
  'tailwindcss/no-unnecessary-whitespace': 'warn',
}
