import { createServerFn } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { fetchBillingReport } from '~/lib/billing.server'
import { getPrometheusConfig, PrometheusClient } from '~/lib/prometheus.server'
import type { BillingReport } from '~/lib/types'

function noStore() {
  setResponseHeaders(
    new Headers({
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Cookie, Authorization',
    }),
  )
}

export const getBillingReport = createServerFn({ method: 'GET' }).handler(
  async (): Promise<BillingReport> => {
    noStore()
    const config = getPrometheusConfig()
    const client = config.baseUrl ? new PrometheusClient(config.baseUrl, config.timeoutMs) : null
    const report = await fetchBillingReport(client, config)
    if (report.configured && report.error) throw new Error(report.error)
    return report
  },
)
