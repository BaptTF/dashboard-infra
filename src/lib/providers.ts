import type {
  AcuCycle,
  AcuUsage,
  CollectionStatus,
  KeyWeight,
  QuotaWindow,
  Severity,
  SpendBucket,
  SubscriptionQuota,
  SubscriptionsOverview,
} from './types'

export type ProviderSlug = 'opencode' | 'cursor' | 'devin' | 'other'

export interface ProviderMeta {
  slug: ProviderSlug
  name: string
  description: string
  accent: string
}

const PROVIDER_META: Record<ProviderSlug, ProviderMeta> = {
  opencode: {
    slug: 'opencode',
    name: 'OpenCode',
    description: 'Clés Go, quotas serveur et pondérations Bifrost',
    accent: 'var(--chart-1)',
  },
  cursor: {
    slug: 'cursor',
    name: 'Cursor',
    description: 'Forfait inclus, hors forfait et quotas du cycle',
    accent: 'var(--chart-2)',
  },
  devin: {
    slug: 'devin',
    name: 'Devin',
    description: 'Quotas jour/semaine et consommation ACU',
    accent: 'var(--chart-3)',
  },
  other: {
    slug: 'other',
    name: 'Autres fournisseurs',
    description: 'Séries Prometheus sans fournisseur reconnu',
    accent: 'var(--chart-4)',
  },
}

export const PROVIDER_ORDER: readonly ProviderSlug[] = ['opencode', 'cursor', 'devin', 'other']

export function normalizeProvider(raw: string | null | undefined): ProviderSlug {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === 'opencode' || value === 'opencode-go' || value.startsWith('opencode-')) {
    return 'opencode'
  }
  if (value === 'cursor' || value.startsWith('cursor-')) return 'cursor'
  if (value === 'devin' || value === 'codeium' || value.startsWith('devin-')) return 'devin'
  return 'other'
}

export function providerMeta(raw: string | null | undefined): ProviderMeta {
  return PROVIDER_META[normalizeProvider(raw)]
}

export function providerDisplayName(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  return trimmed === '' ? 'Fournisseur inconnu' : trimmed
}

/**
 * Join key shared by quota, cost and weight series. The sidecar publishes
 * provider="opencode-go" while the exporter publishes provider="opencode",
 * and subscription casing is not guaranteed. Normalize both without changing
 * the display labels.
 */
export function subscriptionJoinKey(
  provider: string | null | undefined,
  subscription: string | null | undefined,
): string {
  return `${normalizeProvider(provider)}\u0000${(subscription ?? '').trim().toLocaleLowerCase('fr')}`
}

export interface ProviderGroup {
  slug: ProviderSlug
  meta: ProviderMeta
  rawProviders: string[]
  subscriptions: ProviderSubscription[]
  spendBuckets: SpendBucket[]
  acu: AcuUsage[]
  weights: KeyWeight[]
  /** Aggregated worst status of the group; never just the first subscription. */
  collection: CollectionStatus | null
}

export interface ProviderSubscription {
  provider: string
  subscription: string
  monthlyCostUsd: number | null
  quotas: SubscriptionQuota[]
  weights: KeyWeight[]
  spendBuckets: SpendBucket[]
  acu: AcuUsage[]
  acuCycle: AcuCycle | null
  /** Collection health of this exact subscription, joined by normalized labels. */
  collection: CollectionStatus | null
}

export function groupOverview(overview: SubscriptionsOverview): ProviderGroup[] {
  const groups = new Map<ProviderSlug, ProviderGroup>()

  const ensure = (rawProvider: string): ProviderGroup => {
    const slug = normalizeProvider(rawProvider)
    let group = groups.get(slug)
    if (!group) {
      group = {
        slug,
        meta: PROVIDER_META[slug],
        rawProviders: [],
        subscriptions: [],
        spendBuckets: [],
        acu: [],
        weights: [],
        collection: null,
      }
      groups.set(slug, group)
    }
    if (rawProvider.trim() !== '' && !group.rawProviders.includes(rawProvider)) {
      group.rawProviders.push(rawProvider)
    }
    return group
  }

  const subscriptions = new Map<string, ProviderSubscription>()
  const ensureSubscription = (
    rawProvider: string,
    rawSubscription: string,
  ): ProviderSubscription => {
    const group = ensure(rawProvider)
    const key = subscriptionJoinKey(rawProvider, rawSubscription)
    let subscription = subscriptions.get(key)
    if (!subscription) {
      subscription = {
        provider: rawProvider || 'inconnu',
        subscription: rawSubscription || 'Abonnement inconnu',
        monthlyCostUsd: null,
        quotas: [],
        weights: [],
        spendBuckets: [],
        acu: [],
        acuCycle: null,
        collection: null,
      }
      subscriptions.set(key, subscription)
      group.subscriptions.push(subscription)
    }
    return subscription
  }

  for (const quota of overview.quotas) {
    ensureSubscription(quota.provider, quota.subscription).quotas.push(quota)
  }
  for (const cost of overview.costs) {
    ensureSubscription(cost.provider, cost.subscription).monthlyCostUsd = cost.monthlyCostUsd
  }
  for (const bucket of overview.spendBuckets) {
    const subscription = ensureSubscription(bucket.provider, bucket.subscription)
    subscription.spendBuckets.push(bucket)
    ensure(bucket.provider).spendBuckets.push(bucket)
  }
  for (const acu of overview.acu) {
    const subscription = ensureSubscription(acu.provider, acu.subscription)
    subscription.acu.push(acu)
    ensure(acu.provider).acu.push(acu)
  }
  for (const cycle of overview.acuCycles) {
    const subscription = ensureSubscription(cycle.provider, cycle.subscription)
    subscription.acuCycle = cycle
  }
  for (const weight of overview.weights) {
    const subscription = ensureSubscription(weight.provider, weight.subscription)
    subscription.weights.push(weight)
    ensure(weight.provider).weights.push(weight)
  }
  for (const collection of overview.collection) {
    const subscription = ensureSubscription(collection.provider, collection.subscription)
    subscription.collection = aggregateCollectionStatuses([subscription.collection, collection])
  }

  for (const group of groups.values()) {
    group.collection = aggregateCollectionStatuses(
      group.subscriptions.map((subscription) => subscription.collection),
    )
  }

  const result = [...groups.values()].filter(
    (group) =>
      group.rawProviders.length > 0 ||
      group.subscriptions.length > 0 ||
      group.spendBuckets.length > 0 ||
      group.acu.length > 0 ||
      group.weights.length > 0 ||
      group.collection != null,
  )

  for (const group of result) {
    group.subscriptions.sort((a, b) => a.subscription.localeCompare(b.subscription, 'fr'))
    for (const subscription of group.subscriptions) {
      subscription.quotas.sort(
        (a, b) =>
          QUOTA_WINDOW_ORDER.indexOf(a.window) - QUOTA_WINDOW_ORDER.indexOf(b.window) ||
          a.quota.localeCompare(b.quota, 'fr'),
      )
      subscription.weights.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key, 'fr'))
    }
    group.weights.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key, 'fr'))
    group.spendBuckets.sort((a, b) => b.spendUsd - a.spendUsd)
  }

  return result.sort((a, b) => PROVIDER_ORDER.indexOf(a.slug) - PROVIDER_ORDER.indexOf(b.slug))
}

export const QUOTA_WINDOW_ORDER: readonly QuotaWindow[] = ['monthly', 'weekly', 'daily', 'rolling']

export interface WeakestQuota {
  quota: SubscriptionQuota
  /** Unknown severity is preserved as null: it must never be shown as green. */
  severity: Severity | null
}

/** Unknown severity ranks above green: absence of a signal is not a clean bill. */
function quotaSeverityRank(severity: Severity | null): number {
  if (severity === 2) return 3
  if (severity === 1) return 2
  if (severity === null) return 1
  return 0
}

export function pickWeakestQuota(quotas: SubscriptionQuota[]): WeakestQuota | null {
  if (quotas.length === 0) return null
  const scored = quotas
    .map((quota) => ({
      quota,
      severity: quota.severity,
      rank: quotaSeverityRank(quota.severity),
      dryDays: quota.dryDays ?? Number.NEGATIVE_INFINITY,
      used: quota.usedRatio ?? 0,
      elapsed: quota.elapsedRatio ?? 0,
    }))
    .sort(
      (a, b) =>
        b.rank - a.rank || b.dryDays - a.dryDays || b.used - a.used || b.elapsed - a.elapsed,
    )
  const weakest = scored[0]
  return weakest ? { quota: weakest.quota, severity: weakest.severity } : null
}

export function severityCount(quotas: SubscriptionQuota[], severity: Severity): number {
  // A null severity is unknown, never green.
  return quotas.filter((quota) => quota.severity === severity).length
}

export function averageUsedRatio(quotas: SubscriptionQuota[]): number | null {
  const values = quotas
    .map((quota) => quota.usedRatio)
    .filter((value): value is number => value != null && Number.isFinite(value))
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function totalMonthlyCost(overview: SubscriptionsOverview): number {
  return overview.costs.reduce((sum, cost) => {
    return cost.monthlyCostUsd > 0 ? sum + cost.monthlyCostUsd : sum
  }, 0)
}

export type CollectionLevel = 'failure' | 'partial' | 'stale' | 'ok' | 'unknown'

/** Worst-first scale used by the UI: failure > partial > stale > OK > unknown. */
export function collectionLevel(status: CollectionStatus | null | undefined): CollectionLevel {
  if (!status) return 'unknown'
  if (status.success === false) return 'failure'
  if (status.partial === true) return 'partial'
  if (status.stale) return 'stale'
  if (status.success === true) return 'ok'
  return 'unknown'
}

const COLLECTION_LEVEL_RANK: Record<CollectionLevel, number> = {
  failure: 4,
  partial: 3,
  stale: 2,
  ok: 1,
  unknown: 0,
}

/**
 * Aggregate several subscription statuses without dropping the individual
 * ones. The worst level wins and keeps its own success timestamp: a failed `r`
 * must not inherit the fresh `lastSuccessAt` of a healthy `main`. Duration stays
 * the slowest observed so the aggregate still reflects collection cost.
 */
export function aggregateCollectionStatuses(
  statuses: Array<CollectionStatus | null | undefined>,
): CollectionStatus | null {
  const present = statuses.filter((status): status is CollectionStatus => status != null)
  if (present.length === 0) return null

  let worst = present[0]!
  let lastSuccessAt = present[0]!.lastSuccessAt
  let durationSeconds = present[0]!.durationSeconds
  for (const status of present.slice(1)) {
    const statusRank = COLLECTION_LEVEL_RANK[collectionLevel(status)]
    const worstRank = COLLECTION_LEVEL_RANK[collectionLevel(worst)]
    if (statusRank > worstRank) {
      worst = status
      lastSuccessAt = status.lastSuccessAt
    } else if (
      statusRank === worstRank &&
      status.lastSuccessAt != null &&
      (lastSuccessAt == null || status.lastSuccessAt > lastSuccessAt)
    ) {
      // Ties keep the newest success among equally degraded statuses.
      lastSuccessAt = status.lastSuccessAt
    }
    if (
      status.durationSeconds != null &&
      (durationSeconds == null || status.durationSeconds > durationSeconds)
    ) {
      durationSeconds = status.durationSeconds
    }
  }

  return { ...worst, lastSuccessAt, durationSeconds }
}

/**
 * Collection status for one provider, or one exact subscription when the third
 * argument is supplied. Multiple keys are aggregated: the first one is never
 * silently used as the provider health.
 */
export function collectionFor(
  overview: SubscriptionsOverview,
  rawProvider: string,
  rawSubscription?: string,
): CollectionStatus | null {
  const slug = normalizeProvider(rawProvider)
  if (rawSubscription != null) {
    const key = subscriptionJoinKey(rawProvider, rawSubscription)
    return aggregateCollectionStatuses(
      overview.collection.filter(
        (entry) => subscriptionJoinKey(entry.provider, entry.subscription) === key,
      ),
    )
  }

  const direct = overview.collection.filter(
    (entry) => normalizeProvider(entry.provider) === slug && entry.provider.trim() !== '',
  )
  if (direct.length > 0) return aggregateCollectionStatuses(direct)
  return aggregateCollectionStatuses(
    overview.collection.filter((entry) => entry.provider.trim() === ''),
  )
}

export function severityTone(
  severity: Severity | null,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (severity === 2) return 'danger'
  if (severity === 1) return 'warning'
  if (severity === 0) return 'success'
  return 'neutral'
}

export interface QuotaThresholds {
  warn: number
  critical: number
}

/**
 * The two visual markers depend on the exporter family, never on a universal
 * 80/95 assumption: OpenCode monthly/weekly are computed budgets, while the
 * rolling window and Cursor/Devin use the absolute 70/90 levels.
 */
export function quotaThresholds(
  provider: string | undefined,
  window: QuotaWindow,
): QuotaThresholds {
  const slug = normalizeProvider(provider)
  if (slug === 'opencode') {
    return window === 'rolling' ? { warn: 0.7, critical: 0.9 } : { warn: 0.8, critical: 0.95 }
  }
  if (slug === 'cursor' || slug === 'devin') {
    return { warn: 0.7, critical: 0.9 }
  }
  return { warn: 0.8, critical: 0.95 }
}

export function quotaSeverityHint(provider: string, window: QuotaWindow): string {
  const slug = normalizeProvider(provider)
  if (slug === 'cursor' || slug === 'devin') {
    return 'Niveau absolu fourni par l’exporteur ; temps écoulé et jours à sec informatifs'
  }
  if (slug === 'opencode') {
    return window === 'rolling'
      ? 'Seuil absolu de la fenêtre glissante 5 h'
      : 'Budget calculé (ComputeBudget) ; temps écoulé informatif'
  }
  return 'Sévérité fournie par l’exporteur'
}

export function severityLabel(severity: Severity | null): string {
  if (severity === 2) return 'Dérapage'
  if (severity === 1) return 'Sous tension'
  if (severity === 0) return 'Budget tenu'
  return 'Seuil inconnu'
}

export function windowUsageTotal(group: ProviderGroup): number | null {
  const values = group.subscriptions
    .flatMap((subscription) => subscription.quotas)
    .map((quota) => quota.usedRatio)
    .filter((value): value is number => value != null)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
