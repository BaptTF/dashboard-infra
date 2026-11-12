import { createServerFn } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getPrometheusConfig, PrometheusClient } from '~/lib/prometheus.server'
import { fetchSpendHistory, fetchSpendReport } from '~/lib/spend.server'
import type { SpendHistory, SpendReport } from '~/lib/types'

const windowInput = z.object({
  window: z.enum(['1m', '3m', '6m', '1y', 'all']).catch('1m'),
})

function noStore() {
  setResponseHeaders(
    new Headers({
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Cookie, Authorization',
    }),
  )
}

export const getConsumptionReport = createServerFn({ method: 'GET' })
  .validator(windowInput)
  .handler(async ({ data }): Promise<SpendReport> => {
    noStore()
    const config = getPrometheusConfig()
    const client = config.baseUrl ? new PrometheusClient(config.baseUrl, config.timeoutMs) : null
    const report = await fetchSpendReport(client, config, data.window)
    if (report.configured && report.error) throw new Error(report.error)
    return report
  })

export const getConsumptionHistory = createServerFn({ method: 'GET' })
  .validator(windowInput)
  .handler(async ({ data }): Promise<SpendHistory> => {
    noStore()
    const config = getPrometheusConfig()
    const client = config.baseUrl ? new PrometheusClient(config.baseUrl, config.timeoutMs) : null
    const history = await fetchSpendHistory(client, config, data.window)
    if (history.configured && history.error) throw new Error(history.error)
    return history
  })
