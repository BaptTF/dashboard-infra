import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '~/components/ui/card'
import { cn } from '~/lib/utils'

const toneClasses = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/12 text-info',
} as const

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  badge,
  className,
  valueTitle,
  valueClassName,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: keyof typeof toneClasses
  badge?: ReactNode
  className?: string
  valueTitle?: string
  valueClassName?: string
}) {
  return (
    <Card className={cn('min-w-0 p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md',
              toneClasses[tone],
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <p
          className={cn('tnum text-2xl leading-none font-semibold tracking-tight', valueClassName)}
          title={valueTitle}
        >
          {value}
        </p>
        {badge}
      </div>
      {hint ? (
        <div
          suppressHydrationWarning
          className="text-muted-foreground mt-2 text-xs leading-relaxed"
        >
          {hint}
        </div>
      ) : null}
    </Card>
  )
}
