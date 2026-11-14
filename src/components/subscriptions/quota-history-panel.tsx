import type { UseQueryResult } from '@tanstack/react-query'
import { CalendarClock, ListFilter, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Chart, type ChartTable } from '~/components/chart'
import { EmptyState } from '~/components/empty-state'
import { Panel } from '~/components/panel'
import { StatusBanner } from '~/components/status-banner'
import { TimeRangePicker } from '~/components/time-range-picker'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { formatParisDateTime, formatParisDateTimeCompact, quotaWindowLabel } from '~/lib/dates'
import { formatPercent, historyRangeLabel, quotaLabel } from '~/lib/format'
import { providerLabel, sharedQuotaThresholds, subscriptionDisplayName } from '~/lib/providers'
import { mergeQuotaHistorySeries } from '~/lib/subscriptions'
import type { HistoryRange, QuotaHistory, QuotaHistorySeries, QuotaWindow } from '~/lib/types'
import type { MetricPoint } from '~/lib/types'

const windowOptions = [
  { value: 'monthly', label: 'Mensuel' },
  { value: 'weekly', label: 'Hebdo' },
  { value: 'daily', label: 'Quotidien' },
  { value: 'rolling', label: 'Glissant' },
] as const

function seriesId(entry: QuotaHistorySeries): string {
  return [entry.provider, entry.subscription, entry.window, entry.quota].join('\u0000')
}

function seriesLabel(entry: QuotaHistorySeries, includeQuota: boolean): string {
  const base = `${providerLabel(entry.provider)} · ${subscriptionDisplayName(entry.provider, entry.subscription)}`
  return includeQuota ? `${base} · ${quotaLabel(entry.quota)}` : base
}

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
  const [selection, setSelection] = useState<{ scope: string; ids: string[] } | null>(null)
  const data = query.data
  // The server already merges exact duplicates; doing it again protects the
  // client from placeholder payloads and keeps the legend count stable.
  const allSeries = data ? mergeQuotaHistorySeries(data.series) : []
  const seriesSignature = allSeries.map(seriesId).sort().join('\u0000')
  const scope = `${window}\u0000${range}\u0000${seriesSignature}`
  const defaultIds = allSeries.filter((entry) => entry.quota === 'total').map(seriesId)
  const selectedIds = new Set(selection?.scope === scope ? selection.ids : defaultIds)
  const series = allSeries.filter((entry) => selectedIds.has(seriesId(entry)))
  const detailSeries = allSeries.filter((entry) => entry.quota !== 'total')
  const hasDetailSeries = detailSeries.length > 0
  const withDetails = series.some((entry) => entry.quota !== 'total')
  const setIds = (ids: string[]) => setSelection({ scope, ids })
  const toggleSeries = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setIds([...next])
  }
  const selectAll = () => setIds(allSeries.map(seriesId))
  const selectTotals = () => setIds(defaultIds)
  const chartSeries = series.map((entry) => ({
    name: seriesLabel(entry, withDetails),
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
        className="whitespace-nowrap"
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

  const baseDescription = thresholdPercent
    ? `Consommation observée dans Prometheus. Repères à ${thresholdPercent} pour cette fenêtre. Les trous de collecte restent visibles.`
    : series.length > 0
      ? 'Consommation observée dans Prometheus. Plusieurs grilles de repères coexistent : les seuils sont masqués pour ne pas induire en erreur. Les trous de collecte restent visibles.'
      : 'Consommation observée dans Prometheus. La courbe commence à la première série collectée, jamais avant.'
  const selectionNote =
    allSeries.length === 0
      ? ''
      : series.length === allSeries.length
        ? 'Toutes les séries.'
        : `${series.length} série${series.length > 1 ? 's' : ''} sélectionnée${series.length > 1 ? 's' : ''}.`
  const description = `${baseDescription} ${
    withDetails ? 'Détails inclus.' : 'Totaux par clé.'
  } ${selectionNote}`

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
          {allSeries.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ListFilter aria-hidden="true" />
                  Séries
                  <span className="text-muted-foreground text-[11px]">
                    ({series.length}/{allSeries.length})
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
                <div className="flex gap-1 p-1">
                  <DropdownMenuItem
                    className="flex-1 justify-center px-2"
                    onSelect={() => selectTotals()}
                  >
                    Totaux seuls
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex-1 justify-center px-2"
                    onSelect={() => selectAll()}
                  >
                    Tout afficher
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Totaux par clé</DropdownMenuLabel>
                {allSeries
                  .filter((entry) => entry.quota === 'total')
                  .map((entry) => {
                    const id = seriesId(entry)
                    return (
                      <DropdownMenuCheckboxItem
                        key={id}
                        checked={selectedIds.has(id)}
                        onCheckedChange={() => toggleSeries(id)}
                        onSelect={(event) => event.preventDefault()}
                        className="whitespace-normal"
                      >
                        {seriesLabel(entry, false)}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                {hasDetailSeries ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Détails</DropdownMenuLabel>
                    {detailSeries.map((entry) => {
                      const id = seriesId(entry)
                      return (
                        <DropdownMenuCheckboxItem
                          key={id}
                          checked={selectedIds.has(id)}
                          onCheckedChange={() => toggleSeries(id)}
                          onSelect={(event) => event.preventDefault()}
                          className="whitespace-normal"
                        >
                          {seriesLabel(entry, true)}
                        </DropdownMenuCheckboxItem>
                      )
                    })}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
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
      ) : data && allSeries.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} icon={CalendarClock} />
      ) : data && series.length === 0 ? (
        <EmptyState
          title="Aucune série sélectionnée"
          description="Choisissez au moins une série dans le menu « Séries »."
          icon={ListFilter}
        />
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
            dataKey={`quotas-${window}-${range}-${withDetails ? 'details' : 'totals'}`}
            listLegend
            sampling="minmax"
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
