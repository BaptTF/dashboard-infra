import { describe, expect, it } from 'vitest'
import {
  buildHermesRows,
  buildSpendRows,
  groupHermesByProvider,
  groupSpendByProvider,
  normalizeSpendGrouping,
} from '~/lib/spend-view'
import type { LeoUser, PersonSpend } from '~/lib/types'

const totals = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 }

function person(
  virtualKey: string,
  providers: PersonSpend['providers'],
  cost = providers.reduce((sum, provider) => sum + provider.cost, 0),
): PersonSpend {
  return {
    virtualKey,
    origin: 'bifrost',
    ...totals,
    cost,
    providers,
  }
}

describe('normalizeSpendGrouping', () => {
  it('keeps the key view unless the URL asks for a provider grouping', () => {
    expect(normalizeSpendGrouping(undefined)).toBe('key')
    expect(normalizeSpendGrouping('key')).toBe('key')
    expect(normalizeSpendGrouping('nope')).toBe('key')
    expect(normalizeSpendGrouping('provider')).toBe('provider')
  })
})

describe('groupSpendByProvider', () => {
  const rows = buildSpendRows([
    person('atlas', [
      {
        provider: 'opencode-go',
        ...totals,
        cost: 4,
        tokensIn: 40,
        models: [{ model: 'deepseek-v4.1-flash', ...totals, cost: 4, tokensIn: 40 }],
      },
      {
        provider: 'bedrock',
        ...totals,
        cost: 6,
        models: [{ model: 'anthropic/claude-sonnet-4.5', ...totals, cost: 6 }],
      },
    ]),
    person('hermes-leo', [
      {
        provider: 'opencode-go',
        ...totals,
        cost: 7,
        tokensOut: 3,
        models: [{ model: 'deepseek-v4.1-flash', ...totals, cost: 7, tokensOut: 3 }],
      },
    ]),
    person('vide', [
      {
        provider: '',
        ...totals,
        cost: 1,
        models: [{ model: '', ...totals, cost: 1 }],
      },
    ]),
  ])

  it('lifts opencode-go above the keys and sorts providers by cost', () => {
    const grouped = groupSpendByProvider(rows)

    expect(grouped.map((row) => row.label)).toEqual(['opencode-go', 'bedrock', 'Sans fournisseur'])
    const opencode = grouped[0]
    expect(opencode?.rank).toBe(1)
    expect(opencode?.shareOfCost).toBeCloseTo(11 / 18)
    expect(opencode?.cost).toBe(11)
    expect(opencode?.tokensIn).toBe(40)
    expect(opencode?.tokensOut).toBe(3)
    expect(opencode?.children.map((row) => [row.label, row.cost])).toEqual([
      ['hermes-leo', 7],
      ['atlas', 4],
    ])
    expect(opencode?.children[1]?.children.map((row) => row.label)).toEqual(['deepseek-v4.1-flash'])
    expect(grouped[2]?.children[0]?.children[0]?.label).toBe('Modèle inconnu')
  })
})

describe('groupHermesByProvider', () => {
  const camille: LeoUser = {
    user: 'Camille',
    source: 'telegram',
    costUsd: 42,
    tokensIn: 10,
    tokensOut: 2,
    cacheRead: 4,
    cacheWrite: 1,
    sessions: 0,
    providers: [
      {
        provider: 'opencode-go',
        costUsd: 42,
        tokensIn: 10,
        tokensOut: 2,
        cacheRead: 4,
        cacheWrite: 1,
        sessions: 14,
        models: [
          {
            model: 'deepseek-v4.1-flash',
            costUsd: 42,
            tokensIn: 10,
            tokensOut: 2,
            cacheRead: 4,
            cacheWrite: 1,
            sessions: 14,
          },
        ],
      },
    ],
  }
  const other: LeoUser = {
    user: '',
    source: 'other',
    costUsd: 3.4,
    tokensIn: 0,
    tokensOut: 0,
    cacheRead: 0,
    cacheWrite: 0,
    sessions: 40,
    providers: [
      {
        provider: 'custom',
        costUsd: 2.5,
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        cacheWrite: 0,
        sessions: 12,
        models: [],
      },
      {
        provider: 'opencode-go',
        costUsd: 0.7,
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        cacheWrite: 0,
        sessions: 3,
        models: [],
      },
    ],
  }

  it('keeps unscoped cost under Sans fournisseur and leaves person sessions to the footer', () => {
    const grouped = groupHermesByProvider(buildHermesRows([camille], other, 'Hors Telegram'))

    expect(grouped.map((row) => row.label)).toEqual(['opencode-go', 'custom', 'Sans fournisseur'])
    const opencode = grouped[0]
    expect(opencode?.costUsd).toBeCloseTo(42.7)
    expect(opencode?.rank).toBe(1)
    expect(opencode?.sessionsDisplay).toBe('detail')
    expect(opencode?.sessions).toBe(0)
    expect(opencode?.children.map((row) => [row.label, row.sessions, row.sessionsDisplay])).toEqual(
      [
        ['Camille', 14, 'scoped'],
        ['Hors Telegram', 3, 'scoped'],
      ],
    )
    const unattributed = grouped[2]
    expect(unattributed?.costUsd).toBeCloseTo(0.2)
    expect(unattributed?.sessions).toBe(0)
    expect(unattributed?.children.map((row) => row.label)).toEqual(['Hors Telegram'])
    expect(unattributed?.children[0]?.children).toEqual([])
    expect(opencode?.children[0]?.children[0]?.sessionsDisplay).toBe('model')
    const byPerson = buildHermesRows([camille], other, 'Hors Telegram')
    expect(byPerson[0]?.sessionsDisplay).toBeUndefined()
    expect(byPerson[0]?.children[0]?.sessionsDisplay).toBe('scoped')
    expect(byPerson[0]?.children[0]?.children[0]?.sessionsDisplay).toBe('model')
  })

  it('omits Sans fournisseur when the leftover is only the person session total', () => {
    const covered: LeoUser = { ...camille, sessions: 64 }
    const grouped = groupHermesByProvider(buildHermesRows([covered], null, 'Hors Telegram'))

    expect(grouped.map((row) => row.label)).toEqual(['opencode-go'])
    expect(grouped[0]?.sessions).toBe(0)
  })
})
