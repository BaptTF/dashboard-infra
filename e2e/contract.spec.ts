import { expect, test } from '@playwright/test'

const MOCK = 'http://127.0.0.1:9190'

interface VectorRow {
  metric: Record<string, string>
  value: [number, string]
}

interface VectorBody {
  data: { result: VectorRow[] }
}

interface MatrixBody {
  data: { result: { metric: Record<string, string>; values: [number, string][] }[] }
}

test('the mock serves the real exporter window and subscription labels', async ({ request }) => {
  const quotasResponse = await request.get(`${MOCK}/api/v1/query`, {
    params: { query: 'ai_usage_quota_used_ratio' },
  })
  expect(quotasResponse.status()).toBe(200)
  const quotas = ((await quotasResponse.json()) as VectorBody).data.result
  const windows = new Set(quotas.map((row) => row.metric.window))
  expect(windows).toEqual(new Set(['monthly', 'weekly', 'rolling_5h', 'daily']))
  expect(
    quotas.every(
      (row) => typeof row.metric.subscription === 'string' && row.metric.subscription !== '',
    ),
  ).toBe(true)

  const costsResponse = await request.get(`${MOCK}/api/v1/query`, {
    params: { query: 'ai_usage_subscription_monthly_cost_usd' },
  })
  const costs = ((await costsResponse.json()) as VectorBody).data.result
  expect(costs).toHaveLength(1)
  expect(costs[0]?.metric).toMatchObject({ provider: 'cursor', subscription: 'default' })
  expect(costs[0]?.value[1]).toBe('20')

  const collectionResponse = await request.get(`${MOCK}/api/v1/query`, {
    params: { query: 'ai_usage_collection_success' },
  })
  const collection = ((await collectionResponse.json()) as VectorBody).data.result
  expect(collection.every((row) => typeof row.metric.subscription === 'string')).toBe(true)
  expect(
    collection.find((row) => row.metric.provider === 'opencode' && row.metric.subscription === 'r')
      ?.value[1],
  ).toBe('0')
  expect(
    collection.find(
      (row) => row.metric.provider === 'opencode' && row.metric.subscription === 'main',
    )?.value[1],
  ).toBe('1')
})

test('history keeps rolling_5h and daily series', async ({ request }) => {
  const end = Math.floor(Date.now() / 1000)
  const start = end - 3600
  for (const window of ['rolling_5h', 'daily']) {
    const response = await request.get(`${MOCK}/api/v1/query_range`, {
      params: {
        query: `ai_usage_quota_used_ratio{window="${window}"}`,
        start: String(start),
        end: String(end),
        step: '300',
      },
    })
    expect(response.status()).toBe(200)
    const rows = ((await response.json()) as MatrixBody).data.result
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.metric.window === window)).toBe(true)
  }
})
