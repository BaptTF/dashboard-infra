import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

const tones = {
  info: { icon: Info, className: 'border-info/25 bg-info/8 text-info' },
  success: { icon: CircleCheck, className: 'border-success/25 bg-success/8 text-success' },
  warning: { icon: TriangleAlert, className: 'border-warning/30 bg-warning/8 text-warning' },
  danger: { icon: CircleAlert, className: 'border-danger/30 bg-danger/8 text-danger' },
} as const

export function StatusBanner({
  tone = 'info',
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: keyof typeof tones
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
  role?: 'alert' | 'status'
}) {
  const { icon: Icon, className: toneClass } = tones[tone]
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cn(
        'flex items-start gap-3 rounded-md border px-3.5 py-3 text-sm',
        toneClass,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children ? (
          <div suppressHydrationWarning className="text-foreground/80 mt-1 text-xs leading-relaxed">
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
