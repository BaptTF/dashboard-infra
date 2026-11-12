import { windowBounds } from '../src/lib/dates'
import type { SpendWindow } from '../src/lib/types'

/** Real exporter window labels, including rolling_5h and daily. */
export type ExporterQuotaWindow = 'monthly' | 'weekly' | 'rolling_5h' | 'daily'

/** Real exporter quota kinds. */
export type ExporterQuotaKind = 'total' | 'included' | 'api' | 'on_demand' | 'grok'

export const MOCK_SCENARIOS = [
  'nominal',
  'empty',
  'stale',
  'partial',
  'thresholds',
  'zero-weight',
  'longnames',
] as const

export type MockScenario = (typeof MOCK_SCENARIOS)[number]

export interface MockResponse {
  status: number
  body: unknown
}

interface FixtureQuota {
  provider: string
  subscription: string
  window: ExporterQuotaWindow
  quota: ExporterQuotaKind
  used: number
  resetAt: number
  /** Absent on rolling_5h: the exporter cannot derive a period start. */
  elapsed?: number
  /** Absent on rolling_5h, like elapsed. */
  dryDays?: number
  severity?: 0 | 1 | 2
}

interface FixtureSubscription {
  provider: string
  subscription: string
  /** Only Cursor publishes a known monthly price today. */
  monthlyCostUsd?: number
  quotas: Omit<FixtureQuota, 'provider' | 'subscription'>[]
}

interface FixturePerson {
  virtualKey: string
  provider: string
  model: string
  cost: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
}

interface FixtureHermesUser {
  agent: 'leo' | 'lea'
  source: string
  user: string
  provider: string
  model: string
  costUsd: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  sessions: number
  split: boolean
}

interface FixtureWeight {
  provider: string
  subscription: string
  key: string
  weight: number
}

interface FixtureCollection {
  provider: string
  subscription: string
  success: number
  partial: number
  lastSuccessAt: number
  duration: number
}

interface MockModel {
  scenario: MockScenario
  now: Date
  deploymentAt: Date
  subscriptions: FixtureSubscription[]
  people: FixturePerson[]
  hermes: FixtureHermesUser[]
  spendBuckets: {
    provider: string
    subscription: string
    bucket: string
    spend: number
    limit: number
  }[]
  acu: { provider: string; subscription: string; product: string; consumed: number }[]
  acuCycles: { provider: string; subscription: string; startAt: number; resetAt: number }[]
  weights: FixtureWeight[]
  collection: FixtureCollection[]
  weightObservationSuccess: number
  weightLastObservationAt: number
}

const DAY = 86_400
const MONTH = 30 * DAY

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function wave(seed: string, amplitude = 1): number {
  return Math.sin(hash(seed) / 1000) * amplitude
}

export function createMockModel(scenario: MockScenario, now = new Date()): MockModel {
  const deploymentAt = new Date(now.getTime() - 37 * DAY * 1000)
  const subscriptions: FixtureSubscription[] = [
    {
      provider: 'opencode',
      subscription: 'main',
      quotas: [
        {
          window: 'monthly',
          quota: 'total',
          used: 0.63,
          resetAt: now.getTime() / 1000 + 14.2 * DAY,
          elapsed: 0.41,
          dryDays: 2.6,
          severity: 1,
        },
        {
          window: 'weekly',
          quota: 'total',
          used: 0.42,
          resetAt: now.getTime() / 1000 + 3.1 * DAY,
          elapsed: 0.57,
          dryDays: 0,
          severity: 0,
        },
        {
          window: 'rolling_5h',
          quota: 'total',
          used: 0.31,
          resetAt: now.getTime() / 1000 + 4.1 * 3600,
          severity: 0,
        },
      ],
    },
    {
      provider: 'opencode',
      subscription: 'r',
      quotas: [
        {
          window: 'monthly',
          quota: 'total',
          used: 0.28,
          resetAt: now.getTime() / 1000 + 17.8 * DAY,
          elapsed: 0.41,
          dryDays: 0,
          severity: 0,
        },
        {
          window: 'weekly',
          quota: 'total',
          used: 0.51,
          resetAt: now.getTime() / 1000 + 3.1 * DAY,
          elapsed: 0.57,
          dryDays: 0,
          severity: 0,
        },
        {
          window: 'rolling_5h',
          quota: 'total',
          used: 0.12,
          resetAt: now.getTime() / 1000 + 4.8 * 3600,
          severity: 0,
        },
      ],
    },
    {
      provider: 'opencode',
      subscription: 'a',
      quotas: [
        {
          window: 'monthly',
          quota: 'total',
          used: 0.77,
          resetAt: now.getTime() / 1000 + 9.4 * DAY,
          elapsed: 0.68,
          dryDays: 0.8,
          severity: 1,
        },
        {
          window: 'weekly',
          quota: 'total',
          used: 0.94,
          resetAt: now.getTime() / 1000 + 1.7 * DAY,
          elapsed: 0.74,
          dryDays: 1.7,
          severity: 2,
        },
        {
          window: 'rolling_5h',
          quota: 'total',
          used: 0.55,
          resetAt: now.getTime() / 1000 + 2.3 * 3600,
          severity: 0,
        },
      ],
    },
    {
      provider: 'opencode',
      subscription: 'n',
      quotas: [
        {
          window: 'monthly',
          quota: 'total',
          used: 0.18,
          resetAt: now.getTime() / 1000 + 19.2 * DAY,
          elapsed: 0.31,
          dryDays: 0,
          severity: 0,
        },
        {
          window: 'weekly',
          quota: 'total',
          used: 0.22,
          resetAt: now.getTime() / 1000 + 4.6 * DAY,
          elapsed: 0.35,
          dryDays: 0,
          severity: 0,
        },
        {
          window: 'rolling_5h',
          quota: 'total',
          used: 0.05,
          resetAt: now.getTime() / 1000 + 3.4 * 3600,
          severity: 0,
        },
      ],
    },
    {
      provider: 'cursor',
      subscription: 'default',
      monthlyCostUsd: 20,
      quotas: [
        {
          window: 'monthly',
          quota: 'total',
          used: 0.71,
          resetAt: now.getTime() / 1000 + 12.5 * DAY,
          elapsed: 0.66,
          dryDays: 0.7,
          severity: 0,
        },
        {
          window: 'monthly',
          quota: 'included',
          used: 0.62,
          resetAt: now.getTime() / 1000 + 12.5 * DAY,
          elapsed: 0.66,
          dryDays: 0.3,
          severity: 0,
        },
        {
          window: 'monthly',
          quota: 'api',
          used: 0.45,
          resetAt: now.getTime() / 1000 + 12.5 * DAY,
          elapsed: 0.66,
          dryDays: 0,
          severity: 0,
        },
        {
          window: 'monthly',
          quota: 'on_demand',
          used: 0.24,
          resetAt: now.getTime() / 1000 + 12.5 * DAY,
          elapsed: 0.66,
          dryDays: 0,
          severity: 0,
        },
        {
          window: 'weekly',
          quota: 'grok',
          used: 0.33,
          resetAt: now.getTime() / 1000 + 2.2 * DAY,
          elapsed: 0.45,
          dryDays: 0,
          severity: 0,
        },
      ],
    },
    {
      provider: 'devin',
      subscription: 'default',
      quotas: [
        {
          window: 'daily',
          quota: 'total',
          used: 0.46,
          resetAt: now.getTime() / 1000 + 6 * 3600,
          elapsed: 0.58,
          dryDays: 0,
          severity: 0,
        },
        {
          window: 'weekly',
          quota: 'total',
          used: 0.38,
          resetAt: now.getTime() / 1000 + 2.8 * DAY,
          elapsed: 0.52,
          dryDays: 0,
          severity: 0,
        },
      ],
    },
  ]

  if (scenario === 'thresholds') {
    const main = subscriptions[0]
    if (main) {
      main.quotas[0] = { ...main.quotas[0]!, used: 0.82, dryDays: 2.4, severity: 1 }
      main.quotas[1] = { ...main.quotas[1]!, used: 0.95, dryDays: 3.2, severity: 2 }
      // Rolling 5h stays without elapsed/dry days, even in the thresholds case.
      main.quotas[2] = { ...main.quotas[2]!, used: 0.97, severity: 2 }
    }
    const keyA = subscriptions[2]
    if (keyA) {
      keyA.quotas[0] = { ...keyA.quotas[0]!, used: 0.99, dryDays: 5.1, severity: 2 }
    }
  }

  if (scenario === 'longnames') {
    subscriptions.push({
      provider: 'opencode',
      subscription: 'OpenCode — Équipe plateforme et évaluation des modèles de langage',
      quotas: [
        {
          window: 'monthly',
          quota: 'total',
          used: 0.44,
          resetAt: now.getTime() / 1000 + 11.2 * DAY,
          elapsed: 0.41,
          dryDays: 0,
          severity: 0,
        },
      ],
    })
  }

  const people: FixturePerson[] = [
    {
      virtualKey: 'tailscale-camille',
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
      cost: 8.4,
      tokensIn: 1_200_000,
      tokensOut: 80_000,
      cacheRead: 900_000,
    },
    {
      virtualKey: 'tailscale-noe',
      provider: 'bedrock',
      model: 'anthropic/claude-sonnet-4.5',
      cost: 18.2,
      tokensIn: 500_000,
      tokensOut: 40_000,
      cacheRead: 200_000,
    },
    {
      virtualKey: 'atlas',
      provider: 'opencode-go',
      model: 'openai/gpt-5.2-codex',
      cost: 1.4,
      tokensIn: 120_000,
      tokensOut: 10_000,
      cacheRead: 30_000,
    },
    {
      virtualKey: 'open-code-cli-poste-de-travail',
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
      cost: 0.6,
      tokensIn: 42_000,
      tokensOut: 3_200,
      cacheRead: 12_000,
    },
    {
      // A second model series for one key: the curve must keep model identity.
      virtualKey: 'tailscale-baptiste',
      provider: 'opencode-go',
      model: 'glm-5.3-flash',
      cost: 6.2,
      tokensIn: 340_000,
      tokensOut: 22_000,
      cacheRead: 120_000,
    },
    {
      // Hermes keys are real Bifrost keys and must stay in the Bifrost table.
      virtualKey: 'hermes-leo',
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
      cost: 4.2,
      tokensIn: 310_000,
      tokensOut: 19_000,
      cacheRead: 140_000,
    },
    {
      virtualKey: 'hermes-lea',
      provider: 'bedrock',
      model: 'us.anthropic.claude-opus-4-5-20251101-v1:0',
      cost: 12.5,
      tokensIn: 210_000,
      tokensOut: 9_000,
      cacheRead: 80_000,
    },
  ]

  if (scenario === 'longnames') {
    people.push({
      virtualKey: 'OpenCode CLI — poste de travail partagé de l’atelier de recherche',
      provider: 'opencode-go',
      model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0 — profil évaluation longue durée',
      cost: 2.1,
      tokensIn: 210_000,
      tokensOut: 14_000,
      cacheRead: 91_000,
    })
  }

  const hermes: FixtureHermesUser[] = [
    {
      agent: 'leo',
      source: 'telegram',
      user: 'Camille',
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
      costUsd: 42.1,
      tokensIn: 300_000,
      tokensOut: 20_000,
      cacheRead: 2_100_000,
      cacheWrite: 0,
      sessions: 14,
      split: true,
    },
    {
      agent: 'leo',
      source: 'telegram',
      user: 'Noé',
      provider: 'bedrock',
      model: 'anthropic/claude-sonnet-4.5',
      costUsd: 15,
      tokensIn: 80_000,
      tokensOut: 6_000,
      cacheRead: 400_000,
      cacheWrite: 50_000,
      sessions: 5,
      split: true,
    },
    {
      agent: 'leo',
      source: 'cron',
      user: 'aucun',
      provider: 'custom',
      model: 'deepseek-v4.1-flash',
      costUsd: 2.5,
      tokensIn: 5_000,
      tokensOut: 1_000,
      cacheRead: 20_000,
      cacheWrite: 0,
      sessions: 12,
      split: true,
    },
    {
      agent: 'leo',
      source: 'api_server',
      user: 'aucun',
      provider: 'opencode-go',
      model: 'mimo-v2.6-pro',
      costUsd: 0.7,
      tokensIn: 2_000,
      tokensOut: 300,
      cacheRead: 5_000,
      cacheWrite: 0,
      sessions: 3,
      split: true,
    },
    {
      agent: 'leo',
      source: 'tui',
      user: 'aucun',
      provider: '',
      model: '',
      costUsd: 0.2,
      tokensIn: 0,
      tokensOut: 0,
      cacheRead: 0,
      cacheWrite: 0,
      sessions: 40,
      split: false,
    },
    {
      agent: 'lea',
      source: 'openclaw',
      user: 'Léa',
      provider: 'bedrock',
      model: 'anthropic/claude-opus-4.5',
      costUsd: 12.5,
      tokensIn: 20_000,
      tokensOut: 1_500,
      cacheRead: 180_000,
      cacheWrite: 8_000,
      sessions: 4,
      split: true,
    },
    {
      agent: 'lea',
      source: 'telegram',
      user: 'Léa',
      provider: 'bedrock',
      model: 'anthropic/claude-sonnet-4.5',
      costUsd: 3.1,
      tokensIn: 6_000,
      tokensOut: 400,
      cacheRead: 50_000,
      cacheWrite: 0,
      sessions: 2,
      split: true,
    },
    {
      agent: 'lea',
      source: 'cron',
      user: 'aucun',
      provider: 'custom',
      model: 'deepseek-v4.1-flash',
      costUsd: 0.4,
      tokensIn: 1_000,
      tokensOut: 100,
      cacheRead: 3_000,
      cacheWrite: 0,
      sessions: 2,
      split: true,
    },
  ]

  // The sidecar publishes provider="opencode-go" and "Main" while the exporter
  // publishes provider="opencode" and "main": the join must normalize both.
  const weights: FixtureWeight[] = [
    { provider: 'opencode-go', subscription: 'Main', key: 'main-01', weight: 3.2 },
    { provider: 'opencode-go', subscription: 'Main', key: 'main-02', weight: 0 },
    { provider: 'opencode-go', subscription: 'r', key: 'r-01', weight: 1 },
    { provider: 'opencode-go', subscription: 'a', key: 'a-01', weight: 2 },
    { provider: 'opencode-go', subscription: 'n', key: 'n-01', weight: 0.5 },
  ]
  if (scenario === 'longnames') {
    weights.push({
      provider: 'opencode-go',
      subscription: 'OpenCode — Équipe plateforme et évaluation des modèles de langage',
      key: 'clé-open-code-atelier-recherche-et-validation-des-modeles-2026',
      weight: 0.4,
    })
  }
  if (scenario === 'zero-weight') {
    for (const weight of weights) weight.weight = 0
  }

  const stale = scenario === 'stale'
  const partial = scenario === 'partial'
  // Milliseconds, not seconds: 3 * 3600 * 1000 is the three-hour staleness case.
  const nowSeconds = now.getTime() / 1000
  const staleSecondsAgo = (now.getTime() - 3 * 3600 * 1000) / 1000
  const collection: FixtureCollection[] = [
    {
      provider: 'opencode',
      subscription: 'main',
      success: stale ? 0 : 1,
      partial: 0,
      lastSuccessAt: stale ? staleSecondsAgo : nowSeconds - 40,
      duration: 1.4,
    },
    {
      // This one key fails while the other OpenCode keys stay healthy.
      provider: 'opencode',
      subscription: 'r',
      success: 0,
      partial: 0,
      lastSuccessAt: stale ? staleSecondsAgo : nowSeconds - 90,
      duration: 0.9,
    },
    {
      provider: 'opencode',
      subscription: 'a',
      success: stale ? 0 : 1,
      partial: 0,
      lastSuccessAt: stale ? staleSecondsAgo : nowSeconds - 55,
      duration: 1.1,
    },
    {
      provider: 'opencode',
      subscription: 'n',
      success: stale ? 0 : 1,
      partial: 0,
      lastSuccessAt: stale ? staleSecondsAgo : nowSeconds - 70,
      duration: 1.2,
    },
    {
      provider: 'cursor',
      subscription: 'default',
      success: stale ? 0 : 1,
      partial: partial ? 1 : 0,
      lastSuccessAt: stale ? staleSecondsAgo : nowSeconds - (partial ? 300 : 90),
      duration: 0.6,
    },
    {
      provider: 'devin',
      subscription: 'default',
      success: stale ? 0 : 1,
      partial: 0,
      lastSuccessAt: stale ? staleSecondsAgo : nowSeconds - 120,
      duration: 2.1,
    },
  ]

  return {
    scenario,
    now,
    deploymentAt,
    subscriptions,
    people,
    hermes,
    spendBuckets: [
      {
        provider: 'cursor',
        subscription: 'default',
        bucket: 'included',
        spend: 14.5,
        limit: 20,
      },
      {
        provider: 'cursor',
        subscription: 'default',
        bucket: 'on_demand',
        spend: 12.4,
        limit: 50,
      },
    ],
    acu: [
      { provider: 'devin', subscription: 'default', product: 'all', consumed: 18.5 },
      { provider: 'devin', subscription: 'default', product: 'devin', consumed: 12.5 },
      { provider: 'devin', subscription: 'default', product: 'cascade', consumed: 4 },
      { provider: 'devin', subscription: 'default', product: 'terminal', consumed: 2 },
    ],
    acuCycles: [
      {
        provider: 'devin',
        subscription: 'default',
        startAt: now.getTime() / 1000 - 21.8 * DAY,
        resetAt: now.getTime() / 1000 + 8.2 * DAY,
      },
    ],
    weights,
    collection,
    weightObservationSuccess: stale ? 0 : 1,
    weightLastObservationAt: (now.getTime() - (stale ? 2 * 3600 * 1000 : 30 * 1000)) / 1000,
  }
}

interface PromSample {
  metric: Record<string, string>
  value: number
}

function instant(result: PromSample[], at: number = Date.now()) {
  return {
    status: 'success',
    data: {
      resultType: 'vector',
      result: result.map((sample) => ({
        metric: sample.metric,
        value: [Math.floor(at / 1000), String(sample.value)] as [number, string],
      })),
    },
  }
}

function matrix(result: { metric: Record<string, string>; values: [number, string][] }[]) {
  return {
    status: 'success',
    data: { resultType: 'matrix', result },
  }
}

function empty(scenario: MockScenario) {
  return scenario === 'empty'
    ? { status: 200, body: { status: 'success', data: { resultType: 'vector', result: [] } } }
    : null
}

function quotaWindowFromQuery(query: string): ExporterQuotaWindow | null {
  const match = query.match(/window="(monthly|weekly|rolling_5h|daily)"/)
  if (!match) return null
  return match[1] as ExporterQuotaWindow
}

function spendWindowFromQuery(query: string): SpendWindow | null {
  const match = query.match(/window="(1m|3m|6m|1y|all)"/)
  if (!match) return null
  return match[1] as SpendWindow
}

function spanFactor(model: MockModel, query: string): number {
  const rangeMatch = query.match(/\[(\d+)s\]/)
  if (rangeMatch?.[1]) return Number(rangeMatch[1]) / MONTH
  const quotaWindow = quotaWindowFromQuery(query)
  if (quotaWindow === 'weekly') return 7 / 30
  if (quotaWindow === 'daily') return 1 / 30
  if (quotaWindow === 'rolling_5h') return 5 / (30 * 24)
  const spendWindow = spendWindowFromQuery(query)
  if (!spendWindow) return 1
  const bounds = windowBounds(model.now, spendWindow)
  return Math.max(300, (model.now.getTime() - bounds.from.getTime()) / 1000) / MONTH
}

function hermesSamples(model: MockModel, metric: string, agent: 'leo' | 'lea', factor: number) {
  const users = model.hermes.filter((entry) => entry.agent === agent)
  const result: PromSample[] = []
  if (metric === 'hermes_window_cost_usd') {
    for (const user of users) {
      result.push({
        metric: {
          source: user.source,
          user: user.user,
          ...(user.provider ? { provider: user.provider } : {}),
          ...(user.model ? { model: user.model } : {}),
        },
        value: user.costUsd * factor,
      })
    }
    return result
  }
  if (metric === 'hermes_window_tokens') {
    for (const user of users) {
      if (!user.split) continue
      const labels = {
        source: user.source,
        user: user.user,
        provider: user.provider,
        model: user.model,
      }
      result.push({ metric: { ...labels, type: 'input' }, value: user.tokensIn * factor })
      result.push({ metric: { ...labels, type: 'output' }, value: user.tokensOut * factor })
      result.push({ metric: { ...labels, type: 'cache_read' }, value: user.cacheRead * factor })
      result.push({ metric: { ...labels, type: 'cache_write' }, value: user.cacheWrite * factor })
    }
    return result
  }
  if (metric === 'hermes_window_sessions') {
    for (const user of users) {
      const personLabels = { source: user.source, user: user.user }
      result.push({ metric: personLabels, value: user.sessions })
      if (user.split) {
        result.push({
          metric: {
            ...personLabels,
            provider: user.provider,
            model: user.model,
          },
          value: user.sessions,
        })
      }
    }
    return result
  }
  return []
}

function windowHermesSamples(model: MockModel, metric: string, factor: number): PromSample[] {
  const result: PromSample[] = []
  for (const agent of ['leo', 'lea'] as const) {
    const key = agent === 'leo' ? 'hermes-leo' : 'hermes-lea'
    const users = model.hermes.filter((entry) => entry.agent === agent)
    const byProviderModel = new Map<string, FixtureHermesUser>()
    for (const user of users) {
      const provider = user.provider || 'inconnu'
      const modelName = user.model || 'inconnu'
      const id = `${provider}\u0000${modelName}`
      const current = byProviderModel.get(id)
      if (current) {
        current.costUsd += user.costUsd
        current.tokensIn += user.tokensIn
        current.tokensOut += user.tokensOut
        current.cacheRead += user.cacheRead
        current.cacheWrite += user.cacheWrite
      } else {
        byProviderModel.set(id, { ...user, provider, model: modelName })
      }
    }
    const rows = [...byProviderModel.values()]
    if (metric === 'bifrost_window_cost_usd') {
      for (const row of rows) {
        result.push({
          metric: { virtual_key_name: key, provider: row.provider, model: row.model },
          value: row.costUsd * factor,
        })
      }
    } else if (metric === 'bifrost_window_tokens') {
      for (const row of rows) {
        const labels = { virtual_key_name: key, provider: row.provider, model: row.model }
        result.push({ metric: { ...labels, type: 'input' }, value: row.tokensIn * factor })
        result.push({ metric: { ...labels, type: 'output' }, value: row.tokensOut * factor })
        result.push({ metric: { ...labels, type: 'cache_read' }, value: row.cacheRead * factor })
      }
    }
  }
  return result
}

function counterSamples(model: MockModel, metric: string, factor: number): PromSample[] {
  return model.people.map((person) => {
    let value = 0
    if (metric === 'bifrost_cost_total') value = person.cost * factor
    else if (metric === 'bifrost_input_tokens_total') value = person.tokensIn * factor
    else if (metric === 'bifrost_output_tokens_total') value = person.tokensOut * factor
    else if (metric === 'bifrost_cache_read_input_tokens_total') value = person.cacheRead * factor
    return {
      metric: {
        virtual_key_name: person.virtualKey,
        provider: person.provider,
        model: person.model,
      },
      value,
    }
  })
}

function subscriptionSamples(model: MockModel, metric: string): PromSample[] {
  const quotas = model.subscriptions.flatMap((subscription) =>
    subscription.quotas.map((quota) => ({
      ...quota,
      provider: subscription.provider,
      subscription: subscription.subscription,
    })),
  )
  const labels = (quota: (typeof quotas)[number]) => ({
    provider: quota.provider,
    subscription: quota.subscription,
    window: quota.window,
    quota: quota.quota,
  })
  if (metric === 'ai_usage_quota_used_ratio') {
    return quotas.map((quota) => ({ metric: labels(quota), value: quota.used }))
  }
  if (metric === 'ai_usage_quota_reset_timestamp_seconds') {
    return quotas.map((quota) => ({ metric: labels(quota), value: quota.resetAt }))
  }
  if (metric === 'ai_usage_quota_elapsed_ratio') {
    // Absent for rolling_5h, like the real exporter.
    return quotas.flatMap((quota) =>
      quota.elapsed == null ? [] : [{ metric: labels(quota), value: quota.elapsed }],
    )
  }
  if (metric === 'ai_usage_quota_dry_days') {
    return quotas.flatMap((quota) =>
      quota.dryDays == null ? [] : [{ metric: labels(quota), value: quota.dryDays }],
    )
  }
  if (metric === 'ai_usage_quota_budget_severity') {
    return quotas.flatMap((quota) =>
      quota.severity == null ? [] : [{ metric: labels(quota), value: quota.severity }],
    )
  }
  if (metric === 'ai_usage_subscription_monthly_cost_usd') {
    // Only a truly known monthly price is emitted (Cursor today).
    return model.subscriptions.flatMap((subscription) =>
      subscription.monthlyCostUsd == null
        ? []
        : [
            {
              metric: {
                provider: subscription.provider,
                subscription: subscription.subscription,
              },
              value: subscription.monthlyCostUsd,
            },
          ],
    )
  }
  if (metric === 'ai_usage_spend_usd') {
    return model.spendBuckets.map((bucket) => ({
      metric: {
        provider: bucket.provider,
        subscription: bucket.subscription,
        bucket: bucket.bucket,
      },
      value: bucket.spend,
    }))
  }
  if (metric === 'ai_usage_spend_limit_usd') {
    return model.spendBuckets.map((bucket) => ({
      metric: {
        provider: bucket.provider,
        subscription: bucket.subscription,
        bucket: bucket.bucket,
      },
      value: bucket.limit,
    }))
  }
  if (metric === 'ai_usage_acu_consumed') {
    return model.acu.map((acu) => ({
      metric: { provider: acu.provider, subscription: acu.subscription, product: acu.product },
      value: acu.consumed,
    }))
  }
  if (metric === 'ai_usage_acu_cycle_start_timestamp_seconds') {
    return model.acuCycles.map((cycle) => ({
      metric: { provider: cycle.provider, subscription: cycle.subscription },
      value: cycle.startAt,
    }))
  }
  if (metric === 'ai_usage_acu_cycle_reset_timestamp_seconds') {
    return model.acuCycles.map((cycle) => ({
      metric: { provider: cycle.provider, subscription: cycle.subscription },
      value: cycle.resetAt,
    }))
  }
  if (metric === 'ai_usage_collection_success') {
    return model.collection.map((entry) => ({
      metric: { provider: entry.provider, subscription: entry.subscription },
      value: entry.success,
    }))
  }
  if (metric === 'ai_usage_collection_partial') {
    return model.collection.map((entry) => ({
      metric: { provider: entry.provider, subscription: entry.subscription },
      value: entry.partial,
    }))
  }
  if (metric === 'ai_usage_collection_last_success_timestamp_seconds') {
    return model.collection.map((entry) => ({
      metric: { provider: entry.provider, subscription: entry.subscription },
      value: entry.lastSuccessAt,
    }))
  }
  if (metric === 'ai_usage_collection_duration_seconds') {
    return model.collection.map((entry) => ({
      metric: { provider: entry.provider, subscription: entry.subscription },
      value: entry.duration,
    }))
  }
  if (metric === 'bifrost_provider_key_weight') {
    return model.weights.map((weight) => ({
      metric: { provider: weight.provider, subscription: weight.subscription, key: weight.key },
      value: weight.weight,
    }))
  }
  if (metric === 'bifrost_weight_sidecar_observation_success') {
    return [{ metric: {}, value: model.weightObservationSuccess }]
  }
  if (metric === 'bifrost_weight_sidecar_last_observation_timestamp_seconds') {
    return [{ metric: {}, value: model.weightLastObservationAt }]
  }
  return []
}

const KNOWN_METRICS = [
  'ai_usage_quota_used_ratio',
  'ai_usage_quota_reset_timestamp_seconds',
  'ai_usage_quota_elapsed_ratio',
  'ai_usage_quota_dry_days',
  'ai_usage_quota_budget_severity',
  'ai_usage_subscription_monthly_cost_usd',
  'ai_usage_spend_usd',
  'ai_usage_spend_limit_usd',
  'ai_usage_acu_consumed',
  'ai_usage_acu_cycle_start_timestamp_seconds',
  'ai_usage_acu_cycle_reset_timestamp_seconds',
  'ai_usage_collection_success',
  'ai_usage_collection_partial',
  'ai_usage_collection_last_success_timestamp_seconds',
  'ai_usage_collection_duration_seconds',
  'bifrost_provider_key_weight',
  'bifrost_weight_sidecar_observation_success',
  'bifrost_weight_sidecar_last_observation_timestamp_seconds',
]

function handleInstant(model: MockModel, query: string): MockResponse {
  const vector = (rows: PromSample[]) => instant(rows, model.now.getTime())
  if (model.scenario === 'partial' && query.includes('ai_usage_spend_usd')) {
    return { status: 500, body: 'mock: spend unavailable' }
  }
  const emptyResult = empty(model.scenario)
  if (emptyResult) return emptyResult

  if (query.includes('hermes_window_')) {
    const agent = query.includes('agent="lea"') ? 'lea' : 'leo'
    const window = spendWindowFromQuery(query)
    if (!window) return { status: 200, body: vector([]) }
    const factor = spanFactor(model, query)
    const metric = [
      'hermes_window_cost_usd',
      'hermes_window_tokens',
      'hermes_window_sessions',
    ].find((name) => query.includes(name))
    return { status: 200, body: vector(metric ? hermesSamples(model, metric, agent, factor) : []) }
  }
  if (query.includes('bifrost_window_cost_usd') || query.includes('bifrost_window_tokens')) {
    const metric = query.includes('bifrost_window_cost_usd')
      ? 'bifrost_window_cost_usd'
      : 'bifrost_window_tokens'
    return {
      status: 200,
      body: vector(windowHermesSamples(model, metric, spanFactor(model, query))),
    }
  }
  if (
    query.includes('bifrost_cost_total') ||
    query.includes('bifrost_input_tokens_total') ||
    query.includes('bifrost_output_tokens_total') ||
    query.includes('bifrost_cache_read_input_tokens_total')
  ) {
    const metric = [
      'bifrost_cost_total',
      'bifrost_input_tokens_total',
      'bifrost_output_tokens_total',
      'bifrost_cache_read_input_tokens_total',
    ].find((name) => query.includes(name))
    return {
      status: 200,
      body: vector(metric ? counterSamples(model, metric, spanFactor(model, query)) : []),
    }
  }

  if (query.includes('bifrost_weight_sidecar_observation_success')) {
    return {
      status: 200,
      body: vector(subscriptionSamples(model, 'bifrost_weight_sidecar_observation_success')),
    }
  }
  if (query.includes('bifrost_weight_sidecar_last_observation_timestamp_seconds')) {
    return {
      status: 200,
      body: vector(
        subscriptionSamples(model, 'bifrost_weight_sidecar_last_observation_timestamp_seconds'),
      ),
    }
  }

  const metric = KNOWN_METRICS.find((name) => query.includes(name))
  if (!metric) return { status: 200, body: vector([]) }
  return { status: 200, body: vector(subscriptionSamples(model, metric)) }
}

function quotaHistory(model: MockModel, params: URLSearchParams, query: string): MockResponse {
  const window = quotaWindowFromQuery(query)
  if (!window) return { status: 200, body: matrix([]) }
  const start = Number(params.get('start'))
  const end = Number(params.get('end'))
  const step = Math.max(60, Number(params.get('step')) || 3600)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { status: 200, body: matrix([]) }
  }
  const deployment = model.deploymentAt.getTime() / 1000
  const first = Math.max(start, Math.ceil((deployment - start) / step) * step + start)
  if (first > end) return { status: 200, body: matrix([]) }

  const cycleLength =
    window === 'monthly'
      ? MONTH
      : window === 'weekly'
        ? 7 * DAY
        : window === 'daily'
          ? DAY
          : 5 * 3600
  const quotas = model.subscriptions.flatMap((subscription) =>
    subscription.quotas
      .filter((quota) => quota.window === window)
      .map((quota) => ({
        ...quota,
        provider: subscription.provider,
        subscription: subscription.subscription,
      })),
  )
  const rows = quotas.map((quota) => {
    const cycleStart = quota.resetAt - cycleLength
    const currentPhase =
      (((model.now.getTime() / 1000 - cycleStart) % cycleLength) + cycleLength) % cycleLength
    const values: [number, string][] = []
    for (let timestamp = first; timestamp <= end; timestamp += step) {
      const phase =
        ((((timestamp - cycleStart) % cycleLength) + cycleLength) % cycleLength) / cycleLength
      const current = currentPhase / cycleLength
      const scaled = current > 0 ? (quota.used * phase) / current : quota.used * phase
      const jitter = wave(`${quota.subscription}${quota.window}${timestamp}`, 0.012)
      const value =
        timestamp >= model.now.getTime() / 1000 - step
          ? quota.used
          : Math.min(0.999, Math.max(0, scaled + jitter))
      values.push([timestamp, value.toFixed(4)])
    }
    return {
      metric: {
        provider: quota.provider,
        subscription: quota.subscription,
        window: quota.window,
        quota: quota.quota,
      },
      values,
    }
  })
  return { status: 200, body: matrix(rows) }
}

const HISTORY_BACKFILL_DAYS = 120
const HISTORY_LIVE_START_DAYS = 20
const HISTORY_RESET_DAYS = 8
const HISTORY_PAUSE_START_DAYS = 15
const HISTORY_PAUSE_END_DAYS = 13

/**
 * Deterministic daily increment. Summing these values gives the cumulative
 * counter that the real Bifrost/backfill series expose, so the curve tests the
 * same delta reconstruction as production instead of pre-computed buckets.
 */
function historyIncrement(person: FixturePerson, day: number): number {
  const variation = 0.6 + (hash(`${person.virtualKey}:${person.model}:${day}`) % 800) / 1000
  return (person.cost / 30) * variation
}

function historyBackfillName(person: FixturePerson): string {
  return person.virtualKey.startsWith('hermes-') ? 'hermes' : 'opencode'
}

function historyDay(now: number): number {
  return Math.floor(now / DAY)
}

/**
 * Backfill series: a cumulative counter written once per day at 23:59 UTC. The
 * first sample of a series is its first activity day, so the server must charge
 * it from zero. The value only moves when the next daily sample arrives.
 */
function historyBackfillCumulative(
  model: MockModel,
  person: FixturePerson,
  timestamp: number,
): number | null {
  const now = model.now.getTime() / 1000
  const firstDay = historyDay(now - HISTORY_BACKFILL_DAYS * DAY)
  const lastDay = historyDay(now - HISTORY_LIVE_START_DAYS * DAY) - 1
  const consumedDay = historyDay(timestamp) - 1
  if (consumedDay < firstDay || consumedDay > lastDay) return null
  let total = 0
  for (let day = firstDay; day <= consumedDay; day += 1) {
    total += historyIncrement(person, day)
  }
  return total
}

/**
 * Live series: a cumulative counter scraped every step. It changes inside the
 * day, so fine buckets must stay meaningful. A reset restarts the counter from
 * zero; a pause makes the series disappear and reappear without a false spike.
 */
function historyLiveCumulative(
  model: MockModel,
  person: FixturePerson,
  timestamp: number,
): number | null {
  const now = model.now.getTime() / 1000
  const liveStart = historyDay(now - HISTORY_LIVE_START_DAYS * DAY) * DAY
  if (timestamp < liveStart) return null

  const pauseStart = now - HISTORY_PAUSE_START_DAYS * DAY
  const pauseEnd = now - HISTORY_PAUSE_END_DAYS * DAY
  if (person.virtualKey === 'open-code-cli-poste-de-travail') {
    if (timestamp >= pauseStart && timestamp < pauseEnd) return null
  }

  let start = liveStart
  if (person.virtualKey === 'atlas') {
    const reset = historyDay(now - HISTORY_RESET_DAYS * DAY) * DAY
    if (timestamp >= reset) start = reset
  }
  if (timestamp < start) return null

  const elapsed = timestamp - start
  const days = Math.floor(elapsed / DAY)
  let total = 0
  for (let day = 0; day < days; day += 1) {
    total += historyIncrement(person, historyDay(start) + day)
  }
  // The first sample after a reset is already non-zero, as on the gateway.
  const fraction = Math.max((elapsed % DAY) / DAY, 1 / 24)
  return total + historyIncrement(person, historyDay(start) + days) * fraction
}

function spendHistory(model: MockModel, params: URLSearchParams): MockResponse {
  const start = Number(params.get('start'))
  const end = Number(params.get('end'))
  const step = Math.max(3600, Number(params.get('step')) || DAY)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { status: 200, body: matrix([]) }
  }

  const rows: { metric: Record<string, string>; values: [number, string][] }[] = []
  for (const person of model.people) {
    const backfillValues: [number, string][] = []
    const liveValues: [number, string][] = []
    for (let timestamp = start; timestamp <= end; timestamp += step) {
      const backfill = historyBackfillCumulative(model, person, timestamp)
      if (backfill != null) backfillValues.push([timestamp, backfill.toFixed(6)])
      const live = historyLiveCumulative(model, person, timestamp)
      if (live != null) liveValues.push([timestamp, live.toFixed(6)])
    }
    if (backfillValues.length > 0) {
      rows.push({
        metric: {
          virtual_key_name: person.virtualKey,
          provider: person.provider,
          model: person.model,
          backfill: historyBackfillName(person),
        },
        values: backfillValues,
      })
    }
    if (liveValues.length > 0) {
      rows.push({
        metric: {
          virtual_key_name: person.virtualKey,
          provider: person.provider,
          model: person.model,
        },
        values: liveValues,
      })
    }
  }

  // A backfill model appears late with a non-zero first day: its delta from
  // zero is valid, not a spike caused by aggregating keys before deltas.
  const lateStart = Math.floor((model.now.getTime() / 1000 - 3 * DAY) / step) * step
  const lateValues: [number, string][] = [
    [lateStart, '2.5'],
    [lateStart + step, '2.8'],
  ]
  rows.push({
    metric: {
      virtual_key_name: 'tailscale-baptiste',
      provider: 'opencode-go',
      model: 'late-backfill-model',
      backfill: 'opencode',
    },
    values: lateValues.filter(([timestamp]) => timestamp <= end),
  })

  // One isolated backfill point: the first day of activity is still datable.
  const isolatedTarget = model.now.getTime() / 1000 - 5 * DAY
  const isolatedValues: [number, string][] = []
  for (let timestamp = start; timestamp <= end; timestamp += step) {
    if (timestamp >= isolatedTarget && timestamp < isolatedTarget + step) {
      isolatedValues.push([timestamp, '0.75'])
    }
  }
  if (isolatedValues.length > 0) {
    rows.push({
      metric: {
        virtual_key_name: 'backfill-isolated',
        provider: 'opencode-go',
        model: 'single-sample',
        backfill: 'opencode',
      },
      values: isolatedValues,
    })
  }

  return { status: 200, body: matrix(rows) }
}

export function handlePrometheusRequest(
  pathname: string,
  params: URLSearchParams,
  scenario: MockScenario,
  now = new Date(),
): MockResponse {
  if (pathname === '/-/ready' || pathname === '/healthz') {
    return { status: 200, body: 'Ready\n' }
  }
  const model = createMockModel(scenario, now)
  if (pathname === '/api/v1/query') {
    return handleInstant(model, params.get('query') ?? '')
  }
  if (pathname === '/api/v1/query_range') {
    const query = params.get('query') ?? ''
    if (model.scenario === 'empty') return { status: 200, body: matrix([]) }
    if (query.includes('ai_usage_quota_used_ratio')) return quotaHistory(model, params, query)
    if (query.includes('bifrost_cost_total')) {
      return spendHistory(model, params)
    }
    return { status: 200, body: matrix([]) }
  }
  return { status: 404, body: 'not found' }
}
