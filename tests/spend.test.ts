import { describe, expect, it } from 'vitest'
import {
  assembleLeo,
  bifrostFromHermes,
  buildSpendHistoryQuery,
  buildSpendQueries,
  HISTORY_REFERENCE_DAYS,
  makeReport,
  spendHistoryPlan,
  spendHistoryPointTimestamp,
  spendHistorySeries,
} from '~/lib/spend'
import type { MetricSample, MetricSeries } from '~/lib/types'
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

  it('keeps model/backfill identity and reads daily cumulative points', () => {
    const query = buildSpendHistoryQuery('day')
    expect(query).not.toContain('increase')
    expect(query).toContain('sum by (virtual_key_name, provider, model, backfill)')
    expect(query).toContain('bifrost_cost_total{virtual_key_name!~"hermes-lea|hermes-leo"}')
    expect(query).toContain('last_over_time')
    expect(query).toContain('[1d]')
    expect(query).toContain('max without')
    // Every display period uses the same daily reference query.
    expect(buildSpendHistoryQuery('week')).toBe(query)
  })
})

describe('spend history reconstruction', () => {
  const now = new Date('2026-11-12T20:00:00Z')
  const plan = spendHistoryPlan('1m', now)

  function evalAt(iso: string): number {
    return Date.parse(iso) / 1000
  }

  function row(labels: Record<string, string>, points: [string, number][]): MetricSeries {
    return {
      labels,
      points: points.map(([iso, value]) => ({ timestamp: evalAt(iso), value })),
    }
  }

  it('queries a 400-day daily reference window aligned on 00:02 UTC', () => {
    const expected =
      Math.floor((now.getTime() / 1000 - HISTORY_REFERENCE_DAYS * 86_400) / 86_400) * 86_400 + 120
    expect(plan.queryFrom.getTime() / 1000).toBe(expected)
    expect(plan.queryFrom.getUTCHours()).toBe(0)
    expect(plan.queryFrom.getUTCMinutes()).toBe(2)
    expect(plan.queryStepSeconds).toBe(86_400)
    expect(plan.stepSeconds).toBe(86_400)
    expect(plan.from.toISOString()).toBe('2026-10-31T23:00:00.000Z')

    const week = spendHistoryPlan('1y', now)
    expect(week.bucket).toBe('week')
    expect(week.queryStepSeconds).toBe(86_400)
    expect(week.stepSeconds).toBe(7 * 86_400)
    expect(week.queryFrom.getTime()).toBe(plan.queryFrom.getTime())
  })

  it('labels an evaluation with the consumed day at 23:59 UTC', () => {
    const evaluation = Date.UTC(2026, 10, 1, 0, 2) / 1000
    expect(spendHistoryPointTimestamp(evaluation) * 1000).toBe(Date.UTC(2026, 9, 31, 23, 59))
  })

  it('does not spike when a new model series appears with a high cumulative value', () => {
    const rows: MetricSeries[] = [
      row({ virtual_key_name: 'tailscale-baptiste', provider: 'p', model: 'old', backfill: '' }, [
        ['2026-11-01T00:02:00Z', 1],
        ['2026-11-02T00:02:00Z', 3],
      ]),
      row(
        {
          virtual_key_name: 'tailscale-baptiste',
          provider: 'p',
          model: 'new',
          backfill: 'opencode',
        },
        [
          ['2026-11-02T00:02:00Z', 100],
          ['2026-11-03T00:02:00Z', 105],
        ],
      ),
    ]
    const series = spendHistorySeries(rows, plan)
    expect(series).toHaveLength(1)
    expect(series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 10, 1, 23, 59) / 1000, value: 2 },
      { timestamp: Date.UTC(2026, 10, 2, 23, 59) / 1000, value: 5 },
    ])
  })

  it('omits a series with a single sample instead of charging its cumulative value', () => {
    const series = spendHistorySeries(
      [
        row({ virtual_key_name: 'vulcain', provider: 'p', model: 'm', backfill: 'opencode' }, [
          ['2026-11-10T00:02:00Z', 500],
        ]),
      ],
      plan,
    )
    expect(series).toEqual([])
  })

  it('computes multi-day deltas and treats a decrease as a reset', () => {
    const series = spendHistorySeries(
      [
        row({ virtual_key_name: 'tailscale-emma', provider: 'p', model: 'm', backfill: '' }, [
          ['2026-11-01T00:02:00Z', 0],
          ['2026-11-02T00:02:00Z', 10],
          ['2026-11-03T00:02:00Z', 15],
          ['2026-11-04T00:02:00Z', 4],
          ['2026-11-05T00:02:00Z', 9],
        ]),
      ],
      plan,
    )
    expect(series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 10, 1, 23, 59) / 1000, value: 10 },
      { timestamp: Date.UTC(2026, 10, 2, 23, 59) / 1000, value: 5 },
      { timestamp: Date.UTC(2026, 10, 3, 23, 59) / 1000, value: 4 },
      { timestamp: Date.UTC(2026, 10, 4, 23, 59) / 1000, value: 5 },
    ])
  })

  it('combines backfill and live series without charging the live first sample', () => {
    const series = spendHistorySeries(
      [
        row(
          { virtual_key_name: 'tailscale-noe', provider: 'p', model: 'm', backfill: 'opencode' },
          [
            ['2026-11-01T00:02:00Z', 0],
            ['2026-11-02T00:02:00Z', 10],
          ],
        ),
        row({ virtual_key_name: 'tailscale-noe', provider: 'p', model: 'm' }, [
          ['2026-11-03T00:02:00Z', 100],
          ['2026-11-04T00:02:00Z', 107],
        ]),
      ],
      plan,
    )
    expect(series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 10, 1, 23, 59) / 1000, value: 10 },
      { timestamp: Date.UTC(2026, 10, 3, 23, 59) / 1000, value: 7 },
    ])
  })

  it('drops datable deltas whose consumed day is before the displayed period', () => {
    const series = spendHistorySeries(
      [
        row({ virtual_key_name: 'tailscale-emma', provider: 'p', model: 'm', backfill: '' }, [
          ['2026-10-30T00:02:00Z', 0],
          ['2026-10-31T00:02:00Z', 50],
          ['2026-11-01T00:02:00Z', 60],
        ]),
      ],
      plan,
    )
    expect(series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 9, 31, 23, 59) / 1000, value: 10 },
    ])
  })

  it('aggregates the 1y view by UTC week', () => {
    const week = spendHistoryPlan('1y', now)
    const series = spendHistorySeries(
      [
        row({ virtual_key_name: 'tailscale-baptiste', provider: 'p', model: 'm', backfill: '' }, [
          ['2026-01-05T00:02:00Z', 0],
          ['2026-01-06T00:02:00Z', 5],
          ['2026-01-07T00:02:00Z', 12],
          ['2026-01-13T00:02:00Z', 20],
        ]),
      ],
      week,
    )
    expect(series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 0, 6, 23, 59) / 1000, value: 12 },
      { timestamp: Date.UTC(2026, 0, 12, 23, 59) / 1000, value: 8 },
    ])
  })

  it('excludes Hermes keys from the history curve', () => {
    const series = spendHistorySeries(
      [
        row({ virtual_key_name: 'hermes-leo', provider: 'p', model: 'm', backfill: '' }, [
          ['2026-11-01T00:02:00Z', 1],
          ['2026-11-02T00:02:00Z', 2],
        ]),
        row({ virtual_key_name: 'hermes-lea', provider: 'p', model: 'm', backfill: '' }, [
          ['2026-11-01T00:02:00Z', 1],
          ['2026-11-02T00:02:00Z', 2],
        ]),
      ],
      plan,
    )
    expect(series).toEqual([])
  })
})
