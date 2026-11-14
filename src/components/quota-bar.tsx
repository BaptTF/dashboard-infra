import { useId } from 'react'
import { Badge } from '~/components/ui/badge'
import { countdown, formatParisDateTime } from '~/lib/dates'
import { formatDecimal, formatPercent } from '~/lib/format'
import {
  normalizeProvider,
  quotaThresholds,
  severityLabel,
  type QuotaThresholds,
} from '~/lib/providers'
import type { QuotaWindow, Severity } from '~/lib/types'
import { cn, clamp } from '~/lib/utils'

const severityClass = (severity: Severity | null) => {
  if (severity === 2) return 'bg-danger'
  if (severity === 1) return 'bg-warning'
  if (severity === 0) return 'bg-success'
  // Unknown severity is neutral: it must never borrow the green signal.
  return 'bg-muted-foreground/45'
}

const severityBadge = (severity: Severity | null) => {
  if (severity === 2) return 'danger' as const
  if (severity === 1) return 'warning' as const
  if (severity === 0) return 'success' as const
  return 'muted' as const
}

function dryDaysClass(provider: string | undefined, severity: Severity | null) {
  if (normalizeProvider(provider) === 'cursor' || normalizeProvider(provider) === 'devin') {
    return 'text-muted-foreground'
  }
  return severity === 2 ? 'text-danger' : severity === 1 ? 'text-warning' : 'text-muted-foreground'
}

export function QuotaBar({
  label,
  window,
  usedRatio,
  elapsedRatio,
  severity,
  dryDays,
  resetAt,
  hint,
  provider,
  thresholds,
  className,
}: {
  label: string
  window: QuotaWindow
  usedRatio: number | null
  elapsedRatio: number | null
  severity: Severity | null
  dryDays: number | null
  resetAt: number | null
  hint?: string
  provider?: string
  /** Explicit markers for non-quota bars such as spend buckets. */
  thresholds?: QuotaThresholds
  className?: string
}) {
  const id = useId()
  const marks = thresholds ?? quotaThresholds(provider, window)
  const warnPercent = Math.round(marks.warn * 100)
  const criticalPercent = Math.round(marks.critical * 100)
  const hasValue = usedRatio != null && Number.isFinite(usedRatio)
  const used = hasValue ? clamp(usedRatio, 0, 1) : 0
  const showElapsed = window !== 'rolling' && elapsedRatio != null && Number.isFinite(elapsedRatio)
  const elapsed = showElapsed ? clamp(elapsedRatio, 0, 1) : null
  const valueText = hasValue
    ? `${label} : ${formatPercent(usedRatio)} consommé${elapsed != null ? `, ${formatPercent(elapsedRatio)} du temps écoulé` : ''}${dryDays != null ? `, ${formatDecimal(dryDays)} jours projetés sans quota avant reset` : ''}`
    : `${label} : consommation indisponible`
  const dryDaysMeaningful = dryDays != null && dryDays > 0

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{label}</span>
            <Badge variant={severityBadge(severity)}>{severityLabel(severity)}</Badge>
          </div>
          {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
        </div>
        <div className="flex flex-wrap items-baseline justify-end gap-2">
          {dryDaysMeaningful ? (
            <span className={cn('text-xs font-medium', dryDaysClass(provider, severity))}>
              {formatDecimal(dryDays)} j sans quota
            </span>
          ) : null}
          <span className="tnum text-lg font-semibold">{formatPercent(usedRatio)}</span>
        </div>
      </div>

      <div className="relative mt-2.5">
        <div
          role="progressbar"
          aria-labelledby={`${id}-label`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hasValue ? Math.round(used * 100) : undefined}
          aria-valuetext={valueText}
          className="bg-muted relative h-2.5 overflow-hidden rounded-full"
          title={`Repères de consommation à ${warnPercent} % et ${criticalPercent} %`}
        >
          <span id={`${id}-label`} className="sr-only">
            {label}
          </span>
          <span
            aria-hidden="true"
            className={cn('absolute inset-y-0 left-0 rounded-full', severityClass(severity))}
            style={{ width: `${used * 100}%` }}
          />
          <span
            aria-hidden="true"
            data-threshold={warnPercent}
            className="border-foreground/35 absolute inset-y-0 border-l border-dashed"
            style={{ left: `${warnPercent}%` }}
          />
          <span
            aria-hidden="true"
            data-threshold={criticalPercent}
            className="border-foreground/35 absolute inset-y-0 border-l border-dashed"
            style={{ left: `${criticalPercent}%` }}
          />
          {elapsed != null ? (
            <span
              aria-hidden="true"
              className="bg-foreground ring-background absolute -top-1 h-[18px] w-[2px] rounded-full ring-2"
              style={{ left: `calc(${elapsed * 100}% - 1px)` }}
            />
          ) : null}
        </div>
      </div>

      {elapsed != null ? (
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <span
              className="bg-foreground inline-block h-2.5 w-[2px] rounded-full"
              aria-hidden="true"
            />
            Temps écoulé {formatPercent(elapsedRatio)}
          </span>
        </div>
      ) : null}

      {resetAt != null ? (
        <p suppressHydrationWarning className="text-muted-foreground mt-1 text-xs">
          Reset le{' '}
          <strong className="text-foreground font-medium">
            {formatParisDateTime(resetAt * 1000)}
          </strong>{' '}
          ({countdown(resetAt)})
        </p>
      ) : null}
    </div>
  )
}
