import { describe, expect, it } from 'vitest'
import { scanComponentStyles } from '../../src/utils/component-scanner'

const byName = (source: string) =>
  Object.fromEntries(scanComponentStyles(source).map((s) => [s.name, s.classes.join(' ')]))

describe('scanComponentStyles', () => {
  it('reads a function component whose root merges literals with cn()', () => {
    const source = `
      function Card({ className, ...props }: React.ComponentProps<"div">) {
        return (
          <div
            data-slot="card"
            className={cn(
              "flex flex-col gap-6 rounded-xl border",
              'bg-card py-6',
              className
            )}
            {...props}
          />
        )
      }
    `
    expect(byName(source)).toEqual({ Card: 'flex flex-col gap-6 rounded-xl border bg-card py-6' })
  })

  it('reads a root className given as a plain string', () => {
    expect(byName(`function Kbd() { return <kbd className="rounded border px-1" /> }`)).toEqual({
      Kbd: 'rounded border px-1',
    })
  })

  it('reads arrow and forwardRef components', () => {
    const source = `
      const Alert = ({ className }) => <div className={cn("rounded-lg border p-4", className)} />
      const Panel = React.forwardRef((props, ref) => (
        <section ref={ref} className={clsx("rounded-md bg-card p-6")} />
      ))
    `
    expect(byName(source)).toEqual({
      Alert: 'rounded-lg border p-4',
      Panel: 'rounded-md bg-card p-6',
    })
  })

  it('takes the first className of each component, its root', () => {
    const source = `
      function Dialog() {
        return <div className="fixed inset-0 bg-black/50"><span className="sr-only">x</span></div>
      }
      function DialogTitle() { return <h2 className="text-lg font-semibold" /> }
    `
    expect(byName(source)).toEqual({
      Dialog: 'fixed inset-0 bg-black/50',
      DialogTitle: 'text-lg font-semibold',
    })
  })

  it('reads cva: the base plus the default of every variant group, one style per variant', () => {
    const source = `
      const buttonVariants = cva(
        "inline-flex rounded-md text-sm",
        {
          variants: {
            variant: {
              default: "bg-primary text-primary-foreground hover:bg-primary/90",
              outline: "border bg-background",
            },
            size: {
              default: "h-9 px-4 py-2",
              sm: "h-8 px-3",
            },
          },
          defaultVariants: { variant: "default", size: "default" },
        }
      )
      function Button({ className, variant, size }) {
        return <button className={cn(buttonVariants({ variant, size, className }))} />
      }
    `
    expect(byName(source)).toEqual({
      Button:
        'inline-flex rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2',
      'Button variant="outline"':
        'inline-flex rounded-md text-sm border bg-background h-9 px-4 py-2',
    })
  })

  it('names a cva after its variables when no component calls it', () => {
    const source = `export const badgeVariants = cva(["inline-flex", "rounded-md"], { variants: {} })`
    expect(byName(source)).toEqual({ Badge: 'inline-flex rounded-md' })
  })

  it('reads tv(): base, variants and defaultVariants in one object', () => {
    const source = `
      const chip = tv({
        base: "rounded-full px-2",
        variants: { color: { primary: "bg-primary", danger: "bg-destructive" } },
        defaultVariants: { color: "primary" },
      })
    `
    expect(byName(source)).toEqual({
      Chip: 'rounded-full px-2 bg-primary',
      'Chip color="danger"': 'rounded-full px-2 bg-destructive',
    })
  })

  it('skips lowercase functions and components with no literal classes', () => {
    const source = `
      function helper() { return <div className="rounded p-2" /> }
      function Slot({ className }) { return <div className={className} /> }
    `
    expect(byName(source)).toEqual({})
  })

  it('ignores template literals with expressions and strings in comments', () => {
    const source = `
      // function Fake() { return <div className="rounded p-2" /> }
      /* className="bg-red-500" */
      function Tag({ tone }) {
        return <span className={cn(\`bg-\${tone}-500\`, "rounded px-2")} />
      }
    `
    expect(byName(source)).toEqual({ Tag: 'rounded px-2' })
  })

  it('survives an apostrophe in JSX text', () => {
    const source = `
      function Empty() { return <p className="text-muted-foreground text-sm">Don't panic</p> }
      function Note() { return <p className="rounded bg-muted p-2" /> }
    `
    expect(byName(source)).toEqual({
      Empty: 'text-muted-foreground text-sm',
      Note: 'rounded bg-muted p-2',
    })
  })
})
