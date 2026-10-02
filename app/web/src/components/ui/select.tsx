import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children, ...props }: SelectPrimitive.SelectTriggerProps) {
  return <SelectPrimitive.Trigger className={cn('flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate', className)} {...props}>{children}<SelectPrimitive.Icon asChild><ChevronDown className="size-4 opacity-50" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>
}

export function SelectContent({ className, children, position = 'popper', ...props }: SelectPrimitive.SelectContentProps) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content className={cn('relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md', position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1', className)} position={position} {...props}><SelectScrollUpButton /><SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}>{children}</SelectPrimitive.Viewport><SelectScrollDownButton /></SelectPrimitive.Content></SelectPrimitive.Portal>
}

export const SelectLabel = SelectPrimitive.Label

export function SelectItem({ className, children, ...props }: SelectPrimitive.SelectItemProps) {
  return <SelectPrimitive.Item className={cn('relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}><span className="absolute left-2 flex size-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>
}

export function SelectSeparator({ className, ...props }: SelectPrimitive.SelectSeparatorProps) {
  return <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
}

function SelectScrollUpButton({ className, ...props }: SelectPrimitive.SelectScrollUpButtonProps) {
  return <SelectPrimitive.ScrollUpButton className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
}

function SelectScrollDownButton({ className, ...props }: SelectPrimitive.SelectScrollDownButtonProps) {
  return <SelectPrimitive.ScrollDownButton className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
}
