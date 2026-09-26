/*
 * A text-only component, like shadcn/ui's ContextMenuLabel (new-york-v4): its style is typography
 * and a text color, which any text shares, so it is never compared.
 * Copyright (c) 2023 shadcn — MIT License, https://github.com/shadcn-ui/ui/blob/main/LICENSE.md
 */
import { cn } from 'cn'

export function MenuLabel({ className, ...props }) {
  return (
    <div className={cn('px-2 py-1.5 text-sm font-medium text-foreground', className)} {...props} />
  )
}
