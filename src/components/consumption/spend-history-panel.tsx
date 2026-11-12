import type { UseQueryResult } from '@tanstack/react-query'
import { LineChart, RotateCcw } from 'lucide-react'
import { Chart, type ChartTable } from '~/components/chart'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { StatusBanner } from '~/components/status-banner'
import { Button } from '~/components/ui/button'
import { formatParisDateTime, formatUtcDate, formatUtcDayTime } from '~/lib/dates'
import { formatCurrency } from '~/lib/format'
import type { MetricPoint, SpendGranularity, SpendHistory } from '~/lib/types'

function downsample(points: MetricPoint[], maxPoints = 24): MetricPoint[] {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const result: MetricPoint[] = []
  for (let index = 0; index < points.length; index += step) {
    const point = points[index]
    if (point) result.push(point)
  }
  const last = points[points.length - 1]
  if (last && result[result.length - 1]?.timestamp !== last.timestamp) result.push(last)
  return result
}

function granularityLabel(granularity: SpendGranularity): string {
  return granularity === 'hour'
    ? 'heure UTC'
    : granularity === '6h'
      ? '6 h UTC'
      : granularity === '12h'
        ? '12 h UTC'
        : 'jour UTC'
}

export function SpendHistoryPanel({
  query,
  windowLabel,
}: {
  query: UseQueryResult<SpendHistory>
  windowLabel: string
}) {
  const data = query.data
  const chartSeries =
    data?.series.map((series) => ({
      name: series.virtualKey,
      points: series.points.map((point) => ({ x: point.timestamp * 1000, y: point.value })),
    })) ?? []
  const fine =
    data?.granularity === 'hour' || data?.granularity === '6h' || data?.granularity === '12h'
  const tableRows =
    data?.series.flatMap((series) =>
      downsample(series.points).map((point) => [
        <span
          key={`${series.virtualKey}-${point.timestamp}`}
          className="whitespace-nowrap"
          title={
            fine ? formatUtcDayTime(point.timestamp * 1000) : formatUtcDate(point.timestamp * 1000)
          }
        >
          {fine ? formatUtcDayTime(point.timestamp * 1000) : formatUtcDate(point.timestamp * 1000)}
        </span>,
        series.virtualKey,
        formatCurrency(point.value),
      ]),
    ) ?? []
  const pointCount = data?.series.reduce((total, series) => total + series.points.length, 0) ?? 0
  // The table may be downsampled; the displayed total is always the full sum.
  const curveTotal =
    data?.series.reduce(
      (total, series) => total + series.points.reduce((sum, point) => sum + point.value, 0),
      0,
    ) ?? 0
  const table: ChartTable = {
    columns: [
      { label: fine ? 'Heure UTC' : 'Jour UTC' },
      { label: 'Clé' },
      { label: 'Coût', align: 'right' },
    ],
    rows: tableRows,
  }
  const unitLabel = data ? granularityLabel(data.granularity) : 'jour UTC'

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <LineChart className="size-3.5" aria-hidden="true" />
          Courbe de coût Bifrost (UTC)
        </span>
      }
      description={`Points datables, backfill inclus ; totaux identiques à la somme des points. ${windowLabel}.`}
      actions={
        data && data.series.length > 0 ? (
          <span className="text-muted-foreground text-[11px]">
            Total courbe : {formatCurrency(curveTotal)} · {data.series.length} clé
            {data.series.length > 1 ? 's' : ''}
          </span>
        ) : null
      }
    >
      {query.isError && data ? (
        <StatusBanner tone="warning" title="Courbe non actualisée" className="mb-4">
          {query.error instanceof Error ? query.error.message : 'La requête a échoué.'} Les derniers
          points reçus restent affichés.
        </StatusBanner>
      ) : null}
      {query.isError && !data ? (
        <StatusBanner
          tone="danger"
          title="Impossible de charger la courbe"
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
            Chargement de la courbe
          </span>
        </div>
      ) : data && !data.configured ? (
        <EmptyState
          title="Prometheus non configuré"
          description="Renseignez PROMETHEUS_URL côté serveur pour activer la courbe."
          icon={LineChart}
        />
      ) : data && data.series.length === 0 ? (
        <EmptyState
          title="Pas encore d’historique"
          description="Aucun compteur Bifrost exploitable sur cette période. La courbe ne complète jamais les jours manquants."
          icon={LineChart}
        />
      ) : data ? (
        <div className="space-y-3">
          <Chart
            series={chartSeries}
            unit="currency"
            ariaLabel={`Coût Bifrost par ${unitLabel} pour ${windowLabel}`}
            description={`Courbe empilée des coûts Bifrost par ${unitLabel}, par clé. Backfill inclus, totaux identiques à la somme des points. Les dates sont en UTC.`}
            height={330}
            stacked
            area
            xLabelMode={fine ? 'utc-time' : 'utc-day'}
            table={table}
            stepSeconds={data.stepSeconds}
            dataKey={`bifrost-${data.window}-${data.granularity}`}
            emptyTitle="Aucun point dans cette période"
          />
          {pointCount === 1 ? (
            <p className="text-muted-foreground text-xs">
              1 mesure isolée ; le point reste affiché tel quel.
            </p>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>
              Première mesure UTC :{' '}
              <strong className="text-foreground font-medium">
                {data.firstSampleAt
                  ? fine
                    ? formatUtcDayTime(data.firstSampleAt)
                    : formatUtcDate(data.firstSampleAt)
                  : 'inconnue'}
              </strong>
            </span>
            <span>
              {data.window === 'all'
                ? 'Depuis le début (recherche limitée à 2 ans)'
                : `Période sélectionnée (Paris) : depuis le ${formatParisDateTime(data.from)}`}
            </span>
            <span>Source UTC, backfill daté au jour consommé.</span>
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
