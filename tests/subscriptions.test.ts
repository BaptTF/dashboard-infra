import { describe, expect, it } from 'vitest'
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
} from '~/lib/subscriptions'
import {
  aggregateCollectionStatuses,
  averageUsedRatio,
  collectionFor,
  collectionLevel,
  groupOverview,
  maxDryDaysQuota,
  pickWeakestQuota,
  providerLabel,
  quotaSeverityHint,
  quotaThresholds,
  severityCount,
  sharedQuotaThresholds,
  subscriptionDisplayName,
  subscriptionJoinKey,
  totalMonthlyCost,
} from '~/lib/providers'
import type { CollectionStatus, SubscriptionsOverview } from '~/lib/types'
import { sample } from './helpers'

const now = Date.parse('2026-11-11T12:00:00Z')

function quotaLabels(subscription: string, window: string, quota = 'total') {
  return { provider: 'opencode', subscription, window, quota }
}

function collectionStatus(
  provider: string,
  subscription: string,
  overrides: Partial<CollectionStatus> = {},
): CollectionStatus {
  return {
    provider,
    subscription,
    success: true,
    partial: false,
    lastSuccessAt: now / 1000,
    durationSeconds: 1,
    stale: false,
    ...overrides,
  }
}

function overviewWith(overrides: Partial<SubscriptionsOverview>): SubscriptionsOverview {
  return {
    configured: true,
    mockMode: false,
    fetchedAt: new Date(now).toISOString(),
    quotas: [],
    costs: [],
    spendBuckets: [],
    acu: [],
    acuCycles: [],
    weights: [],
    collection: [],
    weightStatus: { success: null, lastObservationAt: null, stale: true, thresholdSeconds: 600 },
    errors: {},
    ...overrides,
  }
}

describe('subscription transformations', () => {
  it('assembles monthly, weekly, rolling_5h and daily quotas without filtering any window', () => {
    const quotas = assembleQuotas({
      used: [
        sample(0.63, quotaLabels('main', 'monthly')),
        sample(0.42, quotaLabels('main', 'weekly')),
        sample(0.31, quotaLabels('main', 'rolling_5h')),
        sample(0.46, quotaLabels('default', 'daily')),
      ],
      reset: [sample(now / 1000 + 3600, quotaLabels('main', 'monthly'))],
      elapsed: [
        sample(0.41, quotaLabels('main', 'monthly')),
        sample(0.57, quotaLabels('main', 'weekly')),
        sample(0.58, quotaLabels('default', 'daily')),
        // Defensive: even if a rolling sample appears, it is ignored.
        sample(0.38, quotaLabels('main', 'rolling_5h')),
      ],
      dryDays: [
        sample(2.6, quotaLabels('main', 'monthly')),
        sample(0.2, quotaLabels('default', 'daily')),
        sample(0, quotaLabels('main', 'rolling_5h')),
      ],
      severity: [
        sample(1, quotaLabels('main', 'monthly')),
        sample(0, quotaLabels('main', 'weekly')),
        // The real exporter does publish a severity for rolling_5h.
        sample(0, quotaLabels('main', 'rolling_5h')),
        sample(2, quotaLabels('default', 'daily')),
      ],
    })
    expect(quotas).toHaveLength(4)
    expect(quotas.find((quota) => quota.window === 'monthly')).toMatchObject({
      usedRatio: 0.63,
      elapsedRatio: 0.41,
      dryDays: 2.6,
      severity: 1,
    })
    // rolling_5h is parsed down to "rolling" and keeps no elapsed/dry days.
    expect(quotas.find((quota) => quota.window === 'rolling')).toMatchObject({
      usedRatio: 0.31,
      elapsedRatio: null,
      dryDays: null,
      severity: 0,
    })
    expect(quotas.find((quota) => quota.window === 'daily')).toMatchObject({
      usedRatio: 0.46,
      elapsedRatio: 0.58,
      dryDays: 0.2,
      severity: 2,
    })
    expect(parseQuotaWindowLabel('rolling_5h')).toBe('rolling')
    expect(parseQuotaWindowLabel('daily')).toBe('daily')
    expect(parseQuotaWindowLabel('nope')).toBeNull()
    expect(quotaHistoryQuery('rolling')).toContain('window="rolling_5h"')
    expect(quotaHistoryQuery('daily')).toContain('window="daily"')
    expect(quotaHistoryQuery('weekly')).toContain('window="weekly"')
    expect(quotaSeverityHint('opencode', 'monthly')).toContain('ComputeBudget')
    expect(quotaSeverityHint('opencode', 'rolling')).toContain('absolu')
    expect(quotaSeverityHint('cursor', 'monthly')).toContain('absolu')
    expect(quotaSeverityHint('devin', 'daily')).toContain('informatifs')
  })

  it('deduplicates replicas by normalized window and takes the highest ratio', () => {
    const quotas = assembleQuotas({
      used: [
        sample(0.4, quotaLabels('main', 'rolling_5h')),
        sample(0.6, quotaLabels('main', 'rolling')),
      ],
      reset: [],
      elapsed: [],
      dryDays: [],
      severity: [],
    })
    expect(quotas).toHaveLength(1)
    expect(quotas[0]?.window).toBe('rolling')
    expect(quotas[0]?.usedRatio).toBe(0.6)
  })

  it('joins spend and limit buckets and computes the ratio', () => {
    const buckets = assembleSpendBuckets(
      [
        sample(14.5, { provider: 'cursor', subscription: 'default', bucket: 'included' }),
        sample(12.4, { provider: 'cursor', subscription: 'default', bucket: 'on_demand' }),
      ],
      [
        sample(20, { provider: 'cursor', subscription: 'default', bucket: 'included' }),
        sample(50, { provider: 'cursor', subscription: 'default', bucket: 'on_demand' }),
      ],
    )
    expect(buckets.find((bucket) => bucket.bucket === 'included')).toMatchObject({
      spendUsd: 14.5,
      limitUsd: 20,
    })
    expect(buckets.find((bucket) => bucket.bucket === 'on_demand')?.usedRatio).toBeCloseTo(
      12.4 / 50,
    )
  })

  it('joins Devin ACU cycle start and reset series', () => {
    const cycles = assembleAcuCycles(
      [sample(1_700_000_000, { provider: 'devin', subscription: 'default' })],
      [sample(1_702_000_000, { provider: 'devin', subscription: 'DEFAULT' })],
    )
    expect(cycles).toHaveLength(1)
    expect(cycles[0]).toMatchObject({
      provider: 'devin',
      subscription: 'default',
      startAt: 1_700_000_000,
      resetAt: 1_702_000_000,
    })
    const groups = groupOverview(
      overviewWith({
        acu: [{ provider: 'devin', subscription: 'default', product: 'all', consumed: 1 }],
        acuCycles: cycles,
      }),
    )
    expect(groups[0]?.subscriptions[0]?.acuCycle?.resetAt).toBe(1_702_000_000)
  })

  it('keeps zero weights and marks collection freshness per subscription', () => {
    expect(
      assembleWeights([sample(0, { provider: 'opencode-go', subscription: 'main', key: 'k' })])[0]
        ?.weight,
    ).toBe(0)
    const collection = assembleCollection(
      {
        success: [
          sample(1, { provider: 'opencode', subscription: 'main' }),
          sample(0, { provider: 'opencode', subscription: 'r' }),
          sample(1, { provider: 'cursor', subscription: 'default' }),
        ],
        partial: [
          sample(0, { provider: 'opencode', subscription: 'main' }),
          sample(1, { provider: 'cursor', subscription: 'default' }),
        ],
        lastSuccess: [
          // Milliseconds: three hours is 3 * 3600 * 1000.
          sample((now - 3 * 3600 * 1000) / 1000, {
            provider: 'opencode',
            subscription: 'main',
          }),
          sample((now - 90 * 1000) / 1000, { provider: 'opencode', subscription: 'r' }),
          sample((now - 40 * 1000) / 1000, { provider: 'cursor', subscription: 'default' }),
        ],
        duration: [
          sample(1.4, { provider: 'opencode', subscription: 'main' }),
          sample(0.9, { provider: 'opencode', subscription: 'r' }),
        ],
      },
      now,
      900,
    )
    expect(collection).toHaveLength(3)
    const main = collection.find((entry) => entry.subscription === 'main')
    const keyR = collection.find((entry) => entry.subscription === 'r')
    const cursor = collection.find((entry) => entry.subscription === 'default')
    expect(main).toMatchObject({ success: true, stale: true })
    // The failing r key is recent: it is a failure, not stale data.
    expect(keyR).toMatchObject({ success: false, stale: false })
    expect(cursor).toMatchObject({ success: true, partial: true, stale: false })

    const status = assembleWeightStatus([sample(0)], [sample((now - 7200 * 1000) / 1000)], now, 600)
    expect(status).toMatchObject({ success: false, stale: true })
  })

  it('disadvantages success and keeps the max last success when labels collide', () => {
    const collection = assembleCollection(
      {
        success: [
          sample(1, { provider: 'opencode', subscription: 'Main' }),
          sample(0, { provider: 'opencode-go', subscription: 'main' }),
        ],
        partial: [
          sample(0, { provider: 'opencode', subscription: 'Main' }),
          sample(1, { provider: 'opencode-go', subscription: 'main' }),
        ],
        lastSuccess: [
          sample(now / 1000 - 500, { provider: 'opencode', subscription: 'Main' }),
          sample(now / 1000 - 100, { provider: 'opencode-go', subscription: 'main' }),
        ],
        duration: [
          sample(1, { provider: 'opencode', subscription: 'Main' }),
          sample(2, { provider: 'opencode-go', subscription: 'main' }),
        ],
      },
      now,
      900,
    )
    expect(collection).toHaveLength(1)
    expect(collection[0]).toMatchObject({
      provider: 'opencode',
      subscription: 'Main',
      success: false,
      partial: true,
      lastSuccessAt: now / 1000 - 100,
      durationSeconds: 2,
    })
  })

  it('uses fixed PromQL, keeps real subscription labels and normalizes costs', () => {
    const queries = buildSubscriptionQueries()
    expect(queries.quotaUsedRatio).toContain('ai_usage_quota_used_ratio')
    expect(queries.quotaUsedRatio).toContain('prometheus_replica')
    expect(queries.collectionSuccess).toContain('min without')
    expect(queries.collectionSuccess).not.toContain('by (provider)')
    expect(queries.collectionLastSuccess).not.toContain('by (provider)')
    expect(queries.keyWeight).toContain('bifrost_provider_key_weight')
    expect(
      assembleCosts([sample(20, { provider: 'cursor', subscription: 'default' })])[0],
    ).toMatchObject({
      provider: 'cursor',
      subscription: 'default',
      monthlyCostUsd: 20,
    })
    expect(
      assembleAcu([
        sample(12.5, { provider: 'devin', subscription: 'default', product: 'devin' }),
      ])[0]?.consumed,
    ).toBe(12.5)
  })
})

describe('normalized provider/subscription join', () => {
  it('orders monthly quotas total, included, api, on_demand', () => {
    const quotas = ['api', 'included', 'on_demand', 'total'].map((quota) => ({
      provider: 'cursor',
      subscription: 'r_personal',
      window: 'monthly' as const,
      quota,
      usedRatio: 0,
      resetAt: now / 1000 + 3600,
      elapsedRatio: null,
      dryDays: null,
      severity: 0 as const,
    }))
    const groups = groupOverview(overviewWith({ quotas }))
    const cursor = groups.find((group) => group.slug === 'cursor')
    expect(cursor?.subscriptions[0]?.quotas.map((quota) => quota.quota)).toEqual([
      'total',
      'included',
      'api',
      'on_demand',
    ])
  })

  it('joins opencode with opencode-go and main with Main', () => {
    expect(subscriptionJoinKey('opencode', 'main')).toBe(subscriptionJoinKey('opencode-go', 'Main'))
    expect(subscriptionJoinKey('cursor', 'PRO')).toBe(subscriptionJoinKey('cursor', 'pro'))
    expect(subscriptionJoinKey('devin', 'Pro')).not.toBe(subscriptionJoinKey('cursor', 'Pro'))
  })

  it('attaches weights published by the sidecar to exporter subscriptions', () => {
    const groups = groupOverview(
      overviewWith({
        quotas: [
          {
            provider: 'opencode',
            subscription: 'main',
            window: 'monthly',
            quota: 'total',
            usedRatio: 0.5,
            resetAt: now / 1000 + 3600,
            elapsedRatio: 0.4,
            dryDays: 0,
            severity: 0,
          },
        ],
        costs: [{ provider: 'cursor', subscription: 'default', monthlyCostUsd: 20 }],
        weights: [
          { provider: 'opencode-go', subscription: 'Main', key: 'main-02', weight: 0 },
          { provider: 'opencode-go', subscription: 'Main', key: 'main-01', weight: 3.2 },
        ],
      }),
    )
    const opencode = groups.find((group) => group.slug === 'opencode')
    expect(opencode?.subscriptions).toHaveLength(1)
    expect(opencode?.subscriptions[0]?.subscription).toBe('main')
    expect(opencode?.subscriptions[0]?.weights.map((weight) => weight.key)).toEqual([
      'main-01',
      'main-02',
    ])
    expect(
      opencode?.subscriptions[0]?.weights.find((weight) => weight.key === 'main-02')?.weight,
    ).toBe(0)
    // The known monthly price stays on the Cursor subscription only.
    expect(groups.find((group) => group.slug === 'cursor')?.subscriptions[0]?.monthlyCostUsd).toBe(
      20,
    )
    expect(totalMonthlyCost(overviewWith({ costs: [] }))).toBe(0)
  })

  it('attaches collection per subscription and aggregates the worst level', () => {
    const overview = overviewWith({
      quotas: [
        {
          provider: 'opencode',
          subscription: 'main',
          window: 'monthly',
          quota: 'total',
          usedRatio: 0.5,
          resetAt: now / 1000 + 3600,
          elapsedRatio: 0.4,
          dryDays: 0,
          severity: 0,
        },
        {
          provider: 'opencode',
          subscription: 'r',
          window: 'monthly',
          quota: 'total',
          usedRatio: 0.3,
          resetAt: now / 1000 + 3600,
          elapsedRatio: 0.4,
          dryDays: 0,
          severity: 0,
        },
      ],
      collection: [
        collectionStatus('opencode', 'main', { lastSuccessAt: now / 1000 - 40 }),
        collectionStatus('opencode', 'r', {
          success: false,
          lastSuccessAt: now / 1000 - 90,
        }),
        collectionStatus('cursor', 'default', { partial: true }),
      ],
    })
    const groups = groupOverview(overview)
    const opencode = groups.find((group) => group.slug === 'opencode')
    const main = opencode?.subscriptions.find(
      (subscription) => subscription.subscription === 'main',
    )
    const keyR = opencode?.subscriptions.find((subscription) => subscription.subscription === 'r')
    expect(main?.collection).toMatchObject({ success: true, subscription: 'main' })
    expect(keyR?.collection).toMatchObject({ success: false, subscription: 'r' })
    expect(opencode?.collection).toMatchObject({ success: false, subscription: 'r' })

    expect(collectionFor(overview, 'opencode', 'main')).toMatchObject({ success: true })
    expect(collectionFor(overview, 'opencode', 'r')).toMatchObject({ success: false })
    expect(collectionFor(overview, 'opencode')).toMatchObject({ success: false })
    // Individual statuses are never overwritten by the aggregation.
    expect(collectionFor(overview, 'opencode', 'main')?.subscription).toBe('main')
  })

  it('orders aggregation failure > partial > stale > OK > unknown', () => {
    const ok = collectionStatus('a', 'ok')
    const stale = collectionStatus('a', 'stale', { stale: true, lastSuccessAt: now / 1000 - 3600 })
    const partial = collectionStatus('a', 'partial', { partial: true })
    const failure = collectionStatus('a', 'failure', { success: false })
    const unknown = collectionStatus('a', 'unknown', {
      success: null,
      partial: null,
      lastSuccessAt: null,
      stale: false,
    })
    expect(collectionLevel(ok)).toBe('ok')
    expect(collectionLevel(stale)).toBe('stale')
    expect(collectionLevel(partial)).toBe('partial')
    expect(collectionLevel(failure)).toBe('failure')
    expect(collectionLevel(unknown)).toBe('unknown')
    expect(aggregateCollectionStatuses([ok, stale])?.subscription).toBe('stale')
    expect(aggregateCollectionStatuses([ok, partial])?.subscription).toBe('partial')
    expect(aggregateCollectionStatuses([partial, failure])?.subscription).toBe('failure')
    expect(aggregateCollectionStatuses([unknown, ok])?.subscription).toBe('ok')
    expect(aggregateCollectionStatuses([unknown])?.subscription).toBe('unknown')
    expect(aggregateCollectionStatuses([])).toBeNull()
  })

  it('keeps the timestamp of the degraded status, not another subscription latest success', () => {
    const t1 = now / 1000 - 600
    const t2 = now / 1000 - 10
    const failing = collectionStatus('opencode', 'r', {
      success: false,
      lastSuccessAt: t1,
      durationSeconds: 2,
    })
    const healthy = collectionStatus('opencode', 'main', {
      success: true,
      lastSuccessAt: t2,
      durationSeconds: 5,
    })

    const aggregate = aggregateCollectionStatuses([failing, healthy])
    expect(aggregate).toMatchObject({
      subscription: 'r',
      success: false,
      lastSuccessAt: t1,
    })
    // Other aggregate fields keep their own rule: slowest collection wins.
    expect(aggregate?.durationSeconds).toBe(5)
  })

  it('uses 80/95 for OpenCode budgets and 70/90 for absolute levels', () => {
    expect(quotaThresholds('opencode', 'monthly')).toEqual({ warn: 0.8, critical: 0.95 })
    expect(quotaThresholds('opencode', 'weekly')).toEqual({ warn: 0.8, critical: 0.95 })
    expect(quotaThresholds('opencode', 'rolling')).toEqual({ warn: 0.7, critical: 0.9 })
    expect(quotaThresholds('cursor', 'monthly')).toEqual({ warn: 0.7, critical: 0.9 })
    expect(quotaThresholds('devin', 'daily')).toEqual({ warn: 0.7, critical: 0.9 })
  })

  it('finds the weakest quota by severity then dry days', () => {
    const quotas = [
      {
        provider: 'opencode',
        subscription: 'A',
        window: 'monthly' as const,
        quota: 'q',
        usedRatio: 0.5,
        resetAt: null,
        elapsedRatio: 0.5,
        dryDays: 0,
        severity: 0 as const,
      },
      {
        provider: 'opencode',
        subscription: 'B',
        window: 'weekly' as const,
        quota: 'q',
        usedRatio: 0.9,
        resetAt: null,
        elapsedRatio: 0.5,
        dryDays: 3,
        severity: 2 as const,
      },
      {
        provider: 'cursor',
        subscription: 'C',
        window: 'monthly' as const,
        quota: 'q',
        usedRatio: 0.8,
        resetAt: null,
        elapsedRatio: 0.5,
        dryDays: 1,
        severity: 1 as const,
      },
    ]
    expect(pickWeakestQuota(quotas)?.quota.subscription).toBe('B')
    expect(averageUsedRatio(quotas)).toBeCloseTo(0.7333, 3)
    expect(maxDryDaysQuota(quotas)?.subscription).toBe('B')
    expect(
      totalMonthlyCost(
        overviewWith({
          costs: [{ provider: 'cursor', subscription: 'default', monthlyCostUsd: 20 }],
        }),
      ),
    ).toBe(20)
  })

  it('prioritises a full quota over a large dry-day projection', () => {
    const quotas = [
      {
        provider: 'opencode',
        subscription: 'A',
        window: 'monthly' as const,
        quota: 'q',
        usedRatio: 0.43,
        resetAt: 1_800_000_000,
        elapsedRatio: 0.4,
        dryDays: 9.9,
        severity: 2 as const,
      },
      {
        provider: 'cursor',
        subscription: 'b_personal',
        window: 'monthly' as const,
        quota: 'q',
        usedRatio: 1,
        resetAt: 1_700_000_000,
        elapsedRatio: 0.8,
        dryDays: 0,
        severity: 0 as const,
      },
    ]
    expect(pickWeakestQuota(quotas)?.quota.subscription).toBe('b_personal')
    // The dry-day card never reuses the weakest quota: it takes the real max.
    expect(maxDryDaysQuota(quotas)).toMatchObject({
      subscription: 'A',
      dryDays: 9.9,
      resetAt: 1_800_000_000,
    })
    expect(maxDryDaysQuota([])).toBeNull()
    expect(
      maxDryDaysQuota([
        { ...quotas[0]!, dryDays: null },
        { ...quotas[1]!, dryDays: null },
      ]),
    ).toBeNull()
  })

  it('never turns an unknown severity into green', () => {
    const quotas = [
      {
        provider: 'opencode',
        subscription: 'green',
        window: 'monthly' as const,
        quota: 'q',
        usedRatio: 0.2,
        resetAt: null,
        elapsedRatio: 0.5,
        dryDays: 0,
        severity: 0 as const,
      },
      {
        provider: 'opencode',
        subscription: 'unknown',
        window: 'daily' as const,
        quota: 'q',
        usedRatio: 0.1,
        resetAt: null,
        elapsedRatio: null,
        dryDays: null,
        severity: null,
      },
    ]
    const weakest = pickWeakestQuota(quotas)
    expect(weakest?.quota.subscription).toBe('unknown')
    expect(weakest?.severity).toBeNull()
    expect(severityCount(quotas, 0)).toBe(1)
    expect(severityCount(quotas, 1)).toBe(0)
    expect(severityCount(quotas, 2)).toBe(0)

    const onlyUnknown = [{ ...quotas[1]! }]
    expect(pickWeakestQuota(onlyUnknown)?.severity).toBeNull()
    expect(severityCount(onlyUnknown, 0)).toBe(0)
  })
})

describe('current subscription labels and history deduplication', () => {
  it('humanises current exporter labels without rewriting the raw value', () => {
    expect(providerLabel('opencode')).toBe('OpenCode')
    expect(subscriptionDisplayName('opencode', 'b')).toBe('B')
    expect(subscriptionDisplayName('opencode', 'r')).toBe('R')
    expect(subscriptionDisplayName('opencode', 'a')).toBe('A')
    expect(subscriptionDisplayName('opencode', 'n')).toBe('N')
    expect(subscriptionDisplayName('cursor', 'r_personal')).toBe('R Personal')
    expect(subscriptionDisplayName('cursor', 'b_personal')).toBe('B Personal')
    expect(subscriptionDisplayName('cursor', 'b_student')).toBe('B Student')
    expect(subscriptionDisplayName('devin', 'default')).toBe('Compte principal')
    expect(subscriptionDisplayName('opencode', 'inconnu')).toBe('inconnu')
  })

  it('merges only exact provider/subscription/window/quota duplicates pointwise', () => {
    const series = mergeQuotaHistorySeries([
      {
        provider: 'opencode',
        subscription: 'b',
        window: 'monthly',
        quota: 'total',
        points: [
          { timestamp: 100, value: 0.2 },
          { timestamp: 200, value: 0.3 },
        ],
      },
      {
        provider: 'opencode',
        subscription: 'b',
        window: 'monthly',
        quota: 'total',
        points: [
          { timestamp: 100, value: 0.4 },
          { timestamp: 300, value: 0.1 },
        ],
      },
      {
        provider: 'opencode',
        subscription: 'b',
        window: 'weekly',
        quota: 'total',
        points: [{ timestamp: 100, value: 0.1 }],
      },
    ])
    expect(series).toHaveLength(2)
    const monthly = series.find((entry) => entry.window === 'monthly')
    expect(monthly?.points).toEqual([
      { timestamp: 100, value: 0.4 },
      { timestamp: 200, value: 0.3 },
      { timestamp: 300, value: 0.1 },
    ])
    // A different window is never merged, even with the same timestamp.
    expect(series.find((entry) => entry.window === 'weekly')?.points).toHaveLength(1)
  })

  it('keeps labels distinct and hides markers when threshold grids are mixed', () => {
    expect(sharedQuotaThresholds([{ provider: 'opencode', window: 'monthly' }])).toEqual({
      warn: 0.8,
      critical: 0.95,
    })
    expect(
      sharedQuotaThresholds([
        { provider: 'opencode', window: 'rolling' },
        { provider: 'cursor', window: 'rolling' },
      ]),
    ).toEqual({ warn: 0.7, critical: 0.9 })
    expect(
      sharedQuotaThresholds([
        { provider: 'opencode', window: 'monthly' },
        { provider: 'cursor', window: 'monthly' },
      ]),
    ).toBeNull()
  })
})
