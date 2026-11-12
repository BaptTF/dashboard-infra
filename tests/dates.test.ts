import { describe, expect, it } from 'vitest'
import {
  QUOTA_WINDOWS,
  countdown,
  historyRangeStart,
  normalizeHistoryRange,
  normalizeQuotaWindow,
  normalizeSpendWindow,
  quotaWindowHint,
  quotaWindowLabel,
  startOfParisMonth,
  windowBounds,
  zonedParts,
  zonedWallTimeToUtc,
} from '~/lib/dates'

describe('Europe/Paris calendar windows', () => {
  it('starts the current month at Paris midnight', () => {
    const now = new Date('2026-11-12T10:00:00Z')
    const start = startOfParisMonth(now, 1)
    expect(start.toISOString()).toBe('2026-10-31T23:00:00.000Z')
    const parts = zonedParts(start)
    expect(parts).toMatchObject({ year: 2026, month: 11, day: 1, hour: 0 })
  })

  it('walks back whole months and keeps a summer/winter offset', () => {
    const now = new Date('2026-11-11T12:00:00Z')
    const cases = [
      ['1m', '2026-10-31T23:00:00.000Z', '1 mois'],
      ['3m', '2026-08-31T22:00:00.000Z', '3 mois'],
      ['6m', '2026-05-31T22:00:00.000Z', '6 mois'],
      ['1y', '2025-11-30T23:00:00.000Z', '1 an'],
    ] as const
    for (const [id, iso, label] of cases) {
      const bounds = windowBounds(now, id)
      expect(bounds.from.toISOString()).toBe(iso)
      expect(bounds.label).toBe(label)
      expect(bounds.range).toMatch(/^\d+s$/)
    }
  })

  it('uses at least five minutes of range', () => {
    const bounds = windowBounds(new Date('2026-11-01T00:00:10+01:00'), '1m')
    expect(bounds.range).toBe('300s')
  })

  it('converts a zoned wall time across DST', () => {
    expect(zonedWallTimeToUtc(2026, 5, 1, 0, 0, 0).toISOString()).toBe('2026-05-31T22:00:00.000Z')
    expect(zonedWallTimeToUtc(2026, 10, 1, 0, 0, 0).toISOString()).toBe('2026-10-31T23:00:00.000Z')
  })

  it('normalizes selectors and keeps daily and rolling_5h selectable', () => {
    expect(normalizeSpendWindow('3m')).toBe('3m')
    expect(normalizeSpendWindow('nope')).toBe('1m')
    expect(normalizeQuotaWindow('weekly')).toBe('weekly')
    expect(normalizeQuotaWindow('daily')).toBe('daily')
    expect(normalizeQuotaWindow('rolling_5h')).toBe('rolling')
    expect(normalizeQuotaWindow('rolling')).toBe('rolling')
    expect(normalizeQuotaWindow('nope')).toBe('monthly')
    expect(normalizeHistoryRange('90d')).toBe('90d')
    expect(QUOTA_WINDOWS).toEqual(['monthly', 'weekly', 'daily', 'rolling'])
    expect(quotaWindowLabel('daily')).toBe('Quotidien')
    expect(quotaWindowLabel('rolling')).toBe('Glissant')
    expect(quotaWindowHint('daily')).toContain('24 h')
    expect(quotaWindowHint('rolling')).toContain('glissante')
    expect(historyRangeStart(new Date('2026-11-11T00:00:00Z'), '7d').toISOString()).toBe(
      '2026-11-04T00:00:00.000Z',
    )
  })

  it('formats a reset countdown', () => {
    const now = Date.parse('2026-11-11T12:00:00Z')
    expect(countdown(now / 1000 + 90, now)).toBe('dans 1 min')
    expect(countdown(now / 1000 + 3600 * 5, now)).toBe('dans 5 h 0 min')
    expect(countdown(now / 1000 - 1, now)).toBe('reset imminent')
  })
})
