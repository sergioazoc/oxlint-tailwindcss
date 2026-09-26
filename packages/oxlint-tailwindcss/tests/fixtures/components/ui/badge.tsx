/*
 * shadcn/ui's Badge (new-york-v4), trimmed.
 * Copyright (c) 2023 shadcn — MIT License, https://github.com/shadcn-ui/ui/blob/main/LICENSE.md
 */
import { cva } from 'class-variance-authority'
import { cn } from 'cn'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
