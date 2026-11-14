export type QuotaWindow = 'monthly' | 'weekly' | 'rolling' | 'daily'
/** Same calendar vocabulary as the consumption page. */
export type HistoryRange = SpendWindow
export type SpendWindow = '1m' | '3m' | '6m' | '1y' | 'all'
export type SpendGranularity = 'hour' | '6h' | '12h' | 'day'
export type Severity = 0 | 1 | 2

export interface MetricSample {
  labels: Record<string, string>
  value: number
}

export interface MetricPoint {
  timestamp: number
  value: number
}

export interface MetricSeries {
  labels: Record<string, string>
  points: MetricPoint[]
}

export interface SubscriptionQuota {
  provider: string
  subscription: string
  window: QuotaWindow
  quota: string
  usedRatio: number | null
  resetAt: number | null
  elapsedRatio: number | null
  dryDays: number | null
  severity: Severity | null
}

export interface SubscriptionCost {
  provider: string
  subscription: string
  monthlyCostUsd: number
}

export interface SpendBucket {
  provider: string
  subscription: string
  bucket: string
  spendUsd: number
  limitUsd: number | null
  usedRatio: number | null
}

export interface AcuUsage {
  provider: string
  subscription: string
  product: string
  consumed: number
}

export interface AcuCycle {
  provider: string
  subscription: string
  startAt: number | null
  resetAt: number | null
}

export interface KeyWeight {
  provider: string
  subscription: string
  key: string
  weight: number
}

export interface CollectionStatus {
  provider: string
  /** Subscription label exactly as published; collection health is per subscription. */
  subscription: string
  success: boolean | null
  partial: boolean | null
  lastSuccessAt: number | null
  durationSeconds: number | null
  stale: boolean
}

export interface WeightStatus {
  success: boolean | null
  lastObservationAt: number | null
  stale: boolean
  thresholdSeconds: number
}

export interface SubscriptionsOverview {
  configured: boolean
  mockMode: boolean
  fetchedAt: string
  quotas: SubscriptionQuota[]
  costs: SubscriptionCost[]
  spendBuckets: SpendBucket[]
  acu: AcuUsage[]
  acuCycles: AcuCycle[]
  weights: KeyWeight[]
  collection: CollectionStatus[]
  weightStatus: WeightStatus
  errors: Record<string, string>
}

export interface QuotaHistorySeries {
  provider: string
  subscription: string
  window: QuotaWindow
  quota: string
  points: MetricPoint[]
}

export interface QuotaHistory {
  configured: boolean
  mockMode: boolean
  from: string
  to: string
  stepSeconds: number
  window: QuotaWindow
  series: QuotaHistorySeries[]
  firstSampleAt: string | null
  error?: string
}

export interface Totals {
  cost: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
}

export type SpendOrigin = 'bifrost' | 'hermes'

export interface PersonSpend extends Totals {
  virtualKey: string
  origin: SpendOrigin
  providers: ProviderSpend[]
}

export interface ProviderSpend extends Totals {
  provider: string
  models: ModelSpend[]
}

export interface ModelSpend extends Totals {
  model: string
}

export interface LeoTotals {
  costUsd: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  sessions: number
}

export interface LeoUser extends LeoTotals {
  user: string
  source: string
  providers: LeoProvider[]
}

export interface LeoProvider extends LeoTotals {
  provider: string
  models: LeoModel[]
}

export interface LeoModel extends LeoTotals {
  model: string
}

export interface SpendReport {
  configured: boolean
  mockMode: boolean
  fetchedAt: string
  from: string
  window: SpendWindow
  windowLabel: string
  error?: string
  people: PersonSpend[]
  leo: LeoUser[]
  leoOther: LeoUser | null
  lea: LeoUser[]
  leaOther: LeoUser | null
}

export interface SpendPersonDailySeries {
  virtualKey: string
  points: MetricPoint[]
}

export interface SpendHistory {
  configured: boolean
  mockMode: boolean
  from: string
  to: string
  stepSeconds: number
  granularity: SpendGranularity
  window: SpendWindow
  series: SpendPersonDailySeries[]
  firstSampleAt: string | null
  error?: string
}

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  uptimeSeconds: number
  timestamp: string
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready'
  service: string
  version: string
  timestamp: string
  checks: {
    prometheus: {
      configured: boolean
      ok: boolean | null
      detail: string
      latencyMs: number | null
    }
  }
}
