import { relativeTime } from './dates'
import type { HistoryRange } from './types'
import { clamp } from './utils'

const currency = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyCompact = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const tokens = new Intl.NumberFormat('fr-FR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const percent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const percentInteger = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return currency.format(value)
}

export function formatCurrencyCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (Math.abs(value) < 1000) return currency.format(value)
  return currencyCompact.format(value)
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return number.format(value)
}

export function formatDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return decimal.format(value)
}

export function formatTokens(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return tokens.format(value)
}

export function formatTokensExact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return number.format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return percent.format(value)
}

export function formatPercentInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return percentInteger.format(value)
}

export function formatRatioAsPercent(value: number | null | undefined): string {
  return formatPercent(value == null ? null : clamp(value, 0, 999))
}

export function formatWeight(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return decimal.format(value)
}

export function share(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  return clamp(part / total, 0, 1)
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count > 1 ? plural : singular
}

const QUOTA_LABELS: Record<string, string> = {
  total: 'Quota total',
  included: 'Forfait inclus',
  api: 'API',
  on_demand: 'Hors forfait',
  'on-demand': 'Hors forfait',
  'hors forfait': 'Hors forfait',
  grok: 'Grok',
}

/** Exporter quota kinds are raw snake_case labels; the UI always speaks French. */
export function quotaLabel(quota: string): string {
  const trimmed = quota.trim()
  return QUOTA_LABELS[trimmed] ?? trimmed.replaceAll('_', ' ')
}

export function historyRangeLabel(range: HistoryRange): string {
  return range === '7d' ? '7 jours' : range === '90d' ? '90 jours' : '30 jours'
}

/**
 * A source clock more than five minutes ahead is a data problem, not a real
 * freshness. Never render "dans 11 h" as if the collection had happened later.
 */
export function relativeSince(value: number | string | Date, now = Date.now()): string {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'date inconnue'
  const seconds = (now - timestamp) / 1000
  if (seconds < -300) return 'horloge source en avance'
  if (seconds < 0) return "à l'instant"
  return relativeTime(timestamp, now)
}
