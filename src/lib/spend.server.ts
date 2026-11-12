import { normalizeSpendWindow } from './dates'
import {
  buildSpendCostQuery,
  buildSpendQueries,
  makeErrorReport,
  makeReport,
  reconstructBifrostCost,
  spendHistoryPlan,
} from './spend'
import type { PrometheusConfig, PrometheusClient } from './prometheus.server'
import type { MetricSample, MetricSeries, SpendHistory, SpendReport, SpendWindow } from './types'

const BASELINE_STEP_SECONDS = 86_400

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur Prometheus inconnue'
}

/**
 * Fetches the raw cumulative cost counter twice: a wide daily reference seeds
 * one baseline per series before the period, then the period itself runs at the
 * adaptive granularity. Both the curve and the cost totals consume this merge.
 */
export async function fetchBifrostCostRows(
  client: PrometheusClient,
  plan: ReturnType<typeof spendHistoryPlan>,
): Promise<MetricSeries[]> {
  const query = buildSpendCostQuery()
  const [baseline, period] = await Promise.all([
    client.queryRange(
      query,
      Math.floor(plan.baselineFrom.getTime() / 1000),
      Math.floor(plan.queryFrom.getTime() / 1000),
      BASELINE_STEP_SECONDS,
    ),
    client.queryRange(
      query,
      Math.floor(plan.queryFrom.getTime() / 1000),
      Math.floor(plan.to.getTime() / 1000),
      plan.queryStepSeconds,
    ),
  ])

  const merged = new Map<string, MetricSeries>()
  const id = (labels: MetricSeries['labels']) =>
    [
      (labels.virtual_key_name ?? '').trim(),
      (labels.provider ?? '').trim(),
      (labels.model ?? '').trim(),
      (labels.backfill ?? '').trim(),
    ].join('\u0000')
  const add = (row: MetricSeries, points: MetricSeries['points']) => {
    const key = id(row.labels)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { labels: row.labels, points: [...points] })
      return
    }
    existing.points.push(...points)
  }

  // A baseline only needs the last known value of each series.
  for (const row of baseline) {
    const last = row.points[row.points.length - 1]
    if (last) add(row, [last])
  }
  for (const row of period) add(row, row.points)

  return [...merged.values()].map((row) => {
    const byTimestamp = new Map<number, number>()
    for (const point of row.points) byTimestamp.set(point.timestamp, point.value)
    return {
      labels: row.labels,
      points: [...byTimestamp]
        .sort((a, b) => a[0] - b[0])
        .map(([timestamp, value]) => ({ timestamp, value })),
    }
  })
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
  const range = `${Math.max(300, Math.floor((now.getTime() - plan.from.getTime()) / 1000))}s`
  try {
    const [costRows, settled] = await Promise.all([
      fetchBifrostCostRows(client, plan),
      Promise.allSettled(buildSpendQueries(id, range).map((query) => client.query(query))),
    ])
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
    const [input, output, cache, leoCost, leoTokens, leoSessions, leaCost, leaTokens, leaSessions] =
      samples
    const cost = reconstructBifrostCost(costRows, plan)
    return makeReport(
      now,
      id,
      {
        cost: cost.samples,
        input: input ?? [],
        output: output ?? [],
        cache: cache ?? [],
        leoCost: leoCost ?? [],
        leoTokens: leoTokens ?? [],
        leoSessions: leoSessions ?? [],
        leaCost: leaCost ?? [],
        leaTokens: leaTokens ?? [],
        leaSessions: leaSessions ?? [],
      },
      { mockMode: config.mockMode },
    )
  } catch (error) {
    return makeErrorReport(now, id, message(error), {
      configured: true,
      mockMode: config.mockMode,
    })
  }
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
    granularity: plan.granularity,
    window: id,
    series: [],
    firstSampleAt: null,
  }
  if (!client || !config.configured) return base
  if (plan.queryFrom.getTime() > now.getTime()) return base

  try {
    const rows = await fetchBifrostCostRows(client, plan)
    const { series } = reconstructBifrostCost(rows, plan)
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
