import { describe, expect, it } from 'vitest'
import {
  assembleLeo,
  buildSpendCostQuery,
  buildSpendQueries,
  HISTORY_REFERENCE_DAYS,
  makeReport,
  reconstructBifrostCost,
  spendHistoryPlan,
  spendHistoryPointTimestamp,
  sumLeo,
  sumPeople,
} from '~/lib/spend'
import type { MetricSample, MetricSeries } from '~/lib/types'
import type { SpendHistoryPlan } from '~/lib/spend'
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
    sample(12.5, labels.leaKey),
    sample(136, labels.leoKey),
  ]
  const input: MetricSample[] = [
    sample(500_000, {
      virtual_key_name: 'tailscale-emma',
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
    }),
    sample(1000, labels.leaKey),
    sample(10_000, labels.leoKey),
  ]
  const output: MetricSample[] = [sample(50, labels.leoKey), sample(0, labels.leaKey)]
  const cache: MetricSample[] = [sample(9000, labels.leoKey)]
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
    expect(lea).toMatchObject({
      cost: 12.5,
      tokensIn: 1000,
      cacheRead: 0,
      origin: 'bifrost',
    })
    expect(lea?.providers[0]).toMatchObject({ provider: 'bedrock' })
    expect(lea?.providers[0]?.models[0]?.model).toBe('us.anthropic.claude-sonnet-4-20250514-v1:0')

    const leo = report.people.find((person) => person.virtualKey === 'hermes-leo')
    expect(leo).toMatchObject({
      cost: 136,
      tokensIn: 10_000,
      tokensOut: 50,
      cacheRead: 9000,
      origin: 'bifrost',
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

  it('keeps Hermes keys once in the Bifrost table and never adds the Hermes views', () => {
    const fixture = goFixture()
    const report = makeReport(new Date('2026-11-11T12:00:00Z'), '1m', fixture)
    const leo = report.people.find((person) => person.virtualKey === 'hermes-leo')
    const lea = report.people.find((person) => person.virtualKey === 'hermes-lea')
    expect(leo?.origin).toBe('bifrost')
    expect(lea?.origin).toBe('bifrost')
    expect(report.people.filter((person) => person.virtualKey === 'hermes-leo')).toHaveLength(1)
    expect(report.people.filter((person) => person.virtualKey === 'hermes-lea')).toHaveLength(1)
    // The Bifrost totals are the raw counter truth, not the Hermes view added again.
    expect(sumPeople(report.people, 'bifrost').cost).toBeCloseTo(2 + 12.5 + 136)
    expect(sumLeo(report.leo, report.leoOther).costUsd).toBe(188)
    expect(sumLeo(report.lea, report.leaOther).costUsd).toBe(12.5)
    expect(leo?.cost).toBe(136)
    expect(lea?.cost).toBe(12.5)
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

  it('keeps cache out of Hermes input', () => {
    const [users] = assembleLeo(
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
    expect(users[0]?.tokensIn).toBe(1000)
    expect(users[0]?.cacheRead).toBe(900)
  })

  it('normalizes unknown window values to one month', () => {
    expect(buildSpendQueries('1m', '2678400s')).toHaveLength(9)
  })
})

describe('spend PromQL', () => {
  it('removes Hermes exclusions from tokens and cache queries', () => {
    const queries = buildSpendQueries('3m', '7776000s')
    expect(queries[0]).toBe(
      'sum by (virtual_key_name, provider, model) (max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)(increase(bifrost_input_tokens_total[7776000s])))',
    )
    expect(queries[1]).toContain('bifrost_output_tokens_total[7776000s]')
    expect(queries[2]).toContain('bifrost_cache_read_input_tokens_total[7776000s]')
    expect(queries.join(' ')).not.toContain('virtual_key_name!~')
    expect(queries[3]).toBe(
      'max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)(hermes_window_cost_usd{agent="leo",window="3m"})',
    )
    expect(queries[8]).toContain('hermes_window_sessions{agent="lea",window="3m"}')
    expect(queries.every((query) => !query.includes('sum(') || query.includes('sum by'))).toBe(true)
  })

  it('reads the raw cumulative cost counter without increase or exclusions', () => {
    const query = buildSpendCostQuery()
    expect(query).not.toContain('increase')
    expect(query).not.toContain('virtual_key_name!~')
    expect(query).toContain('sum by (virtual_key_name, provider, model, backfill)')
    expect(query).toContain('last_over_time(bifrost_cost_total[2d])')
    expect(query).toContain('max without')
  })
})

describe('spend history plan', () => {
  const now = new Date('2026-11-12T20:00:00Z')

  it('adapts the bucket and aligns the query on UTC midnight', () => {
    const month = spendHistoryPlan('1m', now)
    expect(month.granularity).toBe('hour')
    expect(month.stepSeconds).toBe(3600)
    expect(month.queryStepSeconds).toBe(3600)
    expect(month.from.toISOString()).toBe('2026-10-31T23:00:00.000Z')
    expect(month.queryFrom.toISOString()).toBe('2026-10-31T00:00:00.000Z')
    expect(month.reconstructFrom).toBe(Date.UTC(2026, 9, 31, 23) / 1000)
    expect(month.baselineFrom.getTime()).toBeLessThanOrEqual(
      now.getTime() - HISTORY_REFERENCE_DAYS * 86_400_000,
    )

    expect(spendHistoryPlan('3m', now)).toMatchObject({
      granularity: '6h',
      stepSeconds: 6 * 3600,
    })
    expect(spendHistoryPlan('6m', now)).toMatchObject({
      granularity: '12h',
      stepSeconds: 12 * 3600,
    })
    expect(spendHistoryPlan('1y', now)).toMatchObject({
      granularity: 'day',
      stepSeconds: 86_400,
    })
  })

  it('looks back at most two years for "Depuis le début"', () => {
    const all = spendHistoryPlan('all', now)
    expect(all.granularity).toBe('day')
    expect(all.stepSeconds).toBe(86_400)
    const ageDays = (now.getTime() - all.from.getTime()) / 86_400_000
    expect(ageDays).toBeGreaterThan(729)
    expect(ageDays).toBeLessThan(732)
    expect(all.queryFrom.getTime()).toBeLessThan(all.from.getTime())
  })

  it('labels a backfill evaluation with the consumed UTC day', () => {
    const evaluation = Date.UTC(2026, 10, 1, 0, 0) / 1000
    expect(spendHistoryPointTimestamp(evaluation) * 1000).toBe(Date.UTC(2026, 9, 31, 23, 57))
  })
})

describe('Bifrost cost reconstruction', () => {
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

  function curveTotals(series: { virtualKey: string; points: { value: number }[] }[]) {
    const totals = new Map<string, number>()
    for (const entry of series) {
      totals.set(
        entry.virtualKey,
        entry.points.reduce((sum, point) => sum + point.value, 0),
      )
    }
    return totals
  }

  function modelTotals(samples: MetricSample[]) {
    const totals = new Map<string, number>()
    for (const entry of samples) {
      const key = (entry.labels.virtual_key_name ?? '').trim()
      totals.set(key, (totals.get(key) ?? 0) + entry.value)
    }
    return totals
  }

  it('charges the first backfill sample from zero, then its daily deltas', () => {
    const result = reconstructBifrostCost(
      [
        row({ virtual_key_name: 'vulcain', provider: 'p', model: 'm', backfill: 'opencode' }, [
          ['2026-11-01T00:00:00Z', 5],
          ['2026-11-02T00:00:00Z', 8],
        ]),
      ],
      plan,
    )
    expect(result.series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 9, 31, 23) / 1000, value: 5 },
      { timestamp: Date.UTC(2026, 10, 1, 23) / 1000, value: 3 },
    ])
  })

  it('treats a live first sample as cost since reset and keeps fine buckets', () => {
    const result = reconstructBifrostCost(
      [
        row({ virtual_key_name: 'tailscale-baptiste', provider: 'p', model: 'm' }, [
          ['2026-11-01T10:00:00Z', 2],
          ['2026-11-01T11:00:00Z', 3],
          ['2026-11-01T12:00:00Z', 9],
        ]),
      ],
      plan,
    )
    expect(result.series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 10, 1, 10) / 1000, value: 2 },
      { timestamp: Date.UTC(2026, 10, 1, 11) / 1000, value: 1 },
      { timestamp: Date.UTC(2026, 10, 1, 12) / 1000, value: 6 },
    ])
  })

  it('uses a pre-period baseline instead of charging its cumulative value', () => {
    const result = reconstructBifrostCost(
      [
        row(
          { virtual_key_name: 'tailscale-emma', provider: 'p', model: 'm', backfill: 'opencode' },
          [
            ['2026-10-30T00:00:00Z', 10],
            ['2026-11-01T00:00:00Z', 12],
            ['2026-11-02T00:00:00Z', 15],
          ],
        ),
      ],
      plan,
    )
    expect(result.series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 9, 31, 23) / 1000, value: 2 },
      { timestamp: Date.UTC(2026, 10, 1, 23) / 1000, value: 3 },
    ])
  })

  it('treats a decrease as a reset', () => {
    const result = reconstructBifrostCost(
      [
        row({ virtual_key_name: 'tailscale-emma', provider: 'p', model: 'm', backfill: '' }, [
          ['2026-11-01T00:00:00Z', 0],
          ['2026-11-02T00:00:00Z', 10],
          ['2026-11-03T00:00:00Z', 15],
          ['2026-11-04T00:00:00Z', 4],
          ['2026-11-05T00:00:00Z', 9],
        ]),
      ],
      plan,
    )
    expect(result.series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 10, 2, 0) / 1000, value: 10 },
      { timestamp: Date.UTC(2026, 10, 3, 0) / 1000, value: 5 },
      { timestamp: Date.UTC(2026, 10, 4, 0) / 1000, value: 4 },
      { timestamp: Date.UTC(2026, 10, 5, 0) / 1000, value: 5 },
    ])
  })

  it('does not create a spike when a new model series appears', () => {
    const result = reconstructBifrostCost(
      [
        row({ virtual_key_name: 'tailscale-baptiste', provider: 'p', model: 'old', backfill: '' }, [
          ['2026-11-01T00:00:00Z', 1],
          ['2026-11-02T00:00:00Z', 3],
        ]),
        row(
          {
            virtual_key_name: 'tailscale-baptiste',
            provider: 'p',
            model: 'new',
            backfill: 'opencode',
          },
          [
            ['2026-11-02T00:00:00Z', 2.5],
            ['2026-11-03T00:00:00Z', 2.8],
          ],
        ),
      ],
      plan,
    )
    expect(result.series).toHaveLength(1)
    expect(result.series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 10, 1, 0) / 1000, value: 1 },
      { timestamp: Date.UTC(2026, 10, 1, 23) / 1000, value: 2.5 },
      { timestamp: Date.UTC(2026, 10, 2, 0) / 1000, value: 2 },
      { timestamp: Date.UTC(2026, 10, 2, 23) / 1000, value: 2.8 - 2.5 },
    ])
  })

  it('charges an isolated backfill point instead of dropping it', () => {
    const result = reconstructBifrostCost(
      [
        row(
          {
            virtual_key_name: 'backfill-isolated',
            provider: 'p',
            model: 'm',
            backfill: 'opencode',
          },
          [['2026-11-10T00:00:00Z', 0.75]],
        ),
      ],
      plan,
    )
    expect(result.series[0]?.points).toEqual([
      { timestamp: Date.UTC(2026, 10, 9, 23) / 1000, value: 0.75 },
    ])
  })

  it('includes hermes-leo and hermes-lea like any other Bifrost key', () => {
    const result = reconstructBifrostCost(
      [
        row({ virtual_key_name: 'hermes-leo', provider: 'p', model: 'm', backfill: 'hermes' }, [
          ['2026-11-01T00:00:00Z', 1],
          ['2026-11-02T00:00:00Z', 2],
        ]),
        row({ virtual_key_name: 'hermes-lea', provider: 'p', model: 'm', backfill: 'hermes' }, [
          ['2026-11-01T00:00:00Z', 3],
          ['2026-11-02T00:00:00Z', 4],
        ]),
      ],
      plan,
    )
    expect(result.series.map((entry) => entry.virtualKey).sort()).toEqual([
      'hermes-lea',
      'hermes-leo',
    ])
    expect(modelTotals(result.samples)).toEqual(
      new Map([
        ['hermes-leo', 2],
        ['hermes-lea', 4],
      ]),
    )
  })

  it('keeps the exact same sum whatever the bucket, and totals match the curve', () => {
    const rows = [
      row({ virtual_key_name: 'tailscale-baptiste', provider: 'p', model: 'a', backfill: '' }, [
        ['2026-11-01T00:00:00Z', 1],
        ['2026-11-02T00:00:00Z', 4],
        ['2026-11-03T00:00:00Z', 2],
        ['2026-11-04T00:00:00Z', 7],
      ]),
      row(
        { virtual_key_name: 'tailscale-baptiste', provider: 'p', model: 'b', backfill: 'opencode' },
        [
          ['2026-11-01T00:00:00Z', 2.5],
          ['2026-11-02T00:00:00Z', 3.5],
        ],
      ),
      row({ virtual_key_name: 'hermes-lea', provider: 'p', model: 'c', backfill: 'hermes' }, [
        ['2026-11-01T00:00:00Z', 10],
        ['2026-11-02T00:00:00Z', 12],
        ['2026-11-03T00:00:00Z', 4],
      ]),
    ]
    const fine = reconstructBifrostCost(rows, plan)
    const coarsePlan: SpendHistoryPlan = {
      ...plan,
      bucketSeconds: 6 * 3600,
      stepSeconds: 6 * 3600,
      queryStepSeconds: 6 * 3600,
      reconstructFrom: Math.floor(plan.from.getTime() / 1000 / (6 * 3600)) * 6 * 3600,
    }
    const coarse = reconstructBifrostCost(rows, coarsePlan)
    expect(curveTotals(coarse.series)).toEqual(curveTotals(fine.series))
    expect(modelTotals(coarse.samples)).toEqual(modelTotals(fine.samples))
    expect(modelTotals(fine.samples)).toEqual(curveTotals(fine.series))

    const report = makeReport(now, '1m', {
      ...goFixture(),
      cost: fine.samples,
    })
    for (const [key, total] of curveTotals(fine.series)) {
      expect(report.people.find((person) => person.virtualKey === key)?.cost).toBeCloseTo(total)
    }
    for (const [key, total] of modelTotals(fine.samples)) {
      expect(report.people.find((person) => person.virtualKey === key)?.cost).toBeCloseTo(total)
    }
  })
})
