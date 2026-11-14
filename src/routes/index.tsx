import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Database, FlaskConical, ShieldAlert } from 'lucide-react'
import { DashboardPage } from '~/components/dashboard-page'
import { EmptyState } from '~/components/empty-state'
import { usePublishFreshness } from '~/components/freshness'
import { PartialErrors } from '~/components/partial-errors'
import { PageSkeleton, QueryState } from '~/components/query-state'
import { StatusBanner } from '~/components/status-banner'
import { ProviderCard } from '~/components/subscriptions/provider-card'
import { QuotaHistoryPanel } from '~/components/subscriptions/quota-history-panel'
import { SubscriptionSummary } from '~/components/subscriptions/subscription-summary'
import { Badge } from '~/components/ui/badge'
import { TimeRangePicker } from '~/components/time-range-picker'
import { UpdateIndicator } from '~/components/update-indicator'
import { normalizeHistoryRange, normalizeQuotaWindow } from '~/lib/dates'
import { PERIOD_OPTIONS } from '~/lib/period-options'
import { aggregateCollectionStatuses, collectionLevel, groupOverview } from '~/lib/providers'
import { quotaHistoryQueryOptions, subscriptionOverviewQueryOptions } from '~/lib/queries'
import type { HistoryRange, QuotaWindow } from '~/lib/types'

interface SubscriptionsSearch {
  window: QuotaWindow
  history: HistoryRange
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): SubscriptionsSearch => ({
    window: normalizeQuotaWindow(typeof search.window === 'string' ? search.window : undefined),
    history: normalizeHistoryRange(typeof search.history === 'string' ? search.history : undefined),
  }),
  loaderDeps: ({ search }) => ({ window: search.window, history: search.history }),
  loader: async ({ context, deps }) => {
    const requests = [
      context.queryClient.prefetchQuery(subscriptionOverviewQueryOptions()),
      context.queryClient.prefetchQuery(quotaHistoryQueryOptions(deps.window, deps.history)),
    ]
    // SSR waits so the page is usable without JavaScript. A browser navigation
    // only starts the prefetch: URL, active filter and scroll stay immediate.
    if (typeof window === 'undefined') await Promise.all(requests)
  },
  head: () => ({
    meta: [{ title: 'Abonnements — Pilotage IA' }],
  }),
  component: SubscriptionsPage,
})

function SubscriptionsPage() {
  const search = Route.useSearch()
  const overviewQuery = useQuery(subscriptionOverviewQueryOptions())
  const historyQuery = useQuery(quotaHistoryQueryOptions(search.window, search.history))

  const overview = overviewQuery.data
  const globalCollection = overview ? aggregateCollectionStatuses(overview.collection) : null
  const level = collectionLevel(globalCollection)
  const anyStale = Boolean(overview?.collection.some((entry) => entry.stale))
  const hasMetrics = Boolean(
    overview &&
    (overview.quotas.length > 0 ||
      overview.costs.length > 0 ||
      overview.spendBuckets.length > 0 ||
      overview.acu.length > 0),
  )

  usePublishFreshness({
    fetchedAt: overview?.fetchedAt,
    lastSuccessAt:
      globalCollection?.lastSuccessAt != null ? globalCollection.lastSuccessAt * 1000 : null,
    stale: anyStale,
    failed: level === 'failure',
    partial: level === 'partial',
    loading: overviewQuery.isPending && overview === undefined,
    source: 'abonnements',
  })

  return (
    <DashboardPage
      eyebrow="Supervision"
      title="Abonnements"
      description="Quotas OpenCode, Cursor et Devin, poids des clés et santé de la collecte. Le feu global suit le maillon le plus faible, jamais une moyenne."
      actions={
        <>
          {overview?.mockMode ? (
            <Badge variant="info">
              <FlaskConical aria-hidden="true" />
              Mode démonstration
            </Badge>
          ) : null}
          <TimeRangePicker
            param="history"
            value={search.history}
            options={PERIOD_OPTIONS}
            label="Période calendaire"
          />
          <UpdateIndicator active={overviewQuery.isFetching || historyQuery.isFetching} />
        </>
      }
    >
      <QueryState
        query={overviewQuery}
        ariaLabel="Chargement des abonnements"
        skeleton={<PageSkeleton cards={3} />}
        staleMessage={
          hasMetrics && anyStale
            ? 'La collecte Prometheus est en retard. Les dernières valeurs connues restent affichées.'
            : null
        }
        emptyTitle="Aucun abonnement"
        emptyDescription="Aucune métrique d’abonnement n’a été reçue."
      >
        {(data) => {
          if (!data.configured) {
            return (
              <div className="space-y-4">
                <StatusBanner tone="info" title="Prometheus n’est pas configuré">
                  Renseignez <code className="font-mono text-[11px]">PROMETHEUS_URL</code> côté
                  serveur (sans <code className="font-mono text-[11px]">/api/v1</code>). En
                  développement, <code className="font-mono text-[11px]">npm run dev:mock</code>{' '}
                  démarre une source déterministe.
                </StatusBanner>
                <EmptyState
                  title="Aucune source de quotas"
                  description="Le tableau de bord reste disponible : les sections se rempliront dès que Prometheus répondra."
                  icon={Database}
                />
              </div>
            )
          }

          const groups = groupOverview(data)
          const hasData =
            data.quotas.length > 0 ||
            data.costs.length > 0 ||
            data.weights.length > 0 ||
            data.spendBuckets.length > 0 ||
            data.acu.length > 0

          return (
            <div className="space-y-5">
              <PartialErrors errors={data.errors} />
              {!hasData ? (
                <EmptyState
                  title="Aucune métrique reçue"
                  description="Prometheus répond, mais les séries ai_usage_* et bifrost_provider_key_weight sont absentes. Vérifiez la collecte des abonnements et des poids."
                  icon={ShieldAlert}
                />
              ) : (
                <SubscriptionSummary overview={data} />
              )}

              <div className="grid items-start gap-5 xl:grid-cols-2">
                {groups.map((group) => (
                  <ProviderCard
                    key={group.slug}
                    group={group}
                    overview={data}
                    className={group.slug === 'opencode' ? 'xl:col-span-2' : undefined}
                  />
                ))}
              </div>

              <QuotaHistoryPanel
                query={historyQuery}
                window={search.window}
                range={search.history}
                hasQuotaForWindow={data.quotas.some((quota) => quota.window === search.window)}
              />
            </div>
          )
        }}
      </QueryState>
    </DashboardPage>
  )
}
