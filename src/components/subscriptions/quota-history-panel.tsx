import type { UseQueryResult } from '@tanstack/react-query'
import { CalendarClock, RotateCcw } from 'lucide-react'
import { Chart, type ChartTable } from '~/components/chart'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { StatusBanner } from '~/components/status-banner'
import { TimeRangePicker } from '~/components/time-range-picker'
import { Button } from '~/components/ui/button'
import { formatParisDateTime, quotaWindowLabel } from '~/lib/dates'
import { formatPercent, historyRangeLabel } from '~/lib/format'
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
}: {
  query: UseQueryResult<QuotaHistory>
  window: QuotaWindow
  range: HistoryRange
}) {
  const data = query.data
  const chartSeries =
    data?.series.map((series) => ({
      name: `${series.subscription} · ${series.quota}`,
      points: series.points.map((point) => ({ x: point.timestamp * 1000, y: point.value })),
    })) ?? []

  const tableRows =
    data?.series.flatMap((series) =>
      downsample(series.points).map((point) => [
        formatParisDateTime(point.timestamp * 1000),
        series.subscription,
        series.quota,
        formatPercent(point.value),
      ]),
    ) ?? []
  const table: ChartTable = {
    columns: [
      { label: 'Date' },
      { label: 'Abonnement' },
      { label: 'Fenêtre' },
      { label: 'Consommé', align: 'right' },
    ],
    rows: tableRows,
  }

  return (
    <Panel
      title="Historique des quotas"
      description="Consommation observée dans Prometheus. La courbe commence à la première série collectée, jamais avant."
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
      ) : data && data.series.length === 0 ? (
        <EmptyState
          title="Pas encore d’historique"
          description={
            data.error
              ? data.error
              : 'Aucun point n’a encore été collecté pour cette fenêtre. Aucun historique synthétique n’est fabriqué : la courbe démarrera au premier scrape.'
          }
          icon={CalendarClock}
        />
      ) : data ? (
        <div className="space-y-3">
          <Chart
            series={chartSeries}
            unit="percent"
            ariaLabel={`Historique de consommation des quotas — ${quotaWindowLabel(window)}, ${historyRangeLabel(range)}`}
            description={`Courbe de consommation des quotas — ${quotaWindowLabel(window)} sur ${historyRangeLabel(range)}. Les seuils 80 % et 95 % sont marqués en pointillés.`}
            height={300}
            thresholdLines={[0.8, 0.95]}
            yMax={1.05}
            xLabelMode={range === '90d' ? 'month' : 'day'}
            table={table}
            stepSeconds={data.stepSeconds}
            dataKey={`quotas-${window}-${range}`}
            emptyTitle="Aucun point dans cette fenêtre"
          />
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
