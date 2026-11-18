import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'
import { BillingSummary, BillingTables } from '~/components/billing/billing-view'
import { DashboardPage } from '~/components/dashboard-page'
import { usePublishFreshness } from '~/components/freshness'
import { PageSkeleton, QueryState } from '~/components/query-state'
import { StatusBanner } from '~/components/status-banner'
import { TimeRangePicker } from '~/components/time-range-picker'
import { Badge } from '~/components/ui/badge'
import { UpdateIndicator } from '~/components/update-indicator'
import { billingAccountLabel, billingProviderLabel } from '~/lib/billing'
import { normalizeSpendWindow, spendWindowLabel } from '~/lib/dates'
import { PERIOD_OPTIONS } from '~/lib/period-options'
import { billingReportQueryOptions } from '~/lib/queries'
import type { SpendWindow } from '~/lib/types'

interface BillingSearch {
  window: SpendWindow
}

export const Route = createFileRoute('/facturation')({
  validateSearch: (search: Record<string, unknown>): BillingSearch => ({
    window: normalizeSpendWindow(typeof search.window === 'string' ? search.window : undefined),
  }),
  loader: async ({ context }) => {
    const request = context.queryClient.prefetchQuery(billingReportQueryOptions())
    if (typeof window === 'undefined') await request
  },
  head: () => ({
    meta: [{ title: 'Facturation — Pilotage IA' }],
  }),
  component: BillingPage,
})

function BillingPage() {
  const search = Route.useSearch()
  const reportQuery = useQuery(billingReportQueryOptions())
  const report = reportQuery.data
  const failed = report?.sources.filter((source) => !source.success) ?? []
  const partial = report?.sources.filter((source) => source.success && source.partial) ?? []
  const anyStale = Boolean(report?.sources.some((source) => source.stale))

  usePublishFreshness({
    fetchedAt: report?.fetchedAt,
    lastSuccessAt: latestSuccess(report?.sources ?? []),
    stale: anyStale,
    failed: failed.length > 0,
    partial: partial.length > 0,
    loading: reportQuery.isPending && report === undefined,
    source: 'facturation',
  })

  return (
    <DashboardPage
      eyebrow="Dépenses"
      title="Facturation"
      description="Factures Cloudflare et Vercel, estimation catalogue Hetzner, et montants déclarés pour Contabo et OpenCode Go. Les libellés sont des rôles, pas des identifiants."
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
            options={PERIOD_OPTIONS}
            label="Période des charges"
          />
          <UpdateIndicator active={reportQuery.isFetching} />
        </>
      }
    >
      <QueryState
        query={reportQuery}
        ariaLabel="Chargement de la facturation"
        skeleton={<PageSkeleton cards={2} />}
        isEmpty={(data) => data.charges.length === 0 && data.monthly.length === 0}
        emptyTitle="Aucune facturation"
        emptyDescription="L'exporter n'a encore publié ni charge ni prix en cours."
      >
        {(data) => (
          <div className="space-y-5">
            {failed.length > 0 ? (
              <StatusBanner tone="danger" title="Une collecte a échoué">
                {`${failed
                  .map(
                    (source) =>
                      `${billingProviderLabel(source.provider)} · ${billingAccountLabel(source.provider, source.account)}`,
                  )
                  .join(', ')}. Le dernier relevé valide de cette source est conservé.`}
              </StatusBanner>
            ) : null}
            {partial.length > 0 ? (
              <StatusBanner tone="warning" title="Collecte incomplète">
                {`${partial
                  .map(
                    (source) =>
                      `${billingProviderLabel(source.provider)} · ${billingAccountLabel(source.provider, source.account)}`,
                  )
                  .join(', ')}. Une partie de la source n'a pas de prix.`}
              </StatusBanner>
            ) : null}
            <BillingSummary
              charges={data.charges}
              monthly={data.monthly}
              window={search.window}
              now={new Date()}
            />
            <p className="text-muted-foreground text-sm">
              Charges affichées : {spendWindowLabel(search.window).toLowerCase()}.
            </p>
            <BillingTables
              charges={data.charges}
              monthly={data.monthly}
              rates={data.rates}
              window={search.window}
              now={new Date()}
            />
          </div>
        )}
      </QueryState>
    </DashboardPage>
  )
}

function latestSuccess(sources: { lastSuccessAt: number | null }[]): number | null {
  const stamps = sources
    .map((source) => source.lastSuccessAt)
    .filter((value): value is number => value != null)
  if (stamps.length === 0) return null
  return Math.min(...stamps) * 1000
}
