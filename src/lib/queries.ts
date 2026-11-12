import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { getConsumptionHistory, getConsumptionReport } from '~/functions/consumption.functions'
import { getQuotaHistory, getSubscriptionsOverview } from '~/functions/subscriptions.functions'
import type { HistoryRange, QuotaWindow, SpendWindow } from './types'

export const subscriptionOverviewQueryOptions = () =>
  queryOptions({
    queryKey: ['subscriptions', 'overview'],
    queryFn: () => getSubscriptionsOverview(),
    staleTime: 30_000,
  })

export const quotaHistoryQueryOptions = (window: QuotaWindow, range: HistoryRange) =>
  queryOptions({
    queryKey: ['subscriptions', 'history', window, range],
    queryFn: () => getQuotaHistory({ data: { window, range } }),
    staleTime: 60_000,
    // Changing a filter keeps the previous curve on screen while the next
    // request runs, instead of flashing an empty panel.
    placeholderData: keepPreviousData,
  })

export const consumptionReportQueryOptions = (window: SpendWindow) =>
  queryOptions({
    queryKey: ['consumption', 'report', window],
    queryFn: () => getConsumptionReport({ data: { window } }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })

export const consumptionHistoryQueryOptions = (window: SpendWindow) =>
  queryOptions({
    queryKey: ['consumption', 'history', window],
    queryFn: () => getConsumptionHistory({ data: { window } }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
