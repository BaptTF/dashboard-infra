import { windowBounds } from './dates'
import type {
  LeoModel,
  LeoProvider,
  LeoUser,
  LeoTotals,
  MetricSample,
  ModelSpend,
  PersonSpend,
  ProviderSpend,
  SpendOrigin,
  SpendReport,
  SpendWindow,
  Totals,
} from './types'

/**
 * Bifrost counters (cost, tokens) reset when the gateway restarts, so they use
 * increase() over the selected span. Hermes window series already hold the
 * consumption inside that span and are read as the current sample. The two
 * clocks must not be added together.
 */
export const DEDUPE = `max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)`
export const BY_CALLER = `sum by (virtual_key_name, provider, model) (` + DEDUPE + `(increase(`

const HERMES_KEYS = new Set(['hermes-lea', 'hermes-leo'])

export function normalizeWindow(id: string | undefined): SpendWindow {
  return id === '3m' || id === '6m' || id === '1y' ? id : '1m'
}

export function buildSpendQueries(id: SpendWindow, range: string): string[] {
  const hermes = (metric: string, agent: 'leo' | 'lea') =>
    `${DEDUPE}(${metric}{agent="${agent}",window="${id}"})`
  const excluded = `virtual_key_name!~"hermes-lea|hermes-leo"`
  return [
    `${BY_CALLER}bifrost_cost_total{${excluded}}[${range}])))`,
    `${BY_CALLER}bifrost_input_tokens_total{${excluded}}[${range}])))`,
    `${BY_CALLER}bifrost_output_tokens_total{${excluded}}[${range}])))`,
    `${BY_CALLER}bifrost_cache_read_input_tokens_total{${excluded}}[${range}])))`,
    `${DEDUPE}(bifrost_window_cost_usd{window="${id}"})`,
    `${DEDUPE}(bifrost_window_tokens{window="${id}"})`,
    hermes('hermes_window_cost_usd', 'leo'),
    hermes('hermes_window_tokens', 'leo'),
    hermes('hermes_window_sessions', 'leo'),
    hermes('hermes_window_cost_usd', 'lea'),
    hermes('hermes_window_tokens', 'lea'),
    hermes('hermes_window_sessions', 'lea'),
  ]
}

/**
 * Range query for the cost curve. A 1d/7d increase evaluated at the matching
 * step gives non-overlapping buckets, so days or weeks can be summed without
 * overlap. Hermes agent keys are excluded to avoid counting their window
 * gauges as Bifrost counters.
 */
export function buildSpendHistoryQuery(bucket: 'day' | 'week'): string {
  const range = bucket === 'day' ? '1d' : '7d'
  return `sum by (virtual_key_name) (${DEDUPE}(increase(bifrost_cost_total{virtual_key_name!~"hermes-lea|hermes-leo"}[${range}])))`
}

export interface SpendHistoryPlan {
  from: Date
  queryFrom: Date
  stepSeconds: number
  bucket: 'day' | 'week'
}

export function spendHistoryPlan(id: SpendWindow, now: Date): SpendHistoryPlan {
  const bounds = windowBounds(now, id)
  const bucket: 'day' | 'week' = id === '1y' ? 'week' : 'day'
  const stepSeconds = bucket === 'day' ? 86400 : 7 * 86400
  return {
    from: bounds.from,
    queryFrom: new Date(bounds.from.getTime() + stepSeconds * 1000),
    stepSeconds,
    bucket,
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

/** Input, output and cache read arrive on one tokens series distinguished by type. */
export function mergeBifrost(
  cost: MetricSample[],
  input: MetricSample[],
  output: MetricSample[],
  cache: MetricSample[],
  windowCost: MetricSample[],
  windowTokens: MetricSample[],
) {
  const mergedCost = [...cost, ...windowCost]
  const mergedInput = [...input]
  const mergedOutput = [...output]
  const mergedCache = [...cache]
  for (const sample of windowTokens) {
    switch (sample.labels.type) {
      case 'input':
        mergedInput.push(sample)
        break
      case 'output':
        mergedOutput.push(sample)
        break
      case 'cache_read':
        mergedCache.push(sample)
        break
    }
  }
  return {
    cost: mergedCost,
    input: mergedInput,
    output: mergedOutput,
    cache: mergedCache,
  }
}

export function hasVirtualKey(samples: MetricSample[], key: string): boolean {
  return samples.some((sample) => (sample.labels.virtual_key_name ?? '').trim() === key)
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
      origin: originFor(name),
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

function originFor(name: string): SpendOrigin {
  return HERMES_KEYS.has(name) ? 'hermes' : 'bifrost'
}

/**
 * Rolls every person of one agent into the Bifrost table. Hermes keeps cache
 * reads out of input; Bifrost counts them inside input, so cached tokens are
 * added back here and the cache column stays the subset.
 */
export function bifrostFromHermes(
  key: string,
  users: LeoUser[],
  other: LeoUser | null,
): PersonSpend {
  const all = [...users, ...(other ? [other] : [])]
  type ModelBucket = Totals
  type ProviderBucket = Totals & {
    models: Map<string, ModelBucket>
  }
  const providers = new Map<string, ProviderBucket>()
  const total: Totals = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 }
  const covered: Totals = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 }

  const add = (into: Totals, cost: number, input: number, output: number, cacheRead: number) => {
    into.cost += cost
    into.tokensOut += output
    into.cacheRead += cacheRead
    into.tokensIn += input + cacheRead
  }

  for (const user of all) {
    add(total, user.costUsd, user.tokensIn, user.tokensOut, user.cacheRead)
    for (const provider of user.providers) {
      const name = provider.provider.trim() || 'inconnu'
      let destination = providers.get(name)
      if (!destination) {
        destination = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, models: new Map() }
        providers.set(name, destination)
      }
      add(destination, provider.costUsd, provider.tokensIn, provider.tokensOut, provider.cacheRead)
      add(covered, provider.costUsd, provider.tokensIn, provider.tokensOut, provider.cacheRead)
      for (const model of provider.models) {
        const modelName = model.model.trim() || 'inconnu'
        let modelBucket = destination.models.get(modelName)
        if (!modelBucket) {
          modelBucket = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 }
          destination.models.set(modelName, modelBucket)
        }
        add(modelBucket, model.costUsd, model.tokensIn, model.tokensOut, model.cacheRead)
      }
    }
  }

  const costGap = total.cost - covered.cost
  const inputGap = total.tokensIn - covered.tokensIn
  const readGap = total.cacheRead - covered.cacheRead
  if (costGap > 0.000001 || inputGap > 0.5) {
    let destination = providers.get('inconnu')
    if (!destination) {
      destination = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, models: new Map() }
      providers.set('inconnu', destination)
    }
    add(destination, costGap, inputGap - readGap, total.tokensOut - covered.tokensOut, readGap)
  }

  const row: PersonSpend = {
    virtualKey: key,
    cost: total.cost,
    tokensIn: total.tokensIn,
    tokensOut: total.tokensOut,
    cacheRead: total.cacheRead,
    origin: 'hermes',
    providers: [],
  }
  for (const [name, provider] of providers) {
    if (zero(provider)) continue
    const providerRow: ProviderSpend = {
      provider: name,
      cost: provider.cost,
      tokensIn: provider.tokensIn,
      tokensOut: provider.tokensOut,
      cacheRead: provider.cacheRead,
      models: [],
    }
    for (const [modelName, model] of provider.models) {
      if (zero(model)) continue
      providerRow.models.push({
        model: modelName,
        cost: model.cost,
        tokensIn: model.tokensIn,
        tokensOut: model.tokensOut,
        cacheRead: model.cacheRead,
      })
    }
    providerRow.models.sort((a, b) => spendLess(a, b, a.model, b.model))
    row.providers.push(providerRow)
  }
  row.providers.sort((a, b) => spendLess(a, b, a.provider, b.provider))
  return row
}

export function replaceAgentRow(
  people: PersonSpend[],
  key: string,
  row: PersonSpend,
): PersonSpend[] {
  if (zero(row)) return people
  const index = people.findIndex((person) => person.virtualKey === key)
  if (index >= 0) {
    people[index] = row
    return people
  }
  return [...people, row]
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
    windowCost: MetricSample[]
    windowTokens: MetricSample[]
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
  const merged = mergeBifrost(
    samples.cost,
    samples.input,
    samples.output,
    samples.cache,
    samples.windowCost,
    samples.windowTokens,
  )
  const report = assembleReport({
    cost: merged.cost,
    input: merged.input,
    output: merged.output,
    cache: merged.cache,
    hermesCost: samples.leoCost,
    hermesTokens: samples.leoTokens,
    hermesSessions: samples.leoSessions,
    leaCost: samples.leaCost,
    leaTokens: samples.leaTokens,
    leaSessions: samples.leaSessions,
  })

  if (!hasVirtualKey(samples.windowCost, 'hermes-leo')) {
    report.people = replaceAgentRow(
      report.people,
      'hermes-leo',
      bifrostFromHermes('hermes-leo', report.leo, report.leoOther),
    )
  }
  if (!hasVirtualKey(samples.windowCost, 'hermes-lea')) {
    report.people = replaceAgentRow(
      report.people,
      'hermes-lea',
      bifrostFromHermes('hermes-lea', report.lea, report.leaOther),
    )
  }
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
