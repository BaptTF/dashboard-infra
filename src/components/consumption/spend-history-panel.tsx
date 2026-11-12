import type { UseQueryResult } from '@tanstack/react-query'
import { LineChart, RotateCcw } from 'lucide-react'
import { Chart, type ChartTable } from '~/components/chart'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { StatusBanner } from '~/components/status-banner'
import { Button } from '~/components/ui/button'
import { formatParisDateTime, formatParisDateTimeCompact } from '~/lib/dates'
import { formatCurrency } from '~/lib/format'
import type { MetricPoint, SpendHistory } from '~/lib/types'

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
  const tableRows =
    data?.series.flatMap((series) =>
      downsample(series.points).map((point) => [
        <span
          key={`${series.virtualKey}-${point.timestamp}`}
          title={formatParisDateTime(point.timestamp * 1000)}
        >
          {formatParisDateTimeCompact(point.timestamp * 1000)}
        </span>,
        series.virtualKey,
        formatCurrency(point.value),
      ]),
    ) ?? []
  const pointCount = data?.series.reduce((total, series) => total + series.points.length, 0) ?? 0
  const table: ChartTable = {
    columns: [{ label: 'Fin de période' }, { label: 'Clé' }, { label: 'Coût', align: 'right' }],
    rows: tableRows,
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <LineChart className="size-3.5" aria-hidden="true" />
          Courbe de coût Bifrost
        </span>
      }
      description={`Coût Bifrost par ${data?.bucket === 'week' ? 'semaine' : 'jour'}, ${windowLabel}. L’historique démarre à la première mesure du déploiement.`}
      actions={
        data ? (
          <span className="text-muted-foreground text-[11px]">
            {data.series.length} clé{data.series.length > 1 ? 's' : ''}
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
          description="Aucune période complète n’a encore été collectée. La courbe démarrera au déploiement, sans historique synthétique."
          icon={LineChart}
        />
      ) : data ? (
        <div className="space-y-3">
          <Chart
            series={chartSeries}
            unit="currency"
            ariaLabel={`Coût Bifrost par ${data.bucket === 'week' ? 'semaine' : 'jour'} pour ${windowLabel}`}
            description={`Courbe empilée du coût Bifrost par clé et par ${data.bucket === 'week' ? 'semaine' : 'jour'}. Les clés Hermes sont exclues de cette courbe.`}
            height={330}
            stacked
            area
            xLabelMode={data.bucket === 'week' ? 'month' : 'time'}
            table={table}
            stepSeconds={data.stepSeconds}
            dataKey={`bifrost-${data.window}-${data.bucket}`}
            emptyTitle="Aucun point dans cette période"
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
            <span>Fenêtre depuis le {formatParisDateTime(data.from)}</span>
            <span>Exclues : {data.excludedKeys.join(', ')}</span>
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
