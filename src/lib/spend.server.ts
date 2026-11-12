import { normalizeSpendWindow } from './dates'
import {
  buildSpendHistoryQuery,
  buildSpendQueries,
  makeErrorReport,
  makeReport,
  spendHistoryPlan,
  spendHistorySeries,
} from './spend'
import type { PrometheusConfig, PrometheusClient } from './prometheus.server'
import type {
  MetricSample,
  SpendHistory,
  SpendPersonDailySeries,
  SpendReport,
  SpendWindow,
} from './types'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur Prometheus inconnue'
}

export async function fetchSpendReport(
  client: PrometheusClient | null,
  config: PrometheusConfig,
  rawWindow: string | undefined,
  now = new Date(),
): Promise<SpendReport> {
  const id = normalizeSpendWindow(rawWindow)
  if (!client || !config.configured) {
    return makeErrorReport(now, id, 'PROMETHEUS_URL non configuré', {
      configured: false,
      mockMode: config.mockMode,
    })
  }

  const plan = spendHistoryPlan(id, now)
  const queries = buildSpendQueries(
    id,
    `${Math.max(300, Math.floor((now.getTime() - plan.from.getTime()) / 1000))}s`,
  )
  const settled = await Promise.allSettled(queries.map((query) => client.query(query)))
  for (const result of settled) {
    if (result.status === 'rejected') {
      return makeErrorReport(now, id, message(result.reason), {
        configured: true,
        mockMode: config.mockMode,
      })
    }
  }

  const samples = settled.map((result) =>
    result.status === 'fulfilled' ? result.value : ([] as MetricSample[]),
  )
  const [
    cost,
    input,
    output,
    cache,
    windowCost,
    windowTokens,
    leoCost,
    leoTokens,
    leoSessions,
    leaCost,
    leaTokens,
    leaSessions,
  ] = samples
  return makeReport(
    now,
    id,
    {
      cost: cost ?? [],
      input: input ?? [],
      output: output ?? [],
      cache: cache ?? [],
      windowCost: windowCost ?? [],
      windowTokens: windowTokens ?? [],
      leoCost: leoCost ?? [],
      leoTokens: leoTokens ?? [],
      leoSessions: leoSessions ?? [],
      leaCost: leaCost ?? [],
      leaTokens: leaTokens ?? [],
      leaSessions: leaSessions ?? [],
    },
    { mockMode: config.mockMode },
  )
}

export async function fetchSpendHistory(
  client: PrometheusClient | null,
  config: PrometheusConfig,
  rawWindow: string | undefined,
  now = new Date(),
): Promise<SpendHistory> {
  const id: SpendWindow = normalizeSpendWindow(rawWindow)
  const plan = spendHistoryPlan(id, now)
  const base: SpendHistory = {
    configured: config.configured,
    mockMode: config.mockMode,
    from: plan.from.toISOString(),
    to: now.toISOString(),
    stepSeconds: plan.stepSeconds,
    bucket: plan.bucket,
    window: id,
    series: [],
    firstSampleAt: null,
    excludedKeys: ['hermes-lea', 'hermes-leo'],
  }
  if (!client || !config.configured) return base
  if (plan.queryFrom.getTime() > now.getTime()) return base

  try {
    const rows = await client.queryRange(
      buildSpendHistoryQuery(plan.bucket),
      Math.floor(plan.queryFrom.getTime() / 1000),
      Math.floor(now.getTime() / 1000),
      plan.queryStepSeconds,
    )
    const series: SpendPersonDailySeries[] = spendHistorySeries(rows, plan)
    let first = Number.POSITIVE_INFINITY
    for (const entry of series) {
      for (const point of entry.points) {
        if (point.timestamp < first) first = point.timestamp
      }
    }
    return {
      ...base,
      series,
      firstSampleAt: Number.isFinite(first) ? new Date(first * 1000).toISOString() : null,
    }
  } catch (error) {
    return { ...base, error: message(error) }
  }
}
