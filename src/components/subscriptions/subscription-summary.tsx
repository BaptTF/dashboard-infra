import { ShieldAlert, TimerReset } from 'lucide-react'
import { MetricCard } from '~/components/metric-card'
import { Badge } from '~/components/ui/badge'
import { formatParisDateTime, quotaWindowLabel } from '~/lib/dates'
import { formatDecimal, formatPercent } from '~/lib/format'
import { pickWeakestQuota, providerMeta, severityCount, severityLabel } from '~/lib/providers'
import type { Severity, SubscriptionsOverview } from '~/lib/types'

function severityBadgeVariant(severity: Severity | null) {
  if (severity === 2) return 'danger' as const
  if (severity === 1) return 'warning' as const
  if (severity === 0) return 'success' as const
  return 'muted' as const
}

function severityTone(severity: Severity | null) {
  if (severity === 2) return 'danger' as const
  if (severity === 1) return 'warning' as const
  if (severity === 0) return 'success' as const
  return 'neutral' as const
}

export function SubscriptionSummary({ overview }: { overview: SubscriptionsOverview }) {
  const weakest = pickWeakestQuota(overview.quotas)
  const atRisk = severityCount(overview.quotas, 1) + severityCount(overview.quotas, 2)
  const weakestMeta = weakest ? providerMeta(weakest.quota.provider) : null

  return (
    <div className="grid grid-cols-2 items-start gap-2.5 sm:gap-3 xl:grid-cols-3">
      <MetricCard
        label="Maillon faible"
        value={
          weakest ? (
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-base leading-tight font-semibold">
                {weakestMeta?.name ?? weakest.quota.provider}
              </span>
              <span className="text-muted-foreground max-w-52 text-xs font-medium break-words">
                {weakest.quota.subscription}
              </span>
            </span>
          ) : (
            '—'
          )
        }
        valueClassName="text-xl"
        badge={
          weakest ? (
            <Badge variant={severityBadgeVariant(weakest.severity)}>
              {severityLabel(weakest.severity)}
            </Badge>
          ) : undefined
        }
        hint={
          weakest ? (
            <>
              {quotaWindowLabel(weakest.quota.window)} · {formatPercent(weakest.quota.usedRatio)}{' '}
              consommé
              {weakest.quota.dryDays != null && weakest.quota.dryDays > 0
                ? ` · ${formatDecimal(weakest.quota.dryDays)} j sans quota`
                : ''}
            </>
          ) : (
            'Aucun quota disponible'
          )
        }
        icon={ShieldAlert}
        tone={severityTone(weakest?.severity ?? null)}
        className="col-span-2 p-3.5 xl:col-span-1"
      />
      <MetricCard
        label="Jours à sec"
        value={weakest?.quota.dryDays != null ? formatDecimal(weakest.quota.dryDays) : '—'}
        hint={
          <>
            <span className="block">Jours projetés sans quota avant reset</span>
            {weakest?.quota.resetAt != null ? (
              <span className="block">
                Reset {formatParisDateTime(weakest.quota.resetAt * 1000)}
              </span>
            ) : null}
          </>
        }
        icon={TimerReset}
        tone={severityTone(weakest?.severity ?? null)}
        className="p-3.5"
      />
      <MetricCard
        label="Quotas sous tension"
        value={`${atRisk} / ${overview.quotas.length}`}
        hint="Sévérité exportée · repères 80 / 95 ou 70 / 90 selon le fournisseur"
        icon={ShieldAlert}
        tone={atRisk > 0 ? 'warning' : 'success'}
        className="p-3.5"
      />
    </div>
  )
}
