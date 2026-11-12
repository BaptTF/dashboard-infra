import type { MetricPoint, MetricSample, MetricSeries } from './types'
import { truncate } from './utils'

const MAX_BODY_BYTES = 8 * 1024 * 1024

export interface PrometheusConfig {
  baseUrl: string | null
  configured: boolean
  mockMode: boolean
  timeoutMs: number
}

export class PrometheusError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrometheusError'
  }
}

/**
 * Server-only configuration. The URL never reaches the browser and callers can
 * never choose it. Development and tests fall back to the local deterministic
 * mock; production without PROMETHEUS_URL stays explicitly unconfigured.
 */
export function getPrometheusConfig(env: NodeJS.ProcessEnv = process.env): PrometheusConfig {
  const raw = env.PROMETHEUS_URL?.trim()
  const mockPort = env.MOCK_PORT?.trim() || '9090'
  const mockUrl = env.MOCK_PROMETHEUS_URL?.trim() || `http://127.0.0.1:${mockPort}`
  const mockRequested = env.MOCK_PROMETHEUS === '1' || env.MOCK_PROMETHEUS === 'true'
  const nonProduction = env.NODE_ENV !== 'production'
  if (raw) {
    return {
      baseUrl: raw.replace(/\/+$/, ''),
      configured: true,
      mockMode: mockRequested,
      timeoutMs: Number(env.PROMETHEUS_TIMEOUT_MS) || 10_000,
    }
  }
  if (mockRequested || nonProduction) {
    return {
      baseUrl: mockUrl.replace(/\/+$/, ''),
      configured: true,
      mockMode: true,
      timeoutMs: Number(env.PROMETHEUS_TIMEOUT_MS) || 10_000,
    }
  }
  return { baseUrl: null, configured: false, mockMode: false, timeoutMs: 10_000 }
}

type FetchLike = typeof fetch

export class PrometheusClient {
  readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: FetchLike

  constructor(baseUrl: string, timeoutMs = 10_000, fetchImpl: FetchLike = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): PrometheusClient | null {
    const config = getPrometheusConfig(env)
    if (!config.baseUrl) return null
    return new PrometheusClient(config.baseUrl, config.timeoutMs)
  }

  private async request(path: string, params: URLSearchParams): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`)
    url.search = params.toString()
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erreur réseau'
      throw new PrometheusError(`Prometheus injoignable : ${truncate(reason, 180)}`)
    }

    let body: string
    try {
      body = await response.text()
    } catch {
      throw new PrometheusError('Prometheus : lecture de la réponse impossible')
    }
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      throw new PrometheusError('Prometheus : réponse trop volumineuse')
    }
    if (!response.ok) {
      throw new PrometheusError(
        `Prometheus HTTP ${response.status} : ${truncate(body, 180) || 'sans corps'}`,
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new PrometheusError('Prometheus : réponse JSON invalide')
    }
    if (!isRecord(parsed)) throw new PrometheusError('Prometheus : réponse invalide')
    if (parsed.status !== 'success') {
      const message =
        typeof parsed.error === 'string' && parsed.error.trim() !== ''
          ? parsed.error
          : typeof parsed.status === 'string'
            ? parsed.status
            : 'échec inconnu'
      throw new PrometheusError(`Prometheus : ${truncate(message, 180)}`)
    }
    if (!isRecord(parsed.data)) throw new PrometheusError('Prometheus : données absentes')
    return parsed.data
  }

  async query(promql: string): Promise<MetricSample[]> {
    const data = (await this.request(
      '/api/v1/query',
      new URLSearchParams({ query: promql }),
    )) as Record<string, unknown>
    const resultType = data.resultType
    if (resultType !== 'vector' && resultType !== '') {
      throw new PrometheusError(`Prometheus : résultat ${String(resultType)} inattendu`)
    }
    if (!Array.isArray(data.result)) return []
    const samples: MetricSample[] = []
    for (const row of data.result) {
      if (!isRecord(row)) continue
      const value = parseInstantValue(row.value)
      if (value == null) continue
      samples.push({
        labels: isRecord(row.metric) ? stringRecord(row.metric) : {},
        value,
      })
    }
    return samples
  }

  async queryRange(
    promql: string,
    startSeconds: number,
    endSeconds: number,
    stepSeconds: number,
  ): Promise<MetricSeries[]> {
    if (endSeconds < startSeconds) return []
    const data = (await this.request(
      '/api/v1/query_range',
      new URLSearchParams({
        query: promql,
        start: String(Math.floor(startSeconds)),
        end: String(Math.floor(endSeconds)),
        step: String(Math.max(1, Math.floor(stepSeconds))),
      }),
    )) as Record<string, unknown>
    const resultType = data.resultType
    if (resultType !== 'matrix' && resultType !== '') {
      throw new PrometheusError(`Prometheus : résultat ${String(resultType)} inattendu`)
    }
    if (!Array.isArray(data.result)) return []
    const series: MetricSeries[] = []
    for (const row of data.result) {
      if (!isRecord(row)) continue
      const points = parseRangeValues(row.values)
      if (points.length === 0) continue
      series.push({
        labels: isRecord(row.metric) ? stringRecord(row.metric) : {},
        points,
      })
    }
    return series
  }
}

export async function checkPrometheusReadiness(
  config: PrometheusConfig,
  fetchImpl: FetchLike = fetch,
): Promise<{
  configured: boolean
  ok: boolean
  detail: string
  latencyMs: number | null
}> {
  if (!config.configured || !config.baseUrl) {
    return {
      configured: false,
      ok: true,
      detail: 'PROMETHEUS_URL non configuré : aucune source à vérifier',
      latencyMs: null,
    }
  }
  const started = performance.now()
  try {
    const response = await fetchImpl(new URL(`${config.baseUrl}/-/ready`), {
      signal: AbortSignal.timeout(2_000),
      headers: { Accept: 'text/plain' },
    })
    const latencyMs = Math.round(performance.now() - started)
    return {
      configured: true,
      ok: response.ok,
      detail: response.ok ? 'Prometheus répond /-/ready' : `Prometheus HTTP ${response.status}`,
      latencyMs,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'erreur réseau'
    return {
      configured: true,
      ok: false,
      detail: `Prometheus injoignable : ${truncate(reason, 120)}`,
      latencyMs: Math.round(performance.now() - started),
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry
  }
  return result
}

export function parseNumberString(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return value < 0 ? 0 : value
}

function parseInstantValue(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  return parseNumberString(raw[1])
}

function parseRangeValues(raw: unknown): MetricPoint[] {
  if (!Array.isArray(raw)) return []
  const points: MetricPoint[] = []
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) continue
    const timestamp = Number(entry[0])
    const value = parseNumberString(entry[1])
    if (!Number.isFinite(timestamp) || value == null) continue
    points.push({ timestamp, value })
  }
  points.sort((a, b) => a.timestamp - b.timestamp)
  return points
}
