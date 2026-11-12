import { createServerFn } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getPrometheusConfig, PrometheusClient } from '~/lib/prometheus.server'
import { fetchQuotaHistory, fetchSubscriptionsOverview } from '~/lib/subscriptions.server'
import type { QuotaHistory, SubscriptionsOverview } from '~/lib/types'

const historyInput = z.object({
  window: z.enum(['monthly', 'weekly', 'rolling', 'daily']).catch('monthly'),
  range: z.enum(['7d', '30d', '90d']).catch('30d'),
})

function noStore() {
  setResponseHeaders(
    new Headers({
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Cookie, Authorization',
    }),
  )
}

export const getSubscriptionsOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SubscriptionsOverview> => {
    noStore()
    const config = getPrometheusConfig()
    const client = config.baseUrl ? new PrometheusClient(config.baseUrl, config.timeoutMs) : null
    return fetchSubscriptionsOverview(client, config)
  },
)

export const getQuotaHistory = createServerFn({ method: 'GET' })
  .validator(historyInput)
  .handler(async ({ data }): Promise<QuotaHistory> => {
    noStore()
    const config = getPrometheusConfig()
    const client = config.baseUrl ? new PrometheusClient(config.baseUrl, config.timeoutMs) : null
    const history = await fetchQuotaHistory(client, config, data)
    if (history.configured && history.error) throw new Error(history.error)
    return history
  })
