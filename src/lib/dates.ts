import type { HistoryRange, QuotaWindow, SpendWindow } from './types'

export const PARIS_TIME_ZONE = 'Europe/Paris'

export const SPEND_WINDOWS: readonly SpendWindow[] = ['1m', '3m', '6m', '1y', 'all']
export const HISTORY_RANGES: readonly HistoryRange[] = ['1m', '3m', '6m', '1y', 'all']
export const QUOTA_WINDOWS: readonly QuotaWindow[] = ['monthly', 'weekly', 'daily', 'rolling']

const frenchDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const frenchDateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const frenchTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const frenchWeekday = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const frenchDayTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const frenchDateTimeCompact = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const utcDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const utcDateCompact = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
})

const utcDayTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string) {
  let formatter = partFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    partFormatters.set(timeZone, formatter)
  }
  return formatter
}

export function zonedParts(date: Date, timeZone = PARIS_TIME_ZONE): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

/**
 * Converts a wall-clock time in a time zone to the matching UTC instant.
 * Two passes converge across DST offsets without pulling a date library in.
 */
export function zonedWallTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = PARIS_TIME_ZONE,
): Date {
  const target = Date.UTC(year, monthIndex, day, hour, minute, second)
  let guess = target
  for (let pass = 0; pass < 4; pass += 1) {
    const zoned = zonedParts(new Date(guess), timeZone)
    const wallTimeAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    )
    const difference = target - wallTimeAsUtc
    if (difference === 0) break
    guess += difference
  }
  return new Date(guess)
}

export function startOfParisMonth(now: Date, monthsBack = 1): Date {
  const zoned = zonedParts(now)
  const targetIndex = zoned.month - 1 - (monthsBack - 1)
  const targetYear = zoned.year + Math.floor(targetIndex / 12)
  const normalizedMonth = ((targetIndex % 12) + 12) % 12
  return zonedWallTimeToUtc(targetYear, normalizedMonth, 1)
}

export interface WindowBounds {
  from: Date
  range: string
  label: string
}

export function normalizeSpendWindow(value: string | undefined): SpendWindow {
  return value === '3m' || value === '6m' || value === '1y' || value === 'all' ? value : '1m'
}

export function normalizeHistoryRange(value: string | undefined): HistoryRange {
  return normalizeSpendWindow(value)
}

export function normalizeQuotaWindow(value: string | undefined): QuotaWindow {
  if (value === 'weekly' || value === 'daily' || value === 'rolling') return value
  // Accept the raw exporter label in deep links; the UI keeps the short name.
  if (value === 'rolling_5h') return 'rolling'
  return 'monthly'
}

/**
 * Calendar windows in Europe/Paris. One month means the current calendar month;
 * longer choices walk back whole months and still start on the 1st at 00:00.
 * "Depuis le début" is a rolling two-year search: the curve only starts at the
 * first sample that actually exists. Prometheus needs at least five minutes,
 * even in the first seconds of a month.
 */
export function windowBounds(now: Date, id: SpendWindow): WindowBounds {
  const label =
    id === '3m'
      ? '3 mois'
      : id === '6m'
        ? '6 mois'
        : id === '1y'
          ? '1 an'
          : id === 'all'
            ? 'Depuis le début'
            : 'Mois en cours'
  const from =
    id === 'all'
      ? new Date(now.getTime() - 2 * 365.25 * 24 * 60 * 60 * 1000)
      : startOfParisMonth(now, id === '3m' ? 3 : id === '6m' ? 6 : id === '1y' ? 12 : 1)
  const seconds = Math.max(300, Math.floor((now.getTime() - from.getTime()) / 1000))
  return { from, range: `${seconds}s`, label }
}

export function historyRangeStart(now: Date, range: HistoryRange): Date {
  return windowBounds(now, range).from
}

export function quotaWindowLabel(window: QuotaWindow): string {
  switch (window) {
    case 'weekly':
      return 'Hebdomadaire'
    case 'daily':
      return 'Quotidien'
    case 'rolling':
      return 'Glissant'
    default:
      return 'Mensuel'
  }
}

export function quotaWindowHint(window: QuotaWindow): string {
  switch (window) {
    case 'weekly':
      return 'Lundi 00:00 UTC au lundi suivant'
    case 'daily':
      return 'Fenêtre de 24 h terminée par le reset'
    case 'rolling':
      return 'Fenêtre glissante 5 h, sans début de période calculable'
    default:
      return 'Cycle propre à chaque abonnement'
  }
}

/** Compact invariant shown once per provider, never under every bar. */
export function quotaWindowInvariant(window: QuotaWindow): string {
  switch (window) {
    case 'weekly':
      return 'lundi 00:00 UTC'
    case 'daily':
      return '24 h avant reset'
    case 'rolling':
      return '5 h glissantes, sans début'
    default:
      return 'cycle propre'
  }
}

export function spendWindowLabel(window: SpendWindow): string {
  return window === '3m'
    ? '3 mois'
    : window === '6m'
      ? '6 mois'
      : window === '1y'
        ? '1 an'
        : window === 'all'
          ? 'Depuis le début'
          : 'Mois en cours'
}

export function formatParisDate(value: Date | number | string | null | undefined): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return frenchDate.format(date)
}

export function formatParisDateTime(value: Date | number | string | null | undefined): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return frenchDateTime.format(date)
}

export function formatParisTime(value: Date | number | string | null | undefined): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return frenchTime.format(date)
}

export function formatParisDay(value: Date | number | string | null | undefined): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return frenchWeekday.format(date)
}

/** Short axis label for hourly windows: "10 nov. 05:15", never four times a day. */
export function formatParisDayTime(value: Date | number | string | null | undefined): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return frenchDayTime.format(date)
}

/** Compact history cell: "12/11 05:15"; the full date stays in the title. */
export function formatParisDateTimeCompact(
  value: Date | number | string | null | undefined,
): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return frenchDateTimeCompact.format(date)
}

/** UTC consumed day for the Bifrost cost curve: "31 oct. 2026", no time. */
export function formatUtcDate(value: Date | number | string | null | undefined): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return utcDate.format(date)
}

/** Compact UTC consumed day for the history table: "31/10". */
export function formatUtcDateCompact(value: Date | number | string | null | undefined): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return utcDateCompact.format(date)
}

/** Fine-grained UTC bucket label: "31 oct. 2026, 23:00", never a bare day. */
export function formatUtcDayTime(value: Date | number | string | null | undefined): string {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return utcDayTime.format(date)
}

export function relativeTime(value: number | string | Date, now = Date.now()): string {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'date inconnue'
  const seconds = Math.round((now - timestamp) / 1000)
  const future = seconds < 0
  const absolute = Math.abs(seconds)

  if (absolute < 45) return future ? 'dans un instant' : "à l'instant"
  if (absolute < 90) return future ? 'dans une minute' : 'il y a une minute'
  if (absolute < 3600) {
    const minutes = Math.round(absolute / 60)
    return future ? `dans ${minutes} min` : `il y a ${minutes} min`
  }
  if (absolute < 86400) {
    const hours = Math.round(absolute / 3600)
    return future ? `dans ${hours} h` : `il y a ${hours} h`
  }
  const days = Math.round(absolute / 86400)
  return future ? `dans ${days} j` : `il y a ${days} j`
}

export function countdown(value: number | null, now = Date.now()): string {
  if (value == null || !Number.isFinite(value)) return 'reset inconnu'
  const seconds = Math.round((value * 1000 - now) / 1000)
  if (seconds <= 0) return 'reset imminent'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return `dans ${days} j ${hours} h`
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `dans ${hours} h ${minutes} min`
  return `dans ${Math.max(1, minutes)} min`
}

export function isOlderThan(
  timestamp: number | null,
  thresholdSeconds: number,
  now = Date.now(),
): boolean {
  if (timestamp == null || !Number.isFinite(timestamp)) return true
  return now / 1000 - timestamp > thresholdSeconds
}
