import { describe, expect, it } from 'vitest'
import {
  assembleCharges,
  assembleMonthly,
  assembleRates,
  billingAccountLabel,
  billingProviderLabel,
  chargesByMonth,
  eurosEquivalent,
  formatBillingMonth,
  totalsByCurrency,
} from '~/lib/billing'
import type { MetricSample } from '~/lib/types'

function sample(labels: Record<string, string>, value: number): MetricSample {
  return { labels, value }
}

describe('billing series', () => {
  it('keeps one charge per period and drops a numeric account', () => {
    const charges = assembleCharges([
      sample(
        {
          provider: 'contabo',
          account: 'vps',
          item: 'vps',
          resource: 'vps',
          currency: 'EUR',
          quality: 'declared',
          period_start: '2026-10-31',
          period_end: '2026-11-30',
        },
        8,
      ),
      sample(
        {
          provider: 'contabo',
          account: 'vps',
          item: 'vps',
          resource: 'vps',
          currency: 'EUR',
          quality: 'declared',
          period_start: '2026-10-31',
          period_end: '2026-11-30',
        },
        8,
      ),
      sample(
        {
          provider: 'contabo',
          account: '12345',
          item: 'vps',
          resource: 'vps',
          currency: 'EUR',
          quality: 'declared',
          period_start: '2026-10-01',
          period_end: '2026-10-31',
        },
        9,
      ),
    ])
    expect(charges).toHaveLength(1)
    expect(charges[0]?.amount).toBe(8)
    expect(charges[0]?.account).toBe('vps')
  })

  it('buckets a charge by the month of its end and leaves the monthly price out', () => {
    const charges = assembleCharges([
      sample(
        {
          provider: 'contabo',
          account: 'vps',
          item: 'vps',
          resource: 'vps',
          currency: 'EUR',
          quality: 'declared',
          period_start: '2026-09-30',
          period_end: '2026-10-31',
        },
        7,
      ),
      sample(
        {
          provider: 'contabo',
          account: 'vps',
          item: 'vps',
          resource: 'vps',
          currency: 'EUR',
          quality: 'declared',
          period_start: '2026-10-31',
          period_end: '2026-11-30',
        },
        8,
      ),
    ])
    const monthly = assembleMonthly([
      sample(
        {
          provider: 'contabo',
          account: 'vps',
          item: 'vps',
          resource: 'vps',
          currency: 'EUR',
          quality: 'declared',
        },
        8,
      ),
    ])
    const months = chargesByMonth(charges)
    expect(months.map((entry) => entry.month)).toEqual(['2026-11', '2026-10'])
    expect(months[0]?.totals).toEqual([{ currency: 'EUR', amount: 8 }])
    expect(months[1]?.totals).toEqual([{ currency: 'EUR', amount: 7 }])
    expect(formatBillingMonth('2026-11')).toBe('novembre 2026')
    expect(totalsByCurrency(charges)).toEqual([{ currency: 'EUR', amount: 15 }])
    expect(totalsByCurrency(monthly)).toEqual([{ currency: 'EUR', amount: 8 }])
  })

  it('converts only when a rate is declared', () => {
    const rates = assembleRates([
      sample({ currency: 'USD' }, 0.92),
      sample({ currency: 'EUR' }, 1),
      sample({ currency: 'GBP' }, 0),
    ])
    expect(rates).toEqual([{ currency: 'USD', eur: 0.92 }])
    expect(eurosEquivalent(10, 'USD', rates)).toBeCloseTo(9.2)
    expect(eurosEquivalent(10, 'EUR', rates)).toBe(10)
    expect(eurosEquivalent(10, 'GBP', rates)).toBeNull()
  })

  it('shows role labels and leaves an unknown account as published', () => {
    expect(billingAccountLabel('opencode', 'b')).toBe('B')
    expect(billingAccountLabel('contabo', 'vps')).toBe('VPS')
    expect(billingAccountLabel('hetzner', 'cloud')).toBe('Cloud')
    expect(billingAccountLabel('vercel', 'team')).toBe('Équipe')
    expect(billingProviderLabel('vercel')).toBe('Vercel')
    expect(billingAccountLabel('contabo', 'other')).toBe('other')
  })
})
