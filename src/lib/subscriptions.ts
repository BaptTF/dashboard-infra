import { isOlderThan } from './dates'
import { subscriptionJoinKey } from './providers'
import type {
  AcuCycle,
  AcuUsage,
  CollectionStatus,
  KeyWeight,
  MetricSample,
  QuotaWindow,
  Severity,
  SpendBucket,
  SubscriptionCost,
  SubscriptionQuota,
  WeightStatus,
} from './types'

/** Drop scrape identity so two Prometheus replicas collapse before comparison. */
export const SUBSCRIPTION_DEDUPE = `max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)`
/** Same collapse, but a single failing replica wins so an outage is never hidden. */
export const SUBSCRIPTION_DEDUPE_MIN = `min without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)`

export const SUBSCRIPTION_METRICS = {
  quotaUsedRatio: 'ai_usage_quota_used_ratio',
  quotaResetTimestamp: 'ai_usage_quota_reset_timestamp_seconds',
  quotaElapsedRatio: 'ai_usage_quota_elapsed_ratio',
  quotaDryDays: 'ai_usage_quota_dry_days',
  quotaBudgetSeverity: 'ai_usage_quota_budget_severity',
  subscriptionMonthlyCost: 'ai_usage_subscription_monthly_cost_usd',
  spend: 'ai_usage_spend_usd',
  spendLimit: 'ai_usage_spend_limit_usd',
  acuConsumed: 'ai_usage_acu_consumed',
  acuCycleStart: 'ai_usage_acu_cycle_start_timestamp_seconds',
  acuCycleReset: 'ai_usage_acu_cycle_reset_timestamp_seconds',
  collectionSuccess: 'ai_usage_collection_success',
  collectionPartial: 'ai_usage_collection_partial',
  collectionLastSuccess: 'ai_usage_collection_last_success_timestamp_seconds',
  collectionDuration: 'ai_usage_collection_duration_seconds',
  keyWeight: 'bifrost_provider_key_weight',
  weightObservationSuccess: 'bifrost_weight_sidecar_observation_success',
  weightLastObservation: 'bifrost_weight_sidecar_last_observation_timestamp_seconds',
} as const

export type SubscriptionMetricKey = keyof typeof SUBSCRIPTION_METRICS

export function deduped(metric: string): string {
  return `${SUBSCRIPTION_DEDUPE}(${metric})`
}

export function dedupedMin(metric: string): string {
  return `${SUBSCRIPTION_DEDUPE_MIN}(${metric})`
}

/**
 * Fixed PromQL only. Each query targets one documented metric and never takes
 * text from the browser.
 */
export function buildSubscriptionQueries(): Record<SubscriptionMetricKey, string> {
  const m = SUBSCRIPTION_METRICS
  return {
    quotaUsedRatio: deduped(m.quotaUsedRatio),
    quotaResetTimestamp: deduped(m.quotaResetTimestamp),
    quotaElapsedRatio: deduped(m.quotaElapsedRatio),
    quotaDryDays: deduped(m.quotaDryDays),
    quotaBudgetSeverity: deduped(m.quotaBudgetSeverity),
    subscriptionMonthlyCost: deduped(m.subscriptionMonthlyCost),
    spend: deduped(m.spend),
    spendLimit: deduped(m.spendLimit),
    acuConsumed: deduped(m.acuConsumed),
    acuCycleStart: deduped(m.acuCycleStart),
    acuCycleReset: deduped(m.acuCycleReset),
    collectionSuccess: dedupedMin(m.collectionSuccess),
    collectionPartial: deduped(m.collectionPartial),
    collectionLastSuccess: deduped(m.collectionLastSuccess),
    collectionDuration: deduped(m.collectionDuration),
    keyWeight: deduped(m.keyWeight),
    weightObservationSuccess: deduped(m.weightObservationSuccess),
    weightLastObservation: deduped(m.weightLastObservation),
  }
}

export const QUOTA_HISTORY_METRIC = SUBSCRIPTION_METRICS.quotaUsedRatio

/**
 * The UI keeps short window names; the exporter publishes `rolling_5h` for the
 * five-hour window and `daily` for Devin's 24-hour window. No window is ever
 * filtered out of history, only translated to the real label.
 */
export function quotaWindowMetricValue(window: QuotaWindow): string {
  return window === 'rolling' ? 'rolling_5h' : window
}

export function parseQuotaWindowLabel(value: string | null | undefined): QuotaWindow | null {
  switch ((value ?? '').trim()) {
    case 'monthly':
      return 'monthly'
    case 'weekly':
      return 'weekly'
    case 'daily':
      return 'daily'
    case 'rolling_5h':
    case 'rolling':
      return 'rolling'
    default:
      return null
  }
}

export function quotaHistoryQuery(window: QuotaWindow): string {
  return `${QUOTA_HISTORY_METRIC}{window="${quotaWindowMetricValue(window)}"}`
}

function label(sample: MetricSample, name: string): string {
  return (sample.labels[name] ?? '').trim()
}

function subscriptionName(sample: MetricSample): string {
  return label(sample, 'subscription') || 'Abonnement inconnu'
}

function providerName(sample: MetricSample): string {
  return label(sample, 'provider') || 'inconnu'
}

function quotaWindow(sample: MetricSample): QuotaWindow | null {
  return parseQuotaWindowLabel(label(sample, 'window'))
}

function quotaKey(sample: MetricSample): string {
  return [
    providerName(sample),
    subscriptionName(sample),
    quotaWindow(sample) ?? label(sample, 'window'),
    label(sample, 'quota'),
  ].join('\u0000')
}

function parseSeverity(value: number | undefined): Severity | null {
  if (value == null || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded === 0 || rounded === 1 || rounded === 2 ? rounded : null
}

function maxSamples(samples: MetricSample[]): Map<string, MetricSample> {
  const result = new Map<string, MetricSample>()
  for (const sample of samples) {
    const key = quotaKey(sample)
    const current = result.get(key)
    if (!current || sample.value > current.value) result.set(key, sample)
  }
  return result
}

export function assembleQuotas(input: {
  used: MetricSample[]
  reset: MetricSample[]
  elapsed: MetricSample[]
  dryDays: MetricSample[]
  severity: MetricSample[]
}): SubscriptionQuota[] {
  const used = maxSamples(input.used)
  const reset = maxSamples(input.reset)
  const elapsed = maxSamples(input.elapsed)
  const dryDays = maxSamples(input.dryDays)
  const severity = maxSamples(input.severity)
  const keys = new Set([
    ...used.keys(),
    ...reset.keys(),
    ...elapsed.keys(),
    ...dryDays.keys(),
    ...severity.keys(),
  ])

  const quotas: SubscriptionQuota[] = []
  for (const key of keys) {
    const sample =
      used.get(key) ?? reset.get(key) ?? elapsed.get(key) ?? dryDays.get(key) ?? severity.get(key)
    if (!sample) continue
    const window = quotaWindow(sample)
    if (!window) continue
    // The 5 h rolling window has no period start: never invent elapsed or dry days.
    const rolling = window === 'rolling'
    quotas.push({
      provider: providerName(sample),
      subscription: subscriptionName(sample),
      window,
      quota: label(sample, 'quota') || 'quota',
      usedRatio: used.get(key)?.value ?? null,
      resetAt: reset.get(key)?.value ?? null,
      elapsedRatio: rolling ? null : (elapsed.get(key)?.value ?? null),
      dryDays: rolling ? null : (dryDays.get(key)?.value ?? null),
      severity: parseSeverity(severity.get(key)?.value),
    })
  }
  return quotas
}

export function assembleCosts(samples: MetricSample[]): SubscriptionCost[] {
  const byKey = new Map<string, SubscriptionCost>()
  for (const sample of samples) {
    const provider = providerName(sample)
    const subscription = subscriptionName(sample)
    const key = `${provider}\u0000${subscription}`
    const current = byKey.get(key)
    if (!current || sample.value > current.monthlyCostUsd) {
      byKey.set(key, { provider, subscription, monthlyCostUsd: sample.value })
    }
  }
  return [...byKey.values()]
}

function bucketKey(provider: string, subscription: string, bucket: string) {
  return `${provider}\u0000${subscription}\u0000${bucket}`
}

export function assembleSpendBuckets(
  spendSamples: MetricSample[],
  limitSamples: MetricSample[],
): SpendBucket[] {
  const buckets = new Map<string, SpendBucket>()
  const limits = new Map<string, number>()

  for (const sample of spendSamples) {
    const provider = providerName(sample)
    const subscription = subscriptionName(sample)
    const bucket = label(sample, 'bucket') || 'hors forfait'
    const key = bucketKey(provider, subscription, bucket)
    const current = buckets.get(key)
    if (!current || sample.value > current.spendUsd) {
      buckets.set(key, {
        provider,
        subscription,
        bucket,
        spendUsd: sample.value,
        limitUsd: null,
        usedRatio: null,
      })
    }
  }

  for (const sample of limitSamples) {
    const provider = providerName(sample)
    const subscription = subscriptionName(sample)
    const bucket = label(sample, 'bucket') || 'hors forfait'
    const exactKey = bucketKey(provider, subscription, bucket)
    const current = limits.get(exactKey)
    if (current == null || sample.value > current) limits.set(exactKey, sample.value)
    const looseKey = bucketKey('', '', bucket)
    const loose = limits.get(looseKey)
    if (loose == null || sample.value > loose) limits.set(looseKey, sample.value)
  }

  for (const [key, bucket] of buckets) {
    const limit =
      limits.get(bucketKey(bucket.provider, bucket.subscription, bucket.bucket)) ??
      limits.get(bucketKey('', '', bucket.bucket)) ??
      null
    bucket.limitUsd = limit
    bucket.usedRatio = limit != null && limit > 0 ? bucket.spendUsd / limit : null
    buckets.set(key, bucket)
  }

  return [...buckets.values()]
}

export function assembleAcu(samples: MetricSample[]): AcuUsage[] {
  const entries = new Map<string, AcuUsage>()
  for (const sample of samples) {
    const provider = providerName(sample)
    const subscription = subscriptionName(sample)
    const product = label(sample, 'product') || 'Produit inconnu'
    const key = `${provider}\u0000${subscription}\u0000${product}`
    const current = entries.get(key)
    if (!current || sample.value > current.consumed) {
      entries.set(key, { provider, subscription, product, consumed: sample.value })
    }
  }
  return [...entries.values()]
}

export function assembleAcuCycles(
  startSamples: MetricSample[],
  resetSamples: MetricSample[],
): AcuCycle[] {
  const entries = new Map<string, AcuCycle>()
  const keyFor = (sample: MetricSample) =>
    subscriptionJoinKey(providerName(sample), subscriptionName(sample))

  for (const sample of startSamples) {
    const key = keyFor(sample)
    const current = entries.get(key)
    entries.set(key, {
      provider: providerName(sample),
      subscription: subscriptionName(sample),
      startAt: current?.startAt != null ? Math.max(current.startAt, sample.value) : sample.value,
      resetAt: current?.resetAt ?? null,
    })
  }
  for (const sample of resetSamples) {
    const key = keyFor(sample)
    const current = entries.get(key)
    entries.set(key, {
      provider: current?.provider ?? providerName(sample),
      subscription: current?.subscription ?? subscriptionName(sample),
      startAt: current?.startAt ?? null,
      resetAt: current?.resetAt != null ? Math.max(current.resetAt, sample.value) : sample.value,
    })
  }
  return [...entries.values()]
}

export function assembleWeights(samples: MetricSample[]): KeyWeight[] {
  const entries = new Map<string, KeyWeight>()
  for (const sample of samples) {
    const provider = label(sample, 'provider') || 'inconnu'
    const subscription = label(sample, 'subscription') || 'Abonnement inconnu'
    const key = label(sample, 'key') || 'Clé inconnue'
    const id = `${provider}\u0000${subscription}\u0000${key}`
    const current = entries.get(id)
    if (!current || sample.value > current.weight) {
      entries.set(id, { provider, subscription, key, weight: sample.value })
    }
  }
  return [...entries.values()]
}

function boolGauge(value: number | undefined): boolean | null {
  if (value == null) return null
  if (value >= 1) return true
  if (value === 0) return false
  return null
}

/**
 * Collection health is per subscription, never per provider: OpenCode publishes
 * one key per subscription, so one failing key must not mask the healthy ones.
 */
export function assembleCollection(
  input: {
    success: MetricSample[]
    partial: MetricSample[]
    lastSuccess: MetricSample[]
    duration: MetricSample[]
  },
  nowMs: number,
  staleSeconds: number,
): CollectionStatus[] {
  interface Accumulator {
    provider: string
    subscription: string
    success: number[]
    partial: number[]
    lastSuccessAt: number | null
    durationSeconds: number | null
  }

  const entries = new Map<string, Accumulator>()
  const ensure = (sample: MetricSample): Accumulator => {
    const key = subscriptionJoinKey(label(sample, 'provider'), label(sample, 'subscription'))
    let entry = entries.get(key)
    if (!entry) {
      entry = {
        provider: providerName(sample),
        subscription: subscriptionName(sample),
        success: [],
        partial: [],
        lastSuccessAt: null,
        durationSeconds: null,
      }
      entries.set(key, entry)
    }
    return entry
  }

  for (const sample of input.success) ensure(sample).success.push(sample.value)
  for (const sample of input.partial) ensure(sample).partial.push(sample.value)
  for (const sample of input.lastSuccess) {
    const entry = ensure(sample)
    entry.lastSuccessAt =
      entry.lastSuccessAt == null ? sample.value : Math.max(entry.lastSuccessAt, sample.value)
  }
  for (const sample of input.duration) {
    const entry = ensure(sample)
    entry.durationSeconds =
      entry.durationSeconds == null ? sample.value : Math.max(entry.durationSeconds, sample.value)
  }

  /** Success is disadvantaged on any doubt: one zero replicas wins over a one. */
  const combineSuccess = (values: number[]): boolean | null => {
    if (values.length === 0) return null
    let unknown = false
    for (const value of values) {
      if (value >= 1) continue
      if (value === 0) return false
      unknown = true
    }
    return unknown ? null : true
  }

  /** Partial is the opposite: a degraded secondary source must stay visible. */
  const combinePartial = (values: number[]): boolean | null => {
    if (values.length === 0) return null
    let unknown = false
    for (const value of values) {
      if (value >= 1) return true
      if (value !== 0) unknown = true
    }
    return unknown ? null : false
  }

  return [...entries.values()]
    .map((entry) => ({
      provider: entry.provider,
      subscription: entry.subscription,
      success: combineSuccess(entry.success),
      partial: combinePartial(entry.partial),
      lastSuccessAt: entry.lastSuccessAt,
      durationSeconds: entry.durationSeconds,
      stale: isOlderThan(entry.lastSuccessAt, staleSeconds, nowMs),
    }))
    .sort(
      (a, b) =>
        a.provider.localeCompare(b.provider, 'fr') ||
        a.subscription.localeCompare(b.subscription, 'fr'),
    )
}

export function assembleWeightStatus(
  successSamples: MetricSample[],
  lastObservationSamples: MetricSample[],
  nowMs: number,
  thresholdSeconds: number,
): WeightStatus {
  const successValue = successSamples.reduce<number | null>(
    (max, sample) => (max == null || sample.value > max ? sample.value : max),
    null,
  )
  const lastObservationAt = lastObservationSamples.reduce<number | null>(
    (max, sample) => (max == null || sample.value > max ? sample.value : max),
    null,
  )
  const success = boolGauge(successValue ?? undefined)
  return {
    success,
    lastObservationAt,
    stale: success !== true || isOlderThan(lastObservationAt, thresholdSeconds, nowMs),
    thresholdSeconds,
  }
}
