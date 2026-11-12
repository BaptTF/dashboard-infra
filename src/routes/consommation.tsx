import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Database, FlaskConical } from 'lucide-react'
import { DashboardPage } from '~/components/dashboard-page'
import { EmptyState } from '~/components/empty-state'
import { usePublishFreshness } from '~/components/freshness'
import { PageSkeleton, QueryState } from '~/components/query-state'
import { StatusBanner } from '~/components/status-banner'
import { TimeRangePicker } from '~/components/time-range-picker'
import { Badge } from '~/components/ui/badge'
import { SpendHistoryPanel } from '~/components/consumption/spend-history-panel'
import { SpendSummary } from '~/components/consumption/spend-summary'
import { BifrostTable, HermesTable } from '~/components/consumption/spend-tables'
import { SourceNotes } from '~/components/consumption/source-notes'
import { UpdateIndicator } from '~/components/update-indicator'
import { normalizeSpendWindow, spendWindowLabel } from '~/lib/dates'
import { consumptionHistoryQueryOptions, consumptionReportQueryOptions } from '~/lib/queries'
import { includesAgent, includesBifrost, type SpendSource } from '~/lib/spend-view'
import type { SpendWindow } from '~/lib/types'

interface ConsumptionSearch {
  window: SpendWindow
  source: SpendSource
}

function normalizeSource(value: unknown): SpendSource {
  return value === 'bifrost' || value === 'leo' || value === 'lea' ? value : 'all'
}

export const Route = createFileRoute('/consommation')({
  validateSearch: (search: Record<string, unknown>): ConsumptionSearch => ({
    window: normalizeSpendWindow(typeof search.window === 'string' ? search.window : undefined),
    source: normalizeSource(search.source),
  }),
  loaderDeps: ({ search }) => ({ window: search.window }),
  loader: async ({ context, deps }) => {
    const requests = [
      context.queryClient.prefetchQuery(consumptionReportQueryOptions(deps.window)),
      context.queryClient.prefetchQuery(consumptionHistoryQueryOptions(deps.window)),
    ]
    // Same rule as the subscriptions page: SSR waits, client navigation does not.
    if (typeof window === 'undefined') await Promise.all(requests)
  },
  head: () => ({
    meta: [{ title: 'Consommation — Pilotage IA' }],
  }),
  component: ConsumptionPage,
})

const windowOptions = [
  { value: '1m', label: 'Mois en cours' },
  { value: '3m', label: '3 mois' },
  { value: '6m', label: '6 mois' },
  { value: '1y', label: '1 an' },
] as const

const sourceOptions = [
  { value: 'all', label: 'Tout' },
  { value: 'bifrost', label: 'Bifrost' },
  { value: 'leo', label: 'Léo' },
  { value: 'lea', label: 'Léa' },
] as const

function ConsumptionPage() {
  const search = Route.useSearch()
  const reportQuery = useQuery(consumptionReportQueryOptions(search.window))
  const historyQuery = useQuery(consumptionHistoryQueryOptions(search.window))
  const report = reportQuery.data

  usePublishFreshness({
    fetchedAt: report?.fetchedAt,
    lastSuccessAt: report?.fetchedAt ? new Date(report.fetchedAt).getTime() : null,
    stale: reportQuery.isError,
    failed: reportQuery.isError,
    source: 'consommation',
  })

  return (
    <DashboardPage
      eyebrow="Dépenses & tokens"
      title="Consommation"
      description="Coût, tokens et cache par personne, fournisseur et modèle. Les compteurs Bifrost et les fenêtres Hermes Léo/Léa sont deux sources distinctes, jamais additionnées."
      actions={
        <>
          {report?.mockMode ? (
            <Badge variant="info">
              <FlaskConical aria-hidden="true" />
              Mode démonstration
            </Badge>
          ) : null}
          <TimeRangePicker
            param="window"
            value={search.window}
            options={windowOptions}
            label="Période calendaire"
          />
          <UpdateIndicator active={reportQuery.isFetching || historyQuery.isFetching} />
        </>
      }
    >
      <QueryState
        query={reportQuery}
        ariaLabel="Chargement de la consommation"
        skeleton={<PageSkeleton cards={4} />}
        emptyTitle="Aucune consommation"
        emptyDescription="Aucune série Bifrost ou Hermes pour cette période."
        staleMessage={
          reportQuery.isError
            ? 'La dernière actualisation a échoué. Les valeurs déjà reçues restent affichées.'
            : null
        }
      >
        {(data) => {
          if (!data.configured) {
            return (
              <div className="space-y-4">
                <StatusBanner tone="info" title="Prometheus n’est pas configuré">
                  Renseignez <code className="font-mono text-[11px]">PROMETHEUS_URL</code> côté
                  serveur. En développement,{' '}
                  <code className="font-mono text-[11px]">npm run dev:mock</code> fournit des
                  données déterministes.
                </StatusBanner>
                <EmptyState
                  title="Aucune source de consommation"
                  description="La page reste accessible ; les requêtes fixes s’exécuteront dès que PROMETHEUS_URL sera disponible."
                  icon={Database}
                />
              </div>
            )
          }

          const hasData =
            data.people.some((person) => person.origin === 'bifrost') ||
            data.leo.length > 0 ||
            data.leoOther != null ||
            data.lea.length > 0 ||
            data.leaOther != null

          if (!hasData) {
            return (
              <div className="space-y-4">
                <EmptyState
                  title="Aucune consommation sur cette période"
                  description={`La fenêtre ${spendWindowLabel(data.window)} ne contient aucun compteur Bifrost ni aucune jauge Hermes.`}
                  icon={Database}
                />
                <SpendHistoryPanel query={historyQuery} windowLabel={data.windowLabel} />
              </div>
            )
          }

          const filteredHasData =
            (includesBifrost(search.source) &&
              data.people.some((person) => person.origin === 'bifrost')) ||
            (includesAgent(search.source, 'leo') &&
              (data.leo.length > 0 || data.leoOther != null)) ||
            (includesAgent(search.source, 'lea') && (data.lea.length > 0 || data.leaOther != null))

          return (
            <div className="space-y-5">
              <TimeRangePicker
                param="source"
                value={search.source}
                options={sourceOptions}
                label="Source de consommation"
              />

              <SpendSummary report={data} source={search.source} />

              {filteredHasData ? (
                <>
                  {includesBifrost(search.source) ? <BifrostTable report={data} /> : null}
                  {includesAgent(search.source, 'leo') ? (
                    <HermesTable
                      title="Hermes Léo · personnes Telegram"
                      description="Valeur courante des fenêtres Hermes. Cron, API et TUI sont repliés sur la ligne hors Telegram."
                      users={data.leo}
                      other={data.leoOther}
                      otherLabel="Hors Telegram"
                      agent="leo"
                    />
                  ) : null}
                  {includesAgent(search.source, 'lea') ? (
                    <HermesTable
                      title="Hermes Léa · Telegram et OpenClaw"
                      description="Historique OpenClaw compté aux dates des transcriptions ; cron et reste repliés sur la ligne hors Telegram."
                      users={data.lea}
                      other={data.leaOther}
                      otherLabel="Hors Telegram"
                      agent="lea"
                    />
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title="Aucune consommation pour cette source"
                  description={
                    search.source === 'leo' || search.source === 'lea'
                      ? 'Aucune jauge Hermes ne porte de valeur pour cette personne sur la période.'
                      : 'Aucun compteur Bifrost ne porte de valeur sur la période.'
                  }
                  icon={Database}
                />
              )}

              {includesBifrost(search.source) ? (
                <SpendHistoryPanel query={historyQuery} windowLabel={data.windowLabel} />
              ) : null}

              <SourceNotes />
            </div>
          )
        }}
      </QueryState>
    </DashboardPage>
  )
}
