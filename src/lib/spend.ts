import { windowBounds } from './dates'
import type {
  LeoModel,
  LeoProvider,
  LeoUser,
  LeoTotals,
  MetricPoint,
  MetricSample,
  MetricSeries,
  ModelSpend,
  PersonSpend,
  ProviderSpend,
  SpendGranularity,
  SpendOrigin,
  SpendPersonDailySeries,
  SpendReport,
  SpendWindow,
  Totals,
} from './types'

/**
 * Bifrost counters (cost, tokens) reset when the gateway restarts. Token and
 * cache totals use increase() over the selected span. Cost is never taken from
 * increase(): one reconstruction of the raw cumulative counter feeds both the
 * history curve and the Bifrost cost totals. Hermes window series already hold
 * the consumption inside that span and are read as the current sample. The two
 * clocks must not be added together.
 */
export const DEDUPE = `max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)`
export const BY_CALLER = `sum by (virtual_key_name, provider, model) (` + DEDUPE + `(increase(`

/** Bounded lookback: backfill samples arrive daily, live counters every scrape. */
export const BIFROST_COST_LOOKBACK = '2d'
export const HISTORY_REFERENCE_DAYS = 730

export function normalizeWindow(id: string | undefined): SpendWindow {
  return id === '3m' || id === '6m' || id === '1y' || id === 'all' ? id : '1m'
}

export function buildSpendQueries(id: SpendWindow, range: string): string[] {
  const hermes = (metric: string, agent: 'leo' | 'lea') =>
    `${DEDUPE}(${metric}{agent="${agent}",window="${id}"})`
  return [
    `${BY_CALLER}bifrost_input_tokens_total[${range}])))`,
    `${BY_CALLER}bifrost_output_tokens_total[${range}])))`,
    `${BY_CALLER}bifrost_cache_read_input_tokens_total[${range}])))`,
    hermes('hermes_window_cost_usd', 'leo'),
    hermes('hermes_window_tokens', 'leo'),
    hermes('hermes_window_sessions', 'leo'),
    hermes('hermes_window_cost_usd', 'lea'),
    hermes('hermes_window_tokens', 'lea'),
    hermes('hermes_window_sessions', 'lea'),
  ]
}

/**
 * Raw cumulative counter for the single cost reconstruction. The lookback keeps
 * stale backfill series visible between their daily samples without turning a
 * new series into a fake spike: identity is kept per key/provider/model/backfill.
 */
export function buildSpendCostQuery(lookback = BIFROST_COST_LOOKBACK): string {
  return `sum by (virtual_key_name, provider, model, backfill) (${DEDUPE}(last_over_time(bifrost_cost_total[${lookback}])))`
}

/** Evaluations are aligned on UTC midnight, just after the 23:59 backfill sample. */
const DAY_SECONDS = 86_400

const GRANULARITY_SECONDS: Record<SpendWindow, number> = {
  '1m': 3_600,
  '3m': 6 * 3_600,
  '6m': 12 * 3_600,
  '1y': DAY_SECONDS,
  all: DAY_SECONDS,
}

const GRANULARITY_LABEL: Record<SpendWindow, SpendGranularity> = {
  '1m': 'hour',
  '3m': '6h',
  '6m': '12h',
  '1y': 'day',
  all: 'day',
}

export interface SpendHistoryPlan {
  from: Date
  to: Date
  /** Periodic query start, aligned on a UTC day so every 00:00 evaluation catches 23:59 backfill. */
  queryFrom: Date
  /** Wide daily reference used only to seed a baseline before the period. */
  baselineFrom: Date
  queryStepSeconds: number
  /** Display step: one hour for 1m, 6h for 3m, 12h for 6m, one day for 1y/all. */
  stepSeconds: number
  bucketSeconds: number
  /** First bucket fully owned by the selected period, used for both curve and totals. */
  reconstructFrom: number
  granularity: SpendGranularity
}

function referenceWindowStart(now: Date): Date {
  return new Date(
    (Math.floor((now.getTime() / 1000 - HISTORY_REFERENCE_DAYS * DAY_SECONDS) / DAY_SECONDS) *
      DAY_SECONDS -
      7 * DAY_SECONDS) *
      1000,
  )
}

export function spendHistoryPlan(id: SpendWindow, now: Date): SpendHistoryPlan {
  const bounds = windowBounds(now, id)
  const bucketSeconds = GRANULARITY_SECONDS[id]
  const fromSeconds = bounds.from.getTime() / 1000
  const queryFromSeconds = Math.floor(fromSeconds / DAY_SECONDS) * DAY_SECONDS
  const referenceStart = referenceWindowStart(now)
  const baselineFrom = new Date(
    Math.min(referenceStart.getTime(), (queryFromSeconds - 7 * DAY_SECONDS) * 1000),
  )
  return {
    from: bounds.from,
    to: now,
    queryFrom: new Date(queryFromSeconds * 1000),
    baselineFrom,
    queryStepSeconds: bucketSeconds,
    stepSeconds: bucketSeconds,
    bucketSeconds,
    reconstructFrom: Math.floor(fromSeconds / bucketSeconds) * bucketSeconds,
    granularity: GRANULARITY_LABEL[id],
  }
}

/**
 * An evaluation at 00:00 UTC reads the backfill counter as it stood at 23:59
 * UTC for the day that just ended. Shift by three minutes so the chart labels
 * the consumed UTC day, never the new one. Live counters keep their own time:
 * they benefit from the finer bucket.
 */
export function spendHistoryPointTimestamp(evaluationSeconds: number): number {
  return evaluationSeconds - 180
}

export interface BifrostCostReconstruction {
  series: SpendPersonDailySeries[]
  /** One sample per key/provider/model, used as the Bifrost cost totals. */
  samples: MetricSample[]
}

/**
 * Rebuilds Bifrost costs from one cumulative counter. This is the only source
 * of truth for both the history curve and the Bifrost cost totals:
 *
 * - a baseline point before the period (last sample <= start) seeds the series;
 * - without a baseline, the first sample is charged from zero: a backfill's
 *   first day of activity, or a live counter's cost since its reset;
 * - a decrease is a reset (delta = current value);
 * - deltas are bucketed in UTC, then summed by key for the curve and by
 *   key/provider/model for the report.
 *
 * Each series keeps its provider/model/backfill identity, so a new series that
 * appears with a high cumulative value cannot create a false drop or spike.
 */
export function reconstructBifrostCost(
  rows: MetricSeries[],
  plan: SpendHistoryPlan,
): BifrostCostReconstruction {
  const byKey = new Map<string, Map<number, number>>()
  const byModel = new Map<string, { labels: MetricSample['labels']; cost: number }>()
  const toSeconds = plan.to.getTime() / 1000

  for (const row of rows) {
    const virtualKey = (row.labels.virtual_key_name ?? '').trim()
    if (!virtualKey) continue
    const provider = (row.labels.provider ?? '').trim()
    const model = (row.labels.model ?? '').trim()
    const backfill = (row.labels.backfill ?? '').trim()
    const points = row.points
      .filter(
        (point) =>
          Number.isFinite(point.timestamp) && Number.isFinite(point.value) && point.value >= 0,
      )
      .sort((a, b) => a.timestamp - b.timestamp)
    if (points.length === 0) continue

    const modelId = `${virtualKey}\u0000${provider}\u0000${model}`
    let previous: number | null = null
    for (const point of points) {
      let delta: number
      if (previous == null) {
        // No baseline: a backfill's first day or a live counter since reset.
        delta = point.value
      } else {
        delta = point.value - previous
        if (delta < 0) delta = point.value
      }
      previous = point.value
      if (delta <= 0) continue

      // Backfill samples are dated by their consumed UTC day; live counters
      // keep their exact timestamp and benefit from the finer bucket.
      const timestamp = backfill ? spendHistoryPointTimestamp(point.timestamp) : point.timestamp
      const bucket = Math.floor(timestamp / plan.bucketSeconds) * plan.bucketSeconds
      if (bucket < plan.reconstructFrom || bucket > toSeconds) continue

      let buckets = byKey.get(virtualKey)
      if (!buckets) {
        buckets = new Map()
        byKey.set(virtualKey, buckets)
      }
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + delta)
      const aggregate = byModel.get(modelId)
      if (aggregate) aggregate.cost += delta
      else
        byModel.set(modelId, {
          labels: { virtual_key_name: virtualKey, provider, model },
          cost: delta,
        })
    }
  }

  const series: SpendPersonDailySeries[] = []
  for (const [virtualKey, buckets] of byKey) {
    const points: MetricPoint[] = [...buckets]
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, value]) => ({ timestamp, value }))
    if (points.length > 0) series.push({ virtualKey, points })
  }
  series.sort((a, b) => {
    const totalA = a.points.reduce((sum, point) => sum + point.value, 0)
    const totalB = b.points.reduce((sum, point) => sum + point.value, 0)
    return totalB - totalA || a.virtualKey.localeCompare(b.virtualKey, 'fr')
  })

  return {
    series,
    samples: [...byModel.values()]
      .filter((entry) => entry.cost > 0)
      .map((entry) => ({ labels: entry.labels, value: entry.cost })),
  }
}

function zero(totals: Totals): boolean {
  return (
    totals.cost === 0 && totals.tokensIn === 0 && totals.tokensOut === 0 && totals.cacheRead === 0
  )
}

function leoEmpty(totals: LeoTotals): boolean {
  return (
    totals.costUsd === 0 &&
    totals.tokensIn === 0 &&
    totals.tokensOut === 0 &&
    totals.cacheRead === 0 &&
    totals.cacheWrite === 0 &&
    totals.sessions === 0
  )
}

function spendLess(a: Totals, b: Totals, nameA: string, nameB: string): number {
  if (a.cost !== b.cost) return b.cost - a.cost
  return nameA.localeCompare(nameB, 'fr')
}

function leoLess(a: LeoTotals, b: LeoTotals, nameA: string, nameB: string): number {
  if (a.costUsd !== b.costUsd) return b.costUsd - a.costUsd
  return nameA.localeCompare(nameB, 'fr')
}

export function assembleReport(samples: {
  cost: MetricSample[]
  input: MetricSample[]
  output: MetricSample[]
  cache: MetricSample[]
  hermesCost: MetricSample[]
  hermesTokens: MetricSample[]
  hermesSessions: MetricSample[]
  leaCost: MetricSample[]
  leaTokens: MetricSample[]
  leaSessions: MetricSample[]
}): Pick<SpendReport, 'people' | 'leo' | 'leoOther' | 'lea' | 'leaOther'> {
  type ModelBucket = Totals
  type ProviderBucket = Totals & {
    models: Map<string, ModelBucket>
  }
  interface PersonBucket extends Totals {
    providers: Map<string, ProviderBucket>
  }

  const byPerson = new Map<string, PersonBucket>()
  const add = (sample: MetricSample, apply: (totals: Totals) => void) => {
    const name = (sample.labels.virtual_key_name ?? '').trim()
    if (name === '') return
    const provider = (sample.labels.provider ?? '').trim()
    const model = (sample.labels.model ?? '').trim()
    let person = byPerson.get(name)
    if (!person) {
      person = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, providers: new Map() }
      byPerson.set(name, person)
    }
    apply(person)
    let providerBucket = person.providers.get(provider)
    if (!providerBucket) {
      providerBucket = {
        cost: 0,
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        models: new Map(),
      }
      person.providers.set(provider, providerBucket)
    }
    apply(providerBucket)
    let modelBucket = providerBucket.models.get(model)
    if (!modelBucket) {
      modelBucket = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 }
      providerBucket.models.set(model, modelBucket)
    }
    apply(modelBucket)
  }

  for (const sample of samples.cost) {
    add(sample, (totals) => {
      totals.cost += sample.value
    })
  }
  for (const sample of samples.input) {
    add(sample, (totals) => {
      totals.tokensIn += sample.value
    })
  }
  for (const sample of samples.output) {
    add(sample, (totals) => {
      totals.tokensOut += sample.value
    })
  }
  for (const sample of samples.cache) {
    add(sample, (totals) => {
      totals.cacheRead += sample.value
    })
  }

  const people: PersonSpend[] = []
  for (const [name, person] of byPerson) {
    if (zero(person)) continue
    const row: PersonSpend = {
      virtualKey: name,
      cost: person.cost,
      tokensIn: person.tokensIn,
      tokensOut: person.tokensOut,
      cacheRead: person.cacheRead,
      origin: 'bifrost',
      providers: [],
    }
    for (const [provider, providerBucket] of person.providers) {
      if (zero(providerBucket)) continue
      const providerRow: ProviderSpend = {
        provider,
        cost: providerBucket.cost,
        tokensIn: providerBucket.tokensIn,
        tokensOut: providerBucket.tokensOut,
        cacheRead: providerBucket.cacheRead,
        models: [],
      }
      for (const [model, modelBucket] of providerBucket.models) {
        if (zero(modelBucket)) continue
        const modelRow: ModelSpend = {
          model,
          cost: modelBucket.cost,
          tokensIn: modelBucket.tokensIn,
          tokensOut: modelBucket.tokensOut,
          cacheRead: modelBucket.cacheRead,
        }
        providerRow.models.push(modelRow)
      }
      providerRow.models.sort((a, b) => spendLess(a, b, a.model, b.model))
      row.providers.push(providerRow)
    }
    row.providers.sort((a, b) => spendLess(a, b, a.provider, b.provider))
    people.push(row)
  }
  people.sort((a, b) => spendLess(a, b, a.virtualKey, b.virtualKey))

  const [leo, leoOther] = assembleLeo(
    samples.hermesCost,
    samples.hermesTokens,
    samples.hermesSessions,
    (source) => source === 'telegram',
  )
  const [lea, leaOther] = assembleLeo(
    samples.leaCost,
    samples.leaTokens,
    samples.leaSessions,
    (source) => source === 'telegram' || source === 'openclaw',
  )
  return { people, leo, leoOther, lea, leaOther }
}

/**
 * Builds one Hermes agent tree. keepSource decides which sources stay as their
 * own person; the rest fold into one "other" line. A sample without provider
 * and model stays on the person. Model session counts are not added to the
 * person: one session can use several models, and the person total counts each
 * session once.
 */
export function assembleLeo(
  costs: MetricSample[],
  tokens: MetricSample[],
  sessions: MetricSample[],
  keepSource: (source: string) => boolean,
): [LeoUser[], LeoUser | null] {
  type ModelBucket = LeoTotals
  type ProviderBucket = LeoTotals & {
    models: Map<string, ModelBucket>
  }
  type PersonBucket = LeoTotals & {
    source: string
    user: string
    providers: Map<string, ProviderBucket>
  }

  const people = new Map<string, PersonBucket>()
  const split = new Set<string>()
  const mark = (sample: MetricSample) => {
    if ((sample.labels.provider ?? '').trim() === '' && (sample.labels.model ?? '').trim() === '') {
      return
    }
    const source = (sample.labels.source ?? '').trim() || 'unknown'
    split.add(`${source}\u0000${(sample.labels.user ?? '').trim()}`)
  }
  for (const sample of costs) mark(sample)
  for (const sample of tokens) mark(sample)

  const person = (rawSource: string, rawUser: string) => {
    const source = rawSource.trim() || 'unknown'
    const user = rawUser.trim()
    const id = `${source}\u0000${user}`
    let entry = people.get(id)
    if (!entry) {
      entry = {
        source,
        user,
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        cacheWrite: 0,
        sessions: 0,
        providers: new Map(),
      }
      people.set(id, entry)
    }
    return entry
  }

  const add = (sample: MetricSample, rollUp: boolean, apply: (totals: LeoTotals) => void) => {
    const providerName = (sample.labels.provider ?? '').trim()
    const modelName = (sample.labels.model ?? '').trim()
    const source = (sample.labels.source ?? '').trim() || 'unknown'
    const user = (sample.labels.user ?? '').trim()
    if (providerName === '' && modelName === '' && split.has(`${source}\u0000${user}`)) {
      return
    }
    const entry = person(source, user)
    if (rollUp) apply(entry)
    if (providerName === '' && modelName === '') return
    const provider = providerName || 'inconnu'
    let providerBucket = entry.providers.get(provider)
    if (!providerBucket) {
      providerBucket = {
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        cacheWrite: 0,
        sessions: 0,
        models: new Map(),
      }
      entry.providers.set(provider, providerBucket)
    }
    apply(providerBucket)
    const model = modelName || 'inconnu'
    let modelBucket = providerBucket.models.get(model)
    if (!modelBucket) {
      modelBucket = {
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        cacheWrite: 0,
        sessions: 0,
      }
      providerBucket.models.set(model, modelBucket)
    }
    apply(modelBucket)
  }

  for (const sample of costs) {
    add(sample, true, (totals) => {
      totals.costUsd += sample.value
    })
  }
  for (const sample of tokens) {
    let apply: ((totals: LeoTotals) => void) | null = null
    switch (sample.labels.type) {
      case 'input':
        apply = (totals) => {
          totals.tokensIn += sample.value
        }
        break
      case 'output':
        apply = (totals) => {
          totals.tokensOut += sample.value
        }
        break
      case 'cache_read':
        apply = (totals) => {
          totals.cacheRead += sample.value
        }
        break
      case 'cache_write':
        apply = (totals) => {
          totals.cacheWrite += sample.value
        }
        break
      default:
        continue
    }
    if (apply) add(sample, true, apply)
  }
  for (const sample of sessions) {
    const provider = (sample.labels.provider ?? '').trim()
    const model = (sample.labels.model ?? '').trim()
    if (provider === '' && model === '') {
      person(sample.labels.source ?? '', sample.labels.user ?? '').sessions += sample.value
      continue
    }
    add(sample, false, (totals) => {
      totals.sessions += sample.value
    })
  }

  const finish = (entry: PersonBucket): LeoUser => {
    const row: LeoUser = {
      user: entry.user,
      source: entry.source,
      costUsd: entry.costUsd,
      tokensIn: entry.tokensIn,
      tokensOut: entry.tokensOut,
      cacheRead: entry.cacheRead,
      cacheWrite: entry.cacheWrite,
      sessions: entry.sessions,
      providers: [],
    }
    for (const [providerName, provider] of entry.providers) {
      if (leoEmpty(provider)) continue
      const providerRow: LeoProvider = {
        provider: providerName,
        costUsd: provider.costUsd,
        tokensIn: provider.tokensIn,
        tokensOut: provider.tokensOut,
        cacheRead: provider.cacheRead,
        cacheWrite: provider.cacheWrite,
        sessions: provider.sessions,
        models: [],
      }
      for (const [modelName, model] of provider.models) {
        if (leoEmpty(model)) continue
        const modelRow: LeoModel = {
          model: modelName,
          costUsd: model.costUsd,
          tokensIn: model.tokensIn,
          tokensOut: model.tokensOut,
          cacheRead: model.cacheRead,
          cacheWrite: model.cacheWrite,
          sessions: model.sessions,
        }
        providerRow.models.push(modelRow)
      }
      providerRow.models.sort((a, b) => leoLess(a, b, a.model, b.model))
      row.providers.push(providerRow)
    }
    row.providers.sort((a, b) => leoLess(a, b, a.provider, b.provider))
    return row
  }

  const result: LeoUser[] = []
  let other: PersonBucket | null = null
  for (const entry of people.values()) {
    if (leoEmpty(entry) && entry.providers.size === 0) continue
    if (keepSource(entry.source)) {
      result.push(finish(entry))
      continue
    }
    if (!other) {
      other = {
        source: 'other',
        user: '',
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        cacheWrite: 0,
        sessions: 0,
        providers: new Map(),
      }
    }
    other.costUsd += entry.costUsd
    other.tokensIn += entry.tokensIn
    other.tokensOut += entry.tokensOut
    other.cacheRead += entry.cacheRead
    other.cacheWrite += entry.cacheWrite
    other.sessions += entry.sessions
    for (const [providerName, provider] of entry.providers) {
      let destination = other.providers.get(providerName)
      if (!destination) {
        destination = {
          costUsd: 0,
          tokensIn: 0,
          tokensOut: 0,
          cacheRead: 0,
          cacheWrite: 0,
          sessions: 0,
          models: new Map(),
        }
        other.providers.set(providerName, destination)
      }
      destination.costUsd += provider.costUsd
      destination.tokensIn += provider.tokensIn
      destination.tokensOut += provider.tokensOut
      destination.cacheRead += provider.cacheRead
      destination.cacheWrite += provider.cacheWrite
      destination.sessions += provider.sessions
      for (const [modelName, model] of provider.models) {
        let destinationModel = destination.models.get(modelName)
        if (!destinationModel) {
          destinationModel = {
            costUsd: 0,
            tokensIn: 0,
            tokensOut: 0,
            cacheRead: 0,
            cacheWrite: 0,
            sessions: 0,
          }
          destination.models.set(modelName, destinationModel)
        }
        destinationModel.costUsd += model.costUsd
        destinationModel.tokensIn += model.tokensIn
        destinationModel.tokensOut += model.tokensOut
        destinationModel.cacheRead += model.cacheRead
        destinationModel.cacheWrite += model.cacheWrite
        destinationModel.sessions += model.sessions
      }
    }
  }

  result.sort((a, b) => leoLess(a, b, a.user, b.user))
  return [result, other ? finish(other) : null]
}

export function emptyTotals(): Totals {
  return { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 }
}

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    cost: a.cost + b.cost,
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    cacheRead: a.cacheRead + b.cacheRead,
  }
}

export function leoToTotals(user: LeoTotals): Totals {
  return {
    cost: user.costUsd,
    tokensIn: user.tokensIn,
    tokensOut: user.tokensOut,
    cacheRead: user.cacheRead + user.cacheWrite,
  }
}

export function sumPeople(people: PersonSpend[], origin?: SpendOrigin): Totals {
  return people
    .filter((person) => origin == null || person.origin === origin)
    .reduce(addTotals, emptyTotals())
}

export function sumLeo(users: LeoUser[], other: LeoUser | null): LeoTotals {
  const all = [...users, ...(other ? [other] : [])]
  return all.reduce<LeoTotals>(
    (total, user) => ({
      costUsd: total.costUsd + user.costUsd,
      tokensIn: total.tokensIn + user.tokensIn,
      tokensOut: total.tokensOut + user.tokensOut,
      cacheRead: total.cacheRead + user.cacheRead,
      cacheWrite: total.cacheWrite + user.cacheWrite,
      sessions: total.sessions + user.sessions,
    }),
    { costUsd: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, sessions: 0 },
  )
}

export function makeErrorReport(
  now: Date,
  id: SpendWindow,
  error: string,
  meta: { configured: boolean; mockMode: boolean } = { configured: false, mockMode: false },
): SpendReport {
  const bounds = windowBounds(now, id)
  return {
    configured: meta.configured,
    mockMode: meta.mockMode,
    fetchedAt: now.toISOString(),
    from: bounds.from.toISOString(),
    window: id,
    windowLabel: bounds.label,
    error,
    people: [],
    leo: [],
    leoOther: null,
    lea: [],
    leaOther: null,
  }
}

export function makeReport(
  now: Date,
  id: SpendWindow,
  samples: {
    cost: MetricSample[]
    input: MetricSample[]
    output: MetricSample[]
    cache: MetricSample[]
    leoCost: MetricSample[]
    leoTokens: MetricSample[]
    leoSessions: MetricSample[]
    leaCost: MetricSample[]
    leaTokens: MetricSample[]
    leaSessions: MetricSample[]
  },
  meta: { mockMode: boolean } = { mockMode: false },
): SpendReport {
  const bounds = windowBounds(now, id)
  const report = assembleReport({
    cost: samples.cost,
    input: samples.input,
    output: samples.output,
    cache: samples.cache,
    hermesCost: samples.leoCost,
    hermesTokens: samples.leoTokens,
    hermesSessions: samples.leoSessions,
    leaCost: samples.leaCost,
    leaTokens: samples.leaTokens,
    leaSessions: samples.leaSessions,
  })
  report.people.sort((a, b) => spendLess(a, b, a.virtualKey, b.virtualKey))

  return {
    configured: true,
    mockMode: meta.mockMode,
    fetchedAt: now.toISOString(),
    from: bounds.from.toISOString(),
    window: id,
    windowLabel: bounds.label,
    ...report,
  }
}
