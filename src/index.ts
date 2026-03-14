import { definePlugin } from '@oxlint/plugins'
import { noDuplicateClasses } from './rules/no-duplicate-classes'
import { noUnnecessaryWhitespace } from './rules/no-unnecessary-whitespace'
import { noUnknownClasses } from './rules/no-unknown-classes'
import { noConflictingClasses } from './rules/no-conflicting-classes'
import { noDeprecatedClasses } from './rules/no-deprecated-classes'
import { enforceCanonical } from './rules/enforce-canonical'
import { enforceSortOrder } from './rules/enforce-sort-order'
import { enforceShorthand } from './rules/enforce-shorthand'
import { enforceLogical } from './rules/enforce-logical'
import { maxClassCount } from './rules/max-class-count'
import { noRestrictedClasses } from './rules/no-restricted-classes'
import { noArbitraryValue } from './rules/no-arbitrary-value'
import { enforceConsistentImportantPosition } from './rules/enforce-consistent-important-position'
import { enforceNegativeArbitraryValues } from './rules/enforce-negative-arbitrary-values'
import { enforceConsistentVariableSyntax } from './rules/enforce-consistent-variable-syntax'
import { noDarkWithoutLight } from './rules/no-dark-without-light'
import { noHardcodedColors } from './rules/no-hardcoded-colors'
import { noContradictingVariants } from './rules/no-contradicting-variants'
import { consistentVariantOrder } from './rules/consistent-variant-order'
import { enforceConsistentLineWrapping } from './rules/enforce-consistent-line-wrapping'
import { noUnnecessaryArbitraryValue } from './rules/no-unnecessary-arbitrary-value'

const plugin = definePlugin({
  meta: { name: 'tailwindcss' },
  rules: {
    'no-duplicate-classes': noDuplicateClasses,
    'no-unnecessary-whitespace': noUnnecessaryWhitespace,
    'no-unknown-classes': noUnknownClasses,
    'no-conflicting-classes': noConflictingClasses,
    'no-deprecated-classes': noDeprecatedClasses,
    'enforce-canonical': enforceCanonical,
    'enforce-sort-order': enforceSortOrder,
    'enforce-shorthand': enforceShorthand,
    'enforce-logical': enforceLogical,
    'max-class-count': maxClassCount,
    'no-restricted-classes': noRestrictedClasses,
    'no-arbitrary-value': noArbitraryValue,
    'enforce-consistent-important-position': enforceConsistentImportantPosition,
    'enforce-negative-arbitrary-values': enforceNegativeArbitraryValues,
    'enforce-consistent-variable-syntax': enforceConsistentVariableSyntax,
    'no-dark-without-light': noDarkWithoutLight,
    'no-hardcoded-colors': noHardcodedColors,
    'no-contradicting-variants': noContradictingVariants,
    'consistent-variant-order': consistentVariantOrder,
    'enforce-consistent-line-wrapping': enforceConsistentLineWrapping,
    'no-unnecessary-arbitrary-value': noUnnecessaryArbitraryValue,
  },
})

export default plugin
