import { historyRangeStart, normalizeHistoryRange, normalizeQuotaWindow } from './dates'
import {
  assembleAcu,
  assembleAcuCycles,
  assembleCollection,
  assembleCosts,
  assembleQuotas,
  assembleSpendBuckets,
  assembleWeights,
  assembleWeightStatus,
  buildSubscriptionQueries,
  mergeQuotaHistorySeries,
  parseQuotaWindowLabel,
  quotaHistoryQuery,
  type SubscriptionMetricKey,
} from './subscriptions'
import type { PrometheusConfig, PrometheusClient } from './prometheus.server'
import type {
  HistoryRange,
  MetricSample,
  QuotaHistory,
  QuotaHistorySeries,
  QuotaWindow,
  SubscriptionsOverview,
} from './types'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur Prometheus inconnue'
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function collectionStaleSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.COLLECTION_STALE_SECONDS, 15 * 60)
}

export function weightStaleSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.WEIGHT_STALE_SECONDS, 10 * 60)
}

export async function fetchSubscriptionsOverview(
  client: PrometheusClient | null,
  config: PrometheusConfig,
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<SubscriptionsOverview> {
  const empty: SubscriptionsOverview = {
    configured: config.configured,
    mockMode: config.mockMode,
    fetchedAt: now.toISOString(),
    quotas: [],
    costs: [],
    spendBuckets: [],
    acu: [],
    acuCycles: [],
    weights: [],
    collection: [],
    weightStatus: {
      success: null,
      lastObservationAt: null,
      stale: true,
      thresholdSeconds: weightStaleSeconds(env),
    },
    errors: {},
  }
  if (!client || !config.configured) return empty

  const queries = buildSubscriptionQueries()
  const keys = Object.keys(queries) as SubscriptionMetricKey[]
  const settled = await Promise.allSettled(keys.map((key) => client.query(queries[key])))
  const samples = {} as Record<SubscriptionMetricKey, MetricSample[]>
  const errors: Record<string, string> = {}
  let fulfilled = 0

  settled.forEach((result, index) => {
    const key = keys[index]
    if (!key) return
    if (result.status === 'fulfilled') {
      fulfilled += 1
      samples[key] = result.value
    } else {
      samples[key] = []
      errors[key] = errorMessage(result.reason)
    }
  })

  // An unreachable Prometheus must never be cached as an honest empty payload:
  // that would erase the last good overview. Partial failures stay usable.
  if (fulfilled === 0) {
    const detail = Object.values(errors)[0]
    throw new Error(
      detail
        ? `Prometheus : aucune requête n’a abouti (${detail})`
        : 'Prometheus : aucune requête n’a abouti',
    )
  }

  const quotas = assembleQuotas({
    used: samples.quotaUsedRatio,
    reset: samples.quotaResetTimestamp,
    elapsed: samples.quotaElapsedRatio,
    dryDays: samples.quotaDryDays,
    severity: samples.quotaBudgetSeverity,
  })
  const costs = assembleCosts(samples.subscriptionMonthlyCost)
  const spendBuckets = assembleSpendBuckets(samples.spend, samples.spendLimit)
  const acu = assembleAcu(samples.acuConsumed)
  const acuCycles = assembleAcuCycles(samples.acuCycleStart, samples.acuCycleReset)
  const weights = assembleWeights(samples.keyWeight)
  const collection = assembleCollection(
    {
      success: samples.collectionSuccess,
      partial: samples.collectionPartial,
      lastSuccess: samples.collectionLastSuccess,
      duration: samples.collectionDuration,
    },
    now.getTime(),
    collectionStaleSeconds(env),
  )
  const weightStatus = assembleWeightStatus(
    samples.weightObservationSuccess,
    samples.weightLastObservation,
    now.getTime(),
    weightStaleSeconds(env),
  )

  return {
    configured: true,
    mockMode: config.mockMode,
    fetchedAt: now.toISOString(),
    quotas,
    costs,
    spendBuckets,
    acu,
    acuCycles,
    weights,
    collection,
    weightStatus,
    errors,
  }
}

export function historyStepSeconds(range: HistoryRange): number {
  switch (range) {
    case '7d':
      return 15 * 60
    case '90d':
      return 3 * 60 * 60
    default:
      return 60 * 60
  }
}

function historyWindow(raw: string): QuotaWindow | null {
  return parseQuotaWindowLabel(raw)
}

export async function fetchQuotaHistory(
  client: PrometheusClient | null,
  config: PrometheusConfig,
  input: { window?: string; range?: string },
  now = new Date(),
): Promise<QuotaHistory> {
  const window = normalizeQuotaWindow(input.window)
  const range = normalizeHistoryRange(input.range)
  const from = historyRangeStart(now, range)
  const stepSeconds = historyStepSeconds(range)
  const base: QuotaHistory = {
    configured: config.configured,
    mockMode: config.mockMode,
    from: from.toISOString(),
    to: now.toISOString(),
    stepSeconds,
    window,
    series: [],
    firstSampleAt: null,
  }
  if (!client || !config.configured) return base

  try {
    const rows = await client.queryRange(
      quotaHistoryQuery(window),
      Math.floor(from.getTime() / 1000),
      Math.floor(now.getTime() / 1000),
      stepSeconds,
    )
    const raw: QuotaHistorySeries[] = []
    for (const row of rows) {
      const rowWindow = historyWindow(row.labels.window ?? '')
      if (!rowWindow) continue
      const points = row.points.filter((point) => point.value >= 0)
      if (points.length === 0) continue
      raw.push({
        provider: (row.labels.provider ?? '').trim() || 'inconnu',
        subscription: (row.labels.subscription ?? '').trim() || 'Abonnement inconnu',
        window: rowWindow,
        quota: (row.labels.quota ?? '').trim() || 'quota',
        points,
      })
    }
    const series = mergeQuotaHistorySeries(raw)
    let first = Number.POSITIVE_INFINITY
    for (const entry of series) {
      const firstPoint = entry.points[0]
      if (firstPoint && firstPoint.timestamp < first) first = firstPoint.timestamp
    }
    return {
      ...base,
      series,
      firstSampleAt: Number.isFinite(first) ? new Date(first * 1000).toISOString() : null,
    }
  } catch (error) {
    return { ...base, error: errorMessage(error) }
  }
}
