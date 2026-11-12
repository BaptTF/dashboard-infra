import { useId, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader } from '~/components/ui/card'
import { cn } from '~/lib/utils'

export function Panel({
  title,
  description,
  actions,
  children,
  footer,
  className,
  contentClassName,
  level = 2,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  level?: 2 | 3
}) {
  const id = useId()
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader className="border-border/70 flex-col gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Heading id={id} className="text-sm leading-tight font-semibold tracking-tight">
            {title}
          </Heading>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {actions ? (
          <div className="no-print flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={cn('pt-4 sm:pt-5', contentClassName)} aria-labelledby={id}>
        {children}
      </CardContent>
      {footer ? <div className="border-border/70 border-t px-4 py-3 sm:px-5">{footer}</div> : null}
    </Card>
  )
}
