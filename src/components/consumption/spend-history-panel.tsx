import type { UseQueryResult } from '@tanstack/react-query'
import { LineChart, RotateCcw } from 'lucide-react'
import { Chart, type ChartTable } from '~/components/chart'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { StatusBanner } from '~/components/status-banner'
import { Button } from '~/components/ui/button'
import { formatParisDateTime, formatUtcDate, formatUtcDayTime } from '~/lib/dates'
import { formatCurrency } from '~/lib/format'
import type { SpendGranularity, SpendHistory } from '~/lib/types'

function granularityLabel(granularity: SpendGranularity): string {
  return granularity === 'hour'
    ? 'heure UTC'
    : granularity === '6h'
      ? '6 h UTC'
      : granularity === '12h'
        ? '12 h UTC'
        : 'jour UTC'
}

function granularityDetail(granularity: SpendGranularity): string {
  return granularity === 'day'
    ? 'Points journaliers en UTC'
    : `${granularityLabel(granularity)} pour le live · jour UTC pour le backfill`
}

export function SpendHistoryPanel({
  query,
  windowLabel,
  onlyKeys,
  filterLabel,
}: {
  query: UseQueryResult<SpendHistory>
  windowLabel: string
  onlyKeys?: string[]
  filterLabel?: string
}) {
  const data = query.data
  const series = data
    ? onlyKeys
      ? data.series.filter((entry) => onlyKeys.includes(entry.virtualKey))
      : data.series
    : []
  const chartSeries = series.map((entry) => ({
    name: entry.virtualKey,
    points: entry.points.map((point) => ({ x: point.timestamp * 1000, y: point.value })),
  }))
  const fine =
    data?.granularity === 'hour' || data?.granularity === '6h' || data?.granularity === '12h'
  const tableRows = series
    .flatMap((entry) => entry.points.map((point) => ({ virtualKey: entry.virtualKey, point })))
    .sort((a, b) => b.point.timestamp - a.point.timestamp)
    .map(({ virtualKey, point }) => [
      <span
        key={`${virtualKey}-${point.timestamp}`}
        className="whitespace-nowrap"
        title={
          fine ? formatUtcDayTime(point.timestamp * 1000) : formatUtcDate(point.timestamp * 1000)
        }
      >
        {fine ? formatUtcDayTime(point.timestamp * 1000) : formatUtcDate(point.timestamp * 1000)}
      </span>,
      virtualKey,
      formatCurrency(point.value),
    ])
  const pointCount = series.reduce((total, entry) => total + entry.points.length, 0)
  const curveTotal = series.reduce(
    (total, entry) => total + entry.points.reduce((sum, point) => sum + point.value, 0),
    0,
  )
  const firstSampleAt = series.reduce((first, entry) => {
    const point = entry.points[0]
    return point && point.timestamp < first ? point.timestamp : first
  }, Number.POSITIVE_INFINITY)
  const firstSample = Number.isFinite(firstSampleAt) ? firstSampleAt * 1000 : null
  const table: ChartTable = {
    columns: [
      { label: fine ? 'Date/heure UTC' : 'Jour UTC' },
      { label: 'Clé' },
      { label: 'Coût', align: 'right' },
    ],
    rows: tableRows,
    // The table contains every point; the footer repeats the exact raw sum so
    // rounded rows cannot hide a missing bucket.
    footer:
      series.length > 0
        ? [
            'Total',
            `${series.length} clé${series.length > 1 ? 's' : ''}`,
            formatCurrency(curveTotal),
          ]
        : undefined,
  }
  const unitLabel = data ? granularityLabel(data.granularity) : 'jour UTC'
  const detailLabel = data ? granularityDetail(data.granularity) : 'jour UTC'
  const scope = filterLabel ?? (onlyKeys?.length ? onlyKeys.join(', ') : null)
  const chartStepSeconds = data?.granularity === 'day' ? data.stepSeconds : undefined

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <LineChart className="size-3.5" aria-hidden="true" />
          Courbe de coût Bifrost (UTC)
        </span>
      }
      description={`${scope ? `Clé ${scope}. ` : ''}Coûts reconstruits depuis les compteurs Bifrost, backfill inclus. Chaque clé est tracée à sa valeur propre, sans empilement ; totaux identiques à la somme des points. ${detailLabel}. ${windowLabel}.`}
      actions={
        series.length > 0 ? (
          <span className="text-muted-foreground text-[11px]">
            Total courbe : {formatCurrency(curveTotal)} · {series.length} clé
            {series.length > 1 ? 's' : ''}
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
      ) : data && series.length === 0 ? (
        <EmptyState
          title={onlyKeys?.length ? 'Aucune donnée pour cette clé' : 'Pas encore d’historique'}
          description={
            onlyKeys?.length
              ? `Aucun point Bifrost pour ${onlyKeys.join(', ')} sur cette période.`
              : 'Aucun compteur Bifrost exploitable sur cette période. La courbe ne complète jamais les jours manquants.'
          }
          icon={LineChart}
        />
      ) : data ? (
        <div className="space-y-3">
          <Chart
            series={chartSeries}
            unit="currency"
            ariaLabel={`Coût Bifrost ${scope ? `pour ${scope} ` : ''}par ${unitLabel} pour ${windowLabel}`}
            description={`Courbe des coûts Bifrost par ${unitLabel}, par clé, sans empilement : chaque série est à sa valeur propre. ${detailLabel}. Totaux identiques à la somme des points.`}
            height={330}
            xLabelMode={fine ? 'utc-time' : 'utc-day'}
            table={table}
            stepSeconds={chartStepSeconds}
            dataKey={`bifrost-${data.window}-${data.granularity}${onlyKeys?.length ? `-${onlyKeys.join('-')}` : ''}`}
            listLegend
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
                {firstSample
                  ? fine
                    ? formatUtcDayTime(firstSample)
                    : formatUtcDate(firstSample)
                  : 'inconnue'}
              </strong>
            </span>
            <span>
              {data.window === 'all'
                ? 'Depuis le début (recherche limitée à 2 ans)'
                : `Période sélectionnée (Paris) : depuis le ${formatParisDateTime(data.from)}`}
            </span>
            <span>Source UTC · backfill journalier daté au jour consommé.</span>
            <span>Le jour UTC à cheval sur le début de période est exclu du backfill.</span>
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
