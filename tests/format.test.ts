import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatDecimal,
  formatPercent,
  formatTokens,
  quotaLabel,
  share,
} from '~/lib/format'

describe('French formatting', () => {
  it('formats dollars, tokens and ratios', () => {
    expect(formatCurrency(12.5)).toContain('12,50')
    expect(formatCurrency(12.5)).toContain('$')
    expect(formatTokens(1_500_000)).toMatch(/1,5\s*M/)
    expect(formatPercent(0.631)).toContain('63,1')
    expect(formatDecimal(2.64)).toBe('2,6')
  })

  it('clamps shares', () => {
    expect(share(1, 4)).toBe(0.25)
    expect(share(5, 4)).toBe(1)
    expect(share(0, 0)).toBe(0)
    expect(formatCurrency(null)).toBe('—')
    expect(formatPercent(Number.NaN)).toBe('—')
  })

  it('translates quota kinds used in legends and tables', () => {
    expect(quotaLabel('total')).toBe('Total')
    expect(quotaLabel('on_demand')).toBe('Hors forfait')
    expect(quotaLabel('included')).toBe('Inclus')
    expect(quotaLabel('api')).toBe('API')
  })
})
