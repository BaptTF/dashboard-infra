import type { UseQueryResult } from '@tanstack/react-query'
import { CalendarClock, RotateCcw } from 'lucide-react'
import { Chart, type ChartTable } from '~/components/chart'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { StatusBanner } from '~/components/status-banner'
import { TimeRangePicker } from '~/components/time-range-picker'
import { Button } from '~/components/ui/button'
import { formatParisDateTime, formatParisDateTimeCompact, quotaWindowLabel } from '~/lib/dates'
import { formatPercent, historyRangeLabel, quotaLabel } from '~/lib/format'
import { providerLabel, sharedQuotaThresholds, subscriptionDisplayName } from '~/lib/providers'
import { mergeQuotaHistorySeries } from '~/lib/subscriptions'
import type { HistoryRange, QuotaHistory, QuotaWindow } from '~/lib/types'
import type { MetricPoint } from '~/lib/types'

const windowOptions = [
  { value: 'monthly', label: 'Mensuel' },
  { value: 'weekly', label: 'Hebdo' },
  { value: 'daily', label: 'Quotidien' },
  { value: 'rolling', label: 'Glissant' },
] as const

const rangeOptions = [
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: '90d', label: '90 j' },
] as const

function downsample(points: MetricPoint[], maxPoints = 30): MetricPoint[] {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const sampled: MetricPoint[] = []
  for (let index = 0; index < points.length; index += step) {
    const point = points[index]
    if (point) sampled.push(point)
  }
  const last = points[points.length - 1]
  if (last && sampled[sampled.length - 1]?.timestamp !== last.timestamp) sampled.push(last)
  return sampled
}

export function QuotaHistoryPanel({
  query,
  window,
  range,
  hasQuotaForWindow,
}: {
  query: UseQueryResult<QuotaHistory>
  window: QuotaWindow
  range: HistoryRange
  /** Distinguishes "no daily series exported" from "not collected yet". */
  hasQuotaForWindow?: boolean
}) {
  const data = query.data
  // The server already merges exact duplicates; doing it again protects the
  // client from placeholder payloads and keeps the legend count stable.
  const series = data ? mergeQuotaHistorySeries(data.series) : []
  const chartSeries = series.map((entry) => ({
    name: `${providerLabel(entry.provider)} · ${subscriptionDisplayName(entry.provider, entry.subscription)} · ${quotaLabel(entry.quota)}`,
    points: entry.points.map((point) => ({ x: point.timestamp * 1000, y: point.value })),
  }))
  const thresholds = sharedQuotaThresholds(
    series.map((entry) => ({ provider: entry.provider, window: entry.window })),
  )
  const thresholdPercent = thresholds
    ? `${Math.round(thresholds.warn * 100)} % et ${Math.round(thresholds.critical * 100)} %`
    : null
  const pointCount = series.reduce((total, entry) => total + entry.points.length, 0)

  const tableRows = series.flatMap((entry) =>
    downsample(entry.points).map((point) => [
      <span
        key={`${entry.provider}-${entry.subscription}-${entry.quota}-${point.timestamp}`}
        title={formatParisDateTime(point.timestamp * 1000)}
      >
        {formatParisDateTimeCompact(point.timestamp * 1000)}
      </span>,
      `${providerLabel(entry.provider)} · ${subscriptionDisplayName(entry.provider, entry.subscription)}`,
      quotaLabel(entry.quota),
      formatPercent(point.value),
    ]),
  )
  const table: ChartTable = {
    columns: [
      { label: 'Date' },
      { label: 'Abonnement' },
      { label: 'Quota' },
      { label: 'Consommé', align: 'right' },
    ],
    rows: tableRows,
  }

  const dailyWithoutSeries = window === 'daily' && hasQuotaForWindow === false
  const emptyTitle = dailyWithoutSeries
    ? 'Aucune série quotidienne exportée'
    : hasQuotaForWindow === false
      ? 'Pas encore de collecte'
      : 'Pas encore d’historique'
  const emptyDescription = dailyWithoutSeries
    ? 'Aucun exporteur ne publie de fenêtre quotidienne pour le moment. La courbe apparaîtra seulement si une série quotidienne est réellement collectée.'
    : hasQuotaForWindow === false
      ? 'Aucune série de quota n’est exportée pour cette fenêtre. Aucun historique synthétique n’est fabriqué.'
      : 'Aucun point n’a encore été collecté pour cette fenêtre. Aucun historique synthétique n’est fabriqué : la courbe démarrera au premier scrape.'

  const description = thresholdPercent
    ? `Consommation observée dans Prometheus. Repères à ${thresholdPercent} pour cette fenêtre. Les trous de collecte restent visibles.`
    : series.length > 0
      ? 'Consommation observée dans Prometheus. Plusieurs grilles de repères coexistent : les seuils sont masqués pour ne pas induire en erreur. Les trous de collecte restent visibles.'
      : 'Consommation observée dans Prometheus. La courbe commence à la première série collectée, jamais avant.'

  return (
    <Panel
      title="Historique des quotas"
      description={description}
      actions={
        <>
          <TimeRangePicker
            param="window"
            value={window}
            options={windowOptions}
            label="Fenêtre de quota"
            size="sm"
          />
          <TimeRangePicker
            param="history"
            value={range}
            options={rangeOptions}
            label="Profondeur d’historique"
            size="sm"
          />
        </>
      }
    >
      {query.isError && data ? (
        <StatusBanner tone="warning" title="Historique non actualisé" className="mb-4">
          {query.error instanceof Error ? query.error.message : 'La requête a échoué.'} Les points
          déjà reçus restent affichés.
        </StatusBanner>
      ) : null}
      {query.isError && !data ? (
        <StatusBanner
          tone="danger"
          title="Impossible de charger l’historique"
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RotateCcw aria-hidden="true" />
              Réessayer
            </Button>
          }
        >
          {query.error instanceof Error ? query.error.message : 'La requête a échoué.'}
        </StatusBanner>
      ) : query.isPending && !data ? (
        <div className="bg-muted/40 h-72 animate-pulse rounded-md">
          <span role="status" className="sr-only">
            Chargement de l’historique
          </span>
        </div>
      ) : data && !data.configured ? (
        <EmptyState
          title="Prometheus non configuré"
          description="Renseignez PROMETHEUS_URL côté serveur pour activer l’historique."
          icon={CalendarClock}
        />
      ) : data && series.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} icon={CalendarClock} />
      ) : data ? (
        <div className="space-y-3">
          <Chart
            series={chartSeries}
            unit="percent"
            ariaLabel={`Historique de consommation des quotas — ${quotaWindowLabel(window)}, ${historyRangeLabel(range)}`}
            description={`Courbe de consommation des quotas — ${quotaWindowLabel(window)} sur ${historyRangeLabel(range)}. ${description}`}
            height={300}
            thresholdLines={thresholds ? [thresholds.warn, thresholds.critical] : undefined}
            yMax={1.05}
            xLabelMode="time"
            table={table}
            stepSeconds={data.stepSeconds}
            dataKey={`quotas-${window}-${range}`}
            emptyTitle="Aucun point dans cette fenêtre"
          />
          {pointCount === 1 ? (
            <p className="text-muted-foreground text-xs">
              1 mesure, courbe à partir du prochain relevé.
            </p>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>
              Première mesure :{' '}
              <strong className="text-foreground font-medium">
                {data.firstSampleAt ? formatParisDateTime(data.firstSampleAt) : 'inconnue'}
              </strong>
            </span>
            <span>Pas de {Math.round(data.stepSeconds / 60)} min</span>
            <span>Les trous de collecte restent visibles.</span>
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
