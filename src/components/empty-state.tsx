import { Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-border/80 bg-muted/20 flex flex-col items-center justify-center rounded-md border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      <span className="bg-background text-muted-foreground mb-3 flex size-10 items-center justify-center rounded-full border">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <div className="text-muted-foreground mt-1.5 max-w-md text-xs leading-relaxed">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
