/**
 * Rounds rem/em/px values in class strings to avoid
 * JavaScript floating point issues.
 *
 * Example: "text-lg/[2.4000000000000004rem]" -> "text-lg/[2.4rem]"
 *
 * Regression test for: better-tailwindcss#320
 */
export function roundRemValue(className: string): string {
  return className.replace(/\[(-?\d+\.\d{7,})(rem|em|px|%)\]/g, (_, num, unit) => {
    const rounded = Number.parseFloat(Number.parseFloat(num).toFixed(6))
    return `[${rounded}${unit}]`
  })
}
