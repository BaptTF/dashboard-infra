import type { UseQueryResult } from '@tanstack/react-query'
import { ChartColumnStacked, RotateCcw } from 'lucide-react'
import { Chart, type ChartTable } from '~/components/chart'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { StatusBanner } from '~/components/status-banner'
import { Button } from '~/components/ui/button'
import { formatParisDateTime, formatUtcDate, formatUtcDayTime } from '~/lib/dates'
import { formatCurrency } from '~/lib/format'
import { groupSpendCurveByProvider } from '~/lib/spend'
import type { SpendGranularity, SpendHistory } from '~/lib/types'
import type { SpendGrouping } from '~/lib/spend-view'

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
  grouping,
}: {
  query: UseQueryResult<SpendHistory>
  windowLabel: string
  onlyKeys?: string[]
  filterLabel?: string
  grouping: SpendGrouping
}) {
  const data = query.data
  const byProvider = grouping === 'provider'
  const keySeries = data
    ? onlyKeys
      ? data.series.filter((entry) => onlyKeys.includes(entry.virtualKey))
      : data.series
    : []
  const lines = byProvider
    ? groupSpendCurveByProvider(data?.providerSlices ?? [], onlyKeys).map((entry) => ({
        name: entry.label,
        points: entry.points,
      }))
    : keySeries.map((entry) => ({ name: entry.virtualKey, points: entry.points }))
  const noun = byProvider ? 'fournisseur' : 'clé'
  const chartSeries = lines.map((entry) => ({
    name: entry.name,
    points: entry.points.map((point) => ({ x: point.timestamp * 1000, y: point.value })),
  }))
  const fine =
    data?.granularity === 'hour' || data?.granularity === '6h' || data?.granularity === '12h'
  const tableRows = lines
    .flatMap((entry) => entry.points.map((point) => ({ name: entry.name, point })))
    .sort((a, b) => b.point.timestamp - a.point.timestamp)
    .map(({ name, point }) => [
      <span
        key={`${name}-${point.timestamp}`}
        className="whitespace-nowrap"
        title={
          fine ? formatUtcDayTime(point.timestamp * 1000) : formatUtcDate(point.timestamp * 1000)
        }
      >
        {fine ? formatUtcDayTime(point.timestamp * 1000) : formatUtcDate(point.timestamp * 1000)}
      </span>,
      name,
      formatCurrency(point.value),
    ])
  const pointCount = lines.reduce((total, entry) => total + entry.points.length, 0)
  const curveTotal = lines.reduce(
    (total, entry) => total + entry.points.reduce((sum, point) => sum + point.value, 0),
    0,
  )
  const firstSampleAt = lines.reduce((first, entry) => {
    const point = entry.points[0]
    return point && point.timestamp < first ? point.timestamp : first
  }, Number.POSITIVE_INFINITY)
  const firstSample = Number.isFinite(firstSampleAt) ? firstSampleAt * 1000 : null
  const lastSampleAt = lines.reduce((last, entry) => {
    const point = entry.points[entry.points.length - 1]
    return point && point.timestamp > last ? point.timestamp : last
  }, Number.NEGATIVE_INFINITY)
  const lastSample = Number.isFinite(lastSampleAt) ? lastSampleAt * 1000 : null
  const table: ChartTable = {
    columns: [
      { label: fine ? 'Date/heure UTC' : 'Jour UTC' },
      { label: byProvider ? 'Fournisseur' : 'Clé' },
      { label: 'Coût', align: 'right' },
    ],
    rows: tableRows,
    // The table contains every point; the footer repeats the exact raw sum so
    // rounded rows cannot hide a missing bucket.
    footer:
      lines.length > 0
        ? [
            'Total',
            `${lines.length} ${noun}${lines.length > 1 ? 's' : ''}`,
            formatCurrency(curveTotal),
          ]
        : undefined,
    note: lines.length > 0 ? 'Total exact ; les lignes sont arrondies au centime.' : undefined,
  }
  const unitLabel = data ? granularityLabel(data.granularity) : 'jour UTC'
  const detailLabel = data ? granularityDetail(data.granularity) : 'jour UTC'
  const scope = filterLabel ?? (onlyKeys?.length ? onlyKeys.join(', ') : null)
  const chartStepSeconds = data?.stepSeconds

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <ChartColumnStacked className="size-3.5" aria-hidden="true" />
          Courbe de coût Bifrost (UTC)
        </span>
      }
      description={
        byProvider
          ? `Barres empilées par fournisseur Bifrost : les clés d'un même fournisseur sont additionnées. ${scope ? `Clé ${scope}. ` : ''}Coûts reconstruits depuis les compteurs Bifrost, backfill inclus. La hauteur de la colonne est le coût du créneau, chaque couleur est la part du fournisseur. Masquer un fournisseur retire sa part et recale l’axe. Totaux identiques à la somme des points. ${detailLabel}. ${windowLabel}.`
          : `Barres empilées par clé Bifrost. ${scope ? `Clé ${scope}. ` : ''}Coûts reconstruits depuis les compteurs Bifrost, backfill inclus. La hauteur de la colonne est le coût du créneau, chaque couleur est la part de la clé. Masquer une clé retire sa part et recale l’axe. Totaux identiques à la somme des points. ${detailLabel}. ${windowLabel}.`
      }
      actions={
        lines.length > 0 ? (
          <span className="text-muted-foreground text-[11px]">
            Total courbe : {formatCurrency(curveTotal)} · {lines.length} {noun}
            {lines.length > 1 ? 's' : ''}
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
          icon={ChartColumnStacked}
        />
      ) : data && lines.length === 0 ? (
        <EmptyState
          title={onlyKeys?.length ? 'Aucune donnée pour cette clé' : 'Pas encore d’historique'}
          description={
            onlyKeys?.length
              ? `Aucun point Bifrost pour ${onlyKeys.join(', ')} sur cette période.`
              : 'Aucun compteur Bifrost exploitable sur cette période. La courbe ne complète jamais les jours manquants.'
          }
          icon={ChartColumnStacked}
        />
      ) : data ? (
        <div className="space-y-3">
          <Chart
            series={chartSeries}
            unit="currency"
            ariaLabel={`Coût Bifrost ${scope ? `pour ${scope} ` : ''}par ${unitLabel}, barres empilées par ${noun}, pour ${windowLabel}`}
            description={`Barres empilées des coûts Bifrost par ${unitLabel}, par ${noun}. La hauteur d'une colonne est le coût du créneau. ${detailLabel}. Totaux identiques à la somme des points.`}
            height={330}
            xLabelMode={fine ? 'utc-time' : 'utc-day'}
            table={table}
            stepSeconds={chartStepSeconds}
            variant="bar"
            dataKey={`bifrost-${data.window}-${data.granularity}${byProvider ? '-provider' : ''}${onlyKeys?.length ? `-${onlyKeys.join('-')}` : ''}`}
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
              Dernière mesure UTC :{' '}
              <strong className="text-foreground font-medium">
                {lastSample
                  ? fine
                    ? formatUtcDayTime(lastSample)
                    : formatUtcDate(lastSample)
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
