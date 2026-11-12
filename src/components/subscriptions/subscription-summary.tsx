import { ShieldAlert, TimerReset } from 'lucide-react'
import { MetricCard } from '~/components/metric-card'
import { Badge } from '~/components/ui/badge'
import { formatParisDateTime, quotaWindowLabel } from '~/lib/dates'
import { formatDecimal, formatPercent, quotaLabel } from '~/lib/format'
import {
  maxDryDaysQuota,
  pickWeakestQuota,
  providerMeta,
  severityCount,
  severityLabel,
  subscriptionDisplayName,
} from '~/lib/providers'
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
  const dryDaysQuota = maxDryDaysQuota(overview.quotas)
  const atRisk = severityCount(overview.quotas, 1) + severityCount(overview.quotas, 2)
  const weakestMeta = weakest ? providerMeta(weakest.quota.provider) : null

  return (
    <div className="grid grid-cols-2 items-stretch gap-2.5 sm:gap-3 xl:grid-cols-3">
      <MetricCard
        label="Maillon faible"
        value={
          weakest ? (
            <span className="block min-w-0 text-base leading-tight font-semibold break-words">
              {weakestMeta?.name ?? weakest.quota.provider} ·{' '}
              {subscriptionDisplayName(weakest.quota.provider, weakest.quota.subscription)}
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
              {weakestMeta?.name ?? weakest.quota.provider} ·{' '}
              {subscriptionDisplayName(weakest.quota.provider, weakest.quota.subscription)} —{' '}
              {quotaLabel(weakest.quota.quota)} · {quotaWindowLabel(weakest.quota.window)} ·{' '}
              {formatPercent(weakest.quota.usedRatio)} consommé
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
        className="col-span-2 h-full p-3.5 xl:col-span-1"
      />
      <MetricCard
        label="Jours à sec"
        value={dryDaysQuota?.dryDays != null ? formatDecimal(dryDaysQuota.dryDays) : '—'}
        hint={
          dryDaysQuota ? (
            <>
              <span className="block">
                Projection maximale · {providerMeta(dryDaysQuota.provider).name} ·{' '}
                {subscriptionDisplayName(dryDaysQuota.provider, dryDaysQuota.subscription)} ·{' '}
                {quotaWindowLabel(dryDaysQuota.window)}
              </span>
              {dryDaysQuota.resetAt != null ? (
                <span className="block">
                  Reset {formatParisDateTime(dryDaysQuota.resetAt * 1000)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="block">Aucune projection de jours à sec disponible</span>
          )
        }
        icon={TimerReset}
        tone={severityTone(dryDaysQuota?.severity ?? null)}
        className="h-full p-3.5"
      />
      <MetricCard
        label="Quotas sous tension"
        value={`${atRisk} / ${overview.quotas.length}`}
        hint="Sévérité exportée. Un quota plein prime, puis la sévérité et la projection de jours à sec."
        icon={ShieldAlert}
        tone={atRisk > 0 ? 'warning' : 'success'}
        className="h-full p-3.5"
      />
    </div>
  )
}
