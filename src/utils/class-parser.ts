/**
 * Parses a Tailwind class into its constituent parts:
 * variants, important modifier, negative prefix, utility name, and arbitrary value.
 *
 * Handles bracket-aware variant extraction (e.g., `[&>svg]:hover:w-4`).
 */

export interface ParsedClass {
  /** Individual variant segments, e.g. ['hover', 'sm'] */
  variants: string[]
  /** Full variant prefix including colons, e.g. 'hover:sm:' */
  variantPrefix: string
  /** Whether the class has an important modifier (! prefix or suffix) */
  important: boolean
  /** Position of important modifier, if present */
  importantPosition: 'prefix' | 'suffix' | null
  /** Whether the class has a negative prefix */
  negative: boolean
  /** The utility name without variants, important, or negative */
  utility: string
  /** The arbitrary value inside brackets, if present */
  arbitraryValue: string | null
}

/**
 * Extracts variants from a class string, respecting bracket depth.
 * e.g. "[&>svg]:hover:w-4" → ["[&>svg]", "hover"]
 *      "dark:hover:flex" → ["dark", "hover"]
 *      "w-4" → []
 */
export function extractVariants(cls: string): string[] {
  const variants: string[] = []
  let depth = 0
  let segmentStart = 0

  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === '[') depth++
    else if (cls[i] === ']') depth--
    else if (cls[i] === ':' && depth === 0) {
      variants.push(cls.slice(segmentStart, i))
      segmentStart = i + 1
    }
  }

  // The last segment is the utility, not a variant
  if (variants.length === 0) return []
  return variants
}

/**
 * Extracts the utility part from a potentially variant-prefixed class.
 * Bracket-aware: respects arbitrary variants like [&>svg]:w-4.
 *
 * e.g. "hover:bg-blue-500" → "bg-blue-500"
 *      "dark:hover:flex" → "flex"
 *      "[&>svg]:w-4" → "w-4"
 *      "w-4" → "w-4"
 */
export function extractUtility(cls: string): string {
  let depth = 0
  let lastColon = -1
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === '[') depth++
    else if (cls[i] === ']') depth--
    else if (cls[i] === ':' && depth === 0) lastColon = i
  }
  return lastColon >= 0 ? cls.slice(lastColon + 1) : cls
}

/**
 * Gets the variant prefix (everything before the utility).
 * e.g. "hover:sm:flex" → "hover:sm:"
 *      "flex" → ""
 */
export function getVariantPrefix(cls: string): string {
  let depth = 0
  let lastColon = -1
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === '[') depth++
    else if (cls[i] === ']') depth--
    else if (cls[i] === ':' && depth === 0) lastColon = i
  }
  return lastColon >= 0 ? cls.slice(0, lastColon + 1) : ''
}

/**
 * Splits a class into variant prefix and utility in a single pass.
 * More efficient than calling extractUtility() + getVariantPrefix() separately.
 */
export function splitUtilityAndVariant(cls: string): { utility: string; variant: string } {
  let depth = 0
  let lastColon = -1
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === '[') depth++
    else if (cls[i] === ']') depth--
    else if (cls[i] === ':' && depth === 0) lastColon = i
  }
  return {
    utility: lastColon >= 0 ? cls.slice(lastColon + 1) : cls,
    variant: lastColon >= 0 ? cls.slice(0, lastColon + 1) : '',
  }
}

/**
 * Checks if a class has an arbitrary value (bracket syntax in the utility part).
 * Distinguishes from arbitrary variants: [&>svg]:w-4 does NOT have an arbitrary value,
 * but w-[200px] does.
 */
export function hasArbitraryValue(cls: string): boolean {
  const utility = extractUtility(cls)
  return utility.includes('[') && utility.includes(']')
}

/**
 * Gets the arbitrary value from a class, or null if none.
 * e.g. "w-[200px]" → "200px"
 *      "bg-[#ff0000]" → "#ff0000"
 *      "flex" → null
 */
export function getArbitraryValue(cls: string): string | null {
  const utility = extractUtility(cls)
  const openBracket = utility.indexOf('[')
  if (openBracket === -1) return null

  // Find matching close bracket
  let depth = 0
  for (let i = openBracket; i < utility.length; i++) {
    if (utility[i] === '[') depth++
    else if (utility[i] === ']') {
      depth--
      if (depth === 0) {
        return utility.slice(openBracket + 1, i)
      }
    }
  }
  return null
}

/**
 * Fully parses a Tailwind class into its components.
 */
export function parseClass(cls: string): ParsedClass {
  const variants = extractVariants(cls)
  const variantPrefix = variants.length > 0 ? variants.join(':') + ':' : ''
  let utility = extractUtility(cls)

  // Detect important modifier
  let important = false
  let importantPosition: 'prefix' | 'suffix' | null = null

  if (utility.startsWith('!')) {
    important = true
    importantPosition = 'prefix'
    utility = utility.slice(1)
  } else if (utility.endsWith('!')) {
    important = true
    importantPosition = 'suffix'
    utility = utility.slice(0, -1)
  }

  // Detect negative prefix
  let negative = false
  if (utility.startsWith('-')) {
    negative = true
    utility = utility.slice(1)
  }

  // Extract arbitrary value
  const arbitraryValue = getArbitraryValue(cls)

  return {
    variants,
    variantPrefix,
    important,
    importantPosition,
    negative,
    utility,
    arbitraryValue,
  }
}
