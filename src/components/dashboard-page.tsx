import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

export function DashboardPage({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <main
      id="contenu"
      tabIndex={-1}
      className={cn(
        'focus-visible:ring-ring mx-auto w-full max-w-[1500px] scroll-mt-20 px-4 py-6 focus-visible:ring-2 focus-visible:outline-none sm:px-6 lg:py-8',
        className,
      )}
    >
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-primary mb-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">
            {title}
          </h1>
          <p className="text-muted-foreground mt-1.5 max-w-3xl text-sm leading-relaxed">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="space-y-5">{children}</div>
    </main>
  )
}
