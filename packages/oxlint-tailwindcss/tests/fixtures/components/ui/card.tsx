/*
 * shadcn/ui's Card (new-york-v4), trimmed.
 * Copyright (c) 2023 shadcn — MIT License, https://github.com/shadcn-ui/ui/blob/main/LICENSE.md
 */
import { cn } from 'cn'

export function Card({ className, ...props }) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }) {
  return <div className={cn('leading-none font-semibold', className)} {...props} />
}
