import { describe, expect, it, vi } from 'vitest'
import { PrometheusClient, PrometheusError, getPrometheusConfig } from '~/lib/prometheus.server'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Prometheus client', () => {
  it('parses a vector, clamps negatives and skips invalid values', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            { metric: { a: '1' }, value: [1, '12.5'] },
            { metric: { a: '2' }, value: [1, '-3'] },
            { metric: { a: '3' }, value: [1, 'NaN'] },
            { metric: { a: '4' }, value: [1, 'Inf'] },
            { metric: { a: '5' }, value: [1, 'nope'] },
            { metric: { a: '6' }, value: ['bad'] },
          ],
        },
      }),
    )
    const client = new PrometheusClient('http://prom.test', 1000, fetchMock as typeof fetch)
    const samples = await client.query('up')
    expect(samples).toEqual([
      { labels: { a: '1' }, value: 12.5 },
      { labels: { a: '2' }, value: 0 },
    ])
    const called = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[0] as URL
    expect(called.pathname).toBe('/api/v1/query')
    expect(called.searchParams.get('query')).toBe('up')
  })

  it('parses a matrix and caps the range', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: { subscription: 'Main' },
              values: [
                [20, '0.4'],
                [10, '0.2'],
                [30, 'NaN'],
              ],
            },
          ],
        },
      }),
    )
    const client = new PrometheusClient('http://prom.test', 1000, fetchMock as typeof fetch)
    const series = await client.queryRange('q', 0, 100, 10)
    expect(series[0]?.points).toEqual([
      { timestamp: 10, value: 0.2 },
      { timestamp: 20, value: 0.4 },
    ])
    const called = (fetchMock.mock.calls[0] as unknown[] | undefined)?.[0] as URL
    expect(called.searchParams.get('start')).toBe('0')
    expect(called.searchParams.get('step')).toBe('10')
    expect(await client.queryRange('q', 100, 0, 10)).toEqual([])
  })

  it('reports Prometheus status errors and HTTP errors', async () => {
    const statusClient = new PrometheusClient('http://prom.test', 1000, (async () =>
      jsonResponse({ status: 'error', error: 'parse error' })) as typeof fetch)
    await expect(statusClient.query('bad')).rejects.toThrow('parse error')
    await expect(statusClient.query('bad')).rejects.toBeInstanceOf(PrometheusError)

    const httpClient = new PrometheusClient(
      'http://prom.test',
      1000,
      (async () => new Response('boom', { status: 500 })) as typeof fetch,
    )
    await expect(httpClient.query('q')).rejects.toThrow('Prometheus HTTP 500')
  })

  it('rejects invalid JSON and unexpected result types', async () => {
    const invalid = new PrometheusClient(
      'http://prom.test',
      1000,
      (async () => new Response('not-json')) as typeof fetch,
    )
    await expect(invalid.query('q')).rejects.toThrow('JSON invalide')

    const scalar = new PrometheusClient('http://prom.test', 1000, (async () =>
      jsonResponse({
        status: 'success',
        data: { resultType: 'scalar', result: [] },
      })) as typeof fetch)
    await expect(scalar.query('q')).rejects.toThrow('inattendu')
  })

  it('keeps mock mode limited to non-production unless explicitly requested', () => {
    expect(getPrometheusConfig({ NODE_ENV: 'production' })).toMatchObject({
      configured: false,
      baseUrl: null,
    })
    expect(getPrometheusConfig({ NODE_ENV: 'development' })).toMatchObject({
      configured: true,
      mockMode: true,
    })
    expect(
      getPrometheusConfig({
        NODE_ENV: 'production',
        PROMETHEUS_URL: 'http://prometheus:9090/',
      }),
    ).toMatchObject({ configured: true, mockMode: false, baseUrl: 'http://prometheus:9090' })
    expect(getPrometheusConfig({ NODE_ENV: 'production', MOCK_PROMETHEUS: '1' })).toMatchObject({
      mockMode: true,
    })
  })
})
