import { describe, expect, it } from 'vitest'
import {
  MOCK_SCENARIOS,
  createMockModel,
  handlePrometheusRequest,
  type MockResponse,
  type MockScenario,
} from '../mock/fixtures'

const now = new Date('2026-11-12T10:00:00Z')

function instant(query: string, scenario: MockScenario = 'nominal'): MockResponse {
  return handlePrometheusRequest('/api/v1/query', new URLSearchParams({ query }), scenario, now)
}

function vector(response: MockResponse) {
  const body = response.body as {
    data: { result: { metric: Record<string, string>; value: [number, string] }[] }
  }
  return body.data.result
}

function matrix(response: MockResponse) {
  const body = response.body as {
    data: { result: { metric: Record<string, string>; values: [number, string][] }[] }
  }
  return body.data.result
}

describe('deterministic Prometheus mock', () => {
  it('covers every documented scenario', () => {
    expect(MOCK_SCENARIOS).toEqual([
      'nominal',
      'empty',
      'stale',
      'partial',
      'thresholds',
      'zero-weight',
      'longnames',
    ])
  })

  it('serves nominal subscriptions, weights and collection', () => {
    expect(vector(instant('ai_usage_quota_used_ratio')).length).toBeGreaterThan(5)
    const weights = vector(instant('bifrost_provider_key_weight'))
    expect(
      weights.some((row) => row.metric.subscription === 'Main' && row.metric.key === 'main-02'),
    ).toBe(true)
    expect(vector(instant('ai_usage_collection_success')).length).toBe(6)
    const weightsStatus = vector(instant('bifrost_weight_sidecar_observation_success'))
    expect(weightsStatus[0]?.value[1]).toBe('1')
  })

  it('follows the real exporter contract for windows, costs and subscriptions', () => {
    const quotas = vector(instant('ai_usage_quota_used_ratio'))
    const windows = new Set(quotas.map((row) => row.metric.window))
    expect(windows).toEqual(new Set(['monthly', 'weekly', 'rolling_5h', 'daily']))
    expect(
      quotas.some((row) => row.metric.provider === 'devin' && row.metric.window === 'monthly'),
    ).toBe(false)
    expect(
      quotas.some(
        (row) => row.metric.provider === 'opencode' && row.metric.subscription === 'main',
      ),
    ).toBe(true)
    expect(
      quotas.some((row) => row.metric.provider === 'cursor' && row.metric.quota === 'on_demand'),
    ).toBe(true)

    // rolling_5h never carries elapsed/dry days, exactly like the exporter.
    const elapsed = vector(instant('ai_usage_quota_elapsed_ratio'))
    const dryDays = vector(instant('ai_usage_quota_dry_days'))
    expect(elapsed.some((row) => row.metric.window === 'rolling_5h')).toBe(false)
    expect(dryDays.some((row) => row.metric.window === 'rolling_5h')).toBe(false)
    expect(dryDays.length).toBeGreaterThan(0)

    // Only a truly known monthly cost is published: Cursor at 20 USD.
    const costs = vector(instant('ai_usage_subscription_monthly_cost_usd'))
    expect(costs).toHaveLength(1)
    expect(costs[0]?.metric).toMatchObject({ provider: 'cursor', subscription: 'default' })
    expect(Number(costs[0]?.value[1])).toBe(20)

    // Collection is per subscription; one OpenCode key fails, the others stay healthy.
    const success = vector(instant('ai_usage_collection_success'))
    expect(success).toHaveLength(6)
    expect(success.every((row) => typeof row.metric.subscription === 'string')).toBe(true)
    expect(
      success
        .filter((row) => row.metric.provider === 'opencode')
        .map((row) => row.metric.subscription),
    ).toEqual(['main', 'r', 'a', 'n'])
    expect(success.find((row) => row.metric.subscription === 'r')?.value[1]).toBe('0')
    expect(success.find((row) => row.metric.subscription === 'main')?.value[1]).toBe('1')

    // Devin ACU products are the real all/devin/cascade/terminal set, with no spend.
    const acu = vector(instant('ai_usage_acu_consumed'))
    expect(acu.map((row) => row.metric.product).sort()).toEqual([
      'all',
      'cascade',
      'devin',
      'terminal',
    ])
    expect(
      vector(instant('ai_usage_spend_usd')).every((row) => row.metric.provider === 'cursor'),
    ).toBe(true)
  })

  it('serves rolling_5h and daily history without filtering them', () => {
    const end = Math.floor(now.getTime() / 1000)
    const start = end - 3600
    for (const window of ['rolling_5h', 'daily']) {
      const history = handlePrometheusRequest(
        '/api/v1/query_range',
        new URLSearchParams({
          query: `ai_usage_quota_used_ratio{window="${window}"}`,
          start: String(start),
          end: String(end),
          step: '300',
        }),
        'nominal',
        now,
      )
      const rows = matrix(history)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((row) => row.metric.window === window)).toBe(true)
    }
  })

  it('serves Bifrost counters scaled by the requested range', () => {
    const short = vector(
      instant('increase(bifrost_cost_total{virtual_key_name!~"hermes"}[86400s])'),
    )
    const long = vector(
      instant('increase(bifrost_cost_total{virtual_key_name!~"hermes"}[2592000s])'),
    )
    expect(short).toHaveLength(4)
    expect(Number(long[0]?.value[1])).toBeGreaterThan(Number(short[0]?.value[1]))
  })

  it('returns Hermes window gauges and Bifrost-shaped agent rows', () => {
    const leo = vector(instant('hermes_window_cost_usd{agent="leo",window="1m"}'))
    expect(leo.some((row) => row.metric.user === 'Camille')).toBe(true)
    const window = vector(instant('bifrost_window_cost_usd{window="1m"}'))
    expect(window.some((row) => row.metric.virtual_key_name === 'hermes-leo')).toBe(true)
    const tokens = vector(instant('bifrost_window_tokens{window="1m"}'))
    expect(tokens.some((row) => row.metric.type === 'cache_read')).toBe(true)
  })

  it('returns empty results for the empty scenario', () => {
    expect(vector(instant('ai_usage_quota_used_ratio', 'empty'))).toEqual([])
    expect(vector(instant('bifrost_provider_key_weight', 'empty'))).toEqual([])
    const history = handlePrometheusRequest(
      '/api/v1/query_range',
      new URLSearchParams({
        query: 'ai_usage_quota_used_ratio{window="monthly"}',
        start: '0',
        end: '100',
        step: '10',
      }),
      'empty',
      now,
    )
    expect(matrix(history)).toEqual([])
  })

  it('exposes stale collection and weights without erasing values', () => {
    const success = vector(instant('ai_usage_collection_success', 'stale'))
    expect(success.every((row) => row.value[1] === '0')).toBe(true)
    const weights = vector(instant('bifrost_provider_key_weight', 'stale'))
    expect(weights.length).toBeGreaterThan(0)
    const status = vector(instant('bifrost_weight_sidecar_observation_success', 'stale'))
    expect(status[0]?.value[1]).toBe('0')
  })

  it('fails only the spend query in the partial scenario', () => {
    expect(instant('ai_usage_spend_usd', 'partial').status).toBe(500)
    expect(instant('ai_usage_quota_used_ratio', 'partial').status).toBe(200)
    const collection = vector(instant('ai_usage_collection_partial', 'partial'))
    expect(collection.some((row) => row.value[1] === '1')).toBe(true)
  })

  it('produces threshold and zero-weight fixtures', () => {
    const quotas = vector(instant('ai_usage_quota_used_ratio', 'thresholds'))
    expect(quotas.some((row) => Number(row.value[1]) >= 0.95)).toBe(true)
    const weights = vector(instant('bifrost_provider_key_weight', 'zero-weight'))
    expect(weights.every((row) => Number(row.value[1]) === 0)).toBe(true)
  })

  it('produces long names and starts history at deployment', () => {
    const model = createMockModel('longnames', now)
    const quotas = vector(instant('ai_usage_quota_used_ratio', 'longnames'))
    expect(quotas.some((row) => (row.metric.subscription?.length ?? 0) > 40)).toBe(true)
    const start = Math.floor(model.deploymentAt.getTime() / 1000) - 10 * 86400
    const end = Math.floor(now.getTime() / 1000)
    const history = handlePrometheusRequest(
      '/api/v1/query_range',
      new URLSearchParams({
        query: 'ai_usage_quota_used_ratio{window="monthly"}',
        start: String(start),
        end: String(end),
        step: '3600',
      }),
      'nominal',
      now,
    )
    const rows = matrix(history)
    expect(rows.length).toBeGreaterThan(0)
    const firstTimestamp = rows[0]?.values[0]?.[0] ?? 0
    expect(firstTimestamp).toBeGreaterThanOrEqual(model.deploymentAt.getTime() / 1000)
    expect(firstTimestamp).toBeGreaterThan(start)
  })
})
