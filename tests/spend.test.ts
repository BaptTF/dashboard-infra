import { describe, expect, it } from 'vitest'
import {
  assembleLeo,
  bifrostFromHermes,
  buildSpendHistoryQuery,
  buildSpendQueries,
  makeReport,
} from '~/lib/spend'
import type { MetricSample } from '~/lib/types'
import { sample } from './helpers'

const labels = {
  leaKey: {
    virtual_key_name: 'hermes-lea',
    provider: 'bedrock',
    model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  },
  leoKey: { virtual_key_name: 'hermes-leo', provider: 'opencode-go', model: 'deepseek-v4-flash' },
}

function goFixture() {
  const cost: MetricSample[] = [
    sample(2, {
      virtual_key_name: 'tailscale-emma',
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
    }),
  ]
  const input: MetricSample[] = [
    sample(500_000, {
      virtual_key_name: 'tailscale-emma',
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
    }),
  ]
  const output: MetricSample[] = []
  const cache: MetricSample[] = []
  const windowCost = [sample(12.5, labels.leaKey), sample(136, labels.leoKey)]
  const windowTokens = [
    sample(1000, { ...labels.leaKey, type: 'input' }),
    sample(10_000, { ...labels.leoKey, type: 'input' }),
    sample(9000, { ...labels.leoKey, type: 'cache_read' }),
    sample(50, { ...labels.leoKey, type: 'output' }),
  ]
  const leoCost = [
    sample(135, {
      source: 'telegram',
      user: 'Utilisateur A',
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
    }),
    sample(1000, { source: 'telegram', user: 'Utilisateur A' }),
    sample(49, { source: 'telegram', user: 'Utilisateur B' }),
    sample(3, { source: 'cron', user: 'aucun', provider: 'custom', model: 'deepseek-v4-flash' }),
    sample(1, {
      source: 'api_server',
      user: 'aucun',
      provider: 'opencode-go',
      model: 'mimo-v2.6-pro',
    }),
  ]
  const leoTokens = [
    sample(1000, {
      source: 'telegram',
      user: 'Utilisateur A',
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      type: 'input',
    }),
    sample(9000, {
      source: 'telegram',
      user: 'Utilisateur A',
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      type: 'cache_read',
    }),
    sample(50, {
      source: 'telegram',
      user: 'Utilisateur A',
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      type: 'output',
    }),
    sample(10, {
      source: 'cron',
      user: 'aucun',
      provider: 'custom',
      model: 'deepseek-v4-flash',
      type: 'input',
    }),
    sample(40, {
      source: 'cron',
      user: 'aucun',
      provider: 'custom',
      model: 'deepseek-v4-flash',
      type: 'cache_read',
    }),
  ]
  const leoSessions = [
    sample(8, { source: 'telegram', user: 'Utilisateur A' }),
    sample(5, {
      source: 'telegram',
      user: 'Utilisateur A',
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
    }),
    sample(170, { source: 'cron', user: 'aucun' }),
    sample(3, { source: 'tui', user: 'aucun' }),
  ]
  const leaCost = [
    sample(12.5, {
      source: 'openclaw',
      user: 'Léa',
      provider: 'bedrock',
      model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    }),
  ]
  const leaTokens = [
    sample(1000, {
      source: 'openclaw',
      user: 'Léa',
      provider: 'bedrock',
      model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      type: 'input',
    }),
  ]
  const leaSessions = [
    sample(4, { source: 'openclaw', user: 'Léa' }),
    sample(2, { source: 'cron', user: 'aucun' }),
  ]
  return {
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
  }
}

describe('spend report ported from internal/spend/client.go', () => {
  it('splits Bifrost keys, Hermes agents and their providers', () => {
    const report = makeReport(new Date('2026-11-11T12:00:00Z'), '1m', goFixture())
    expect(report.error).toBeUndefined()
    expect(report.people).toHaveLength(3)
    expect(report.from).toBe('2026-10-31T23:00:00.000Z')
    expect(report.window).toBe('1m')

    const lea = report.people.find((person) => person.virtualKey === 'hermes-lea')
    expect(lea).toMatchObject({ cost: 12.5, tokensIn: 1000, cacheRead: 0, origin: 'hermes' })
    expect(lea?.providers[0]).toMatchObject({ provider: 'bedrock' })
    expect(lea?.providers[0]?.models[0]?.model).toBe('us.anthropic.claude-sonnet-4-20250514-v1:0')

    const leo = report.people.find((person) => person.virtualKey === 'hermes-leo')
    expect(leo).toMatchObject({
      cost: 136,
      tokensIn: 10_000,
      tokensOut: 50,
      cacheRead: 9000,
      origin: 'hermes',
    })

    const emma = report.people.find((person) => person.virtualKey === 'tailscale-emma')
    expect(emma).toMatchObject({ cost: 2, tokensIn: 500_000, origin: 'bifrost' })

    expect(report.leo).toHaveLength(2)
    const camille = report.leo[0]
    expect(camille).toMatchObject({
      user: 'Utilisateur A',
      costUsd: 135,
      tokensIn: 1000,
      tokensOut: 50,
      cacheRead: 9000,
      sessions: 8,
    })
    expect(camille?.providers[0]).toMatchObject({ provider: 'opencode-go', sessions: 5 })
    expect(camille?.providers[0]?.models[0]).toMatchObject({
      model: 'deepseek-v4-flash',
      sessions: 5,
    })
    expect(report.leo[1]).toMatchObject({ user: 'Utilisateur B', providers: [] })
    expect(report.leoOther).toMatchObject({
      costUsd: 4,
      tokensIn: 10,
      cacheRead: 40,
      sessions: 173,
    })
    expect(report.leoOther?.providers.map((provider) => provider.provider)).toEqual([
      'custom',
      'opencode-go',
    ])

    expect(report.lea).toHaveLength(1)
    expect(report.lea[0]).toMatchObject({
      user: 'Léa',
      source: 'openclaw',
      costUsd: 12.5,
      sessions: 4,
    })
    expect(report.lea[0]?.providers[0]?.provider).toBe('bedrock')
    expect(report.leaOther).toMatchObject({ sessions: 2 })
  })

  it('reconstructs missing Hermes rows without double counting', () => {
    const fixture = goFixture()
    fixture.windowCost = []
    fixture.windowTokens = []
    const report = makeReport(new Date('2026-11-11T12:00:00Z'), '1m', fixture)
    const leo = report.people.find((person) => person.virtualKey === 'hermes-leo')
    const lea = report.people.find((person) => person.virtualKey === 'hermes-lea')
    expect(leo?.origin).toBe('hermes')
    expect(lea?.origin).toBe('hermes')
    // One row per agent, not one Bifrost row plus one Hermes row.
    expect(report.people.filter((person) => person.virtualKey === 'hermes-leo')).toHaveLength(1)
    expect(report.people.filter((person) => person.virtualKey === 'hermes-lea')).toHaveLength(1)
    expect(lea?.cost).toBeCloseTo(12.5)
    expect(leo?.tokensIn).toBe(10_050)
  })

  it('ignores unlabelled legacy samples when a split exists', () => {
    const [users] = assembleLeo(
      [
        sample(10, { source: 'telegram', user: 'A', provider: 'p', model: 'm' }),
        sample(99, { source: 'telegram', user: 'A' }),
      ],
      [],
      [],
      (source) => source === 'telegram',
    )
    expect(users[0]?.costUsd).toBe(10)
  })

  it('keeps cache out of Hermes input and adds it back for Bifrost shape', () => {
    const [users, other] = assembleLeo(
      [],
      [
        sample(1000, { source: 'telegram', user: 'A', provider: 'p', model: 'm', type: 'input' }),
        sample(900, {
          source: 'telegram',
          user: 'A',
          provider: 'p',
          model: 'm',
          type: 'cache_read',
        }),
      ],
      [],
      (source) => source === 'telegram',
    )
    const derived = bifrostFromHermes('hermes-leo', users, other)
    expect(users[0]?.tokensIn).toBe(1000)
    expect(users[0]?.cacheRead).toBe(900)
    expect(derived.tokensIn).toBe(1900)
    expect(derived.cacheRead).toBe(900)
  })

  it('normalizes unknown window values to one month', () => {
    expect(buildSpendQueries('1m', '2678400s')).toHaveLength(12)
  })
})

describe('spend PromQL', () => {
  it('uses increase() for Bifrost and current window gauges for Hermes', () => {
    const queries = buildSpendQueries('3m', '7776000s')
    expect(queries[0]).toBe(
      'sum by (virtual_key_name, provider, model) (max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)(increase(bifrost_cost_total{virtual_key_name!~"hermes-lea|hermes-leo"}[7776000s])))',
    )
    expect(queries[4]).toContain('bifrost_window_cost_usd{window="3m"}')
    expect(queries[6]).toBe(
      'max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)(hermes_window_cost_usd{agent="leo",window="3m"})',
    )
    expect(queries[11]).toContain('hermes_window_sessions{agent="lea",window="3m"}')
    expect(queries.every((query) => !query.includes('sum(') || query.includes('sum by'))).toBe(true)
  })

  it('builds a non-overlapping bucket query for history', () => {
    expect(buildSpendHistoryQuery('day')).toContain('increase(bifrost_cost_total')
    expect(buildSpendHistoryQuery('day')).toContain('[1d]')
    expect(buildSpendHistoryQuery('week')).toContain('[7d]')
    expect(buildSpendHistoryQuery('day')).toContain('hermes-lea|hermes-leo')
  })
})
