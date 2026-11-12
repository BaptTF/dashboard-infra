import { describe, expect, it } from 'vitest'
import type { MetricSample, MetricSeries } from '~/lib/types'
import type { PrometheusClient, PrometheusConfig } from '~/lib/prometheus.server'
import { fetchQuotaHistory, fetchSubscriptionsOverview } from '~/lib/subscriptions.server'

const now = new Date('2026-11-12T10:00:00Z')
const config: PrometheusConfig = {
  baseUrl: 'http://prom.test',
  configured: true,
  mockMode: false,
  timeoutMs: 1000,
}

function clientWith(input: {
  query?: (promql: string) => Promise<MetricSample[]>
  queryRange?: (promql: string) => Promise<MetricSeries[]>
}): PrometheusClient {
  return {
    query: input.query ?? (async () => []),
    queryRange: input.queryRange ?? (async () => []),
  } as unknown as PrometheusClient
}

describe('subscriptions overview failure semantics', () => {
  it('throws when every Prometheus query fails so the last good payload is kept', async () => {
    const client = clientWith({
      query: async () => {
        throw new Error('Prometheus injoignable')
      },
    })
    await expect(fetchSubscriptionsOverview(client, config, now)).rejects.toThrow(
      /aucune requête n’a abouti/,
    )
  })

  it('accepts a truly empty Prometheus as a successful empty payload', async () => {
    const overview = await fetchSubscriptionsOverview(clientWith({}), config, now)
    expect(overview.configured).toBe(true)
    expect(overview.errors).toEqual({})
    expect(overview.quotas).toEqual([])
    expect(overview.costs).toEqual([])
    expect(overview.collection).toEqual([])
    expect(overview.fetchedAt).toBe(now.toISOString())
  })

  it('keeps partial results and errors when at least one query answered', async () => {
    const client = clientWith({
      query: async (promql) => {
        if (promql.includes('ai_usage_quota_used_ratio')) throw new Error('quota indisponible')
        if (promql.includes('ai_usage_collection_success')) {
          return [
            {
              labels: { provider: 'opencode', subscription: 'main' },
              value: 1,
            },
            {
              labels: { provider: 'opencode', subscription: 'r' },
              value: 0,
            },
          ]
        }
        return []
      },
    })
    const overview = await fetchSubscriptionsOverview(client, config, now)
    expect(overview.configured).toBe(true)
    expect(overview.errors.quotaUsedRatio).toContain('quota indisponible')
    expect(overview.collection).toHaveLength(2)
    expect(overview.collection.find((entry) => entry.subscription === 'r')?.success).toBe(false)
  })
})

describe('quota history windows', () => {
  it('maps the UI rolling window to rolling_5h and keeps daily history', async () => {
    const calls: string[] = []
    const client = clientWith({
      queryRange: async (promql) => {
        calls.push(promql)
        return [
          {
            labels: {
              provider: 'opencode',
              subscription: 'main',
              window: 'rolling_5h',
              quota: 'total',
            },
            points: [{ timestamp: 1_700_000_000, value: 0.31 }],
          },
          {
            labels: {
              provider: 'devin',
              subscription: 'default',
              window: 'daily',
              quota: 'total',
            },
            points: [{ timestamp: 1_700_000_100, value: 0.46 }],
          },
        ]
      },
    })

    const rolling = await fetchQuotaHistory(
      client,
      config,
      { window: 'rolling', range: '30d' },
      now,
    )
    expect(calls[0]).toBe('ai_usage_quota_used_ratio{window="rolling_5h"}')
    expect(rolling.series.map((series) => series.window).sort()).toEqual(['daily', 'rolling'])
    expect(rolling.firstSampleAt).not.toBeNull()

    const daily = await fetchQuotaHistory(client, config, { window: 'daily', range: '7d' }, now)
    expect(calls[1]).toBe('ai_usage_quota_used_ratio{window="daily"}')
    expect(daily.series.map((series) => series.window).sort()).toEqual(['daily', 'rolling'])
  })
})
