import { subscriptionDisplayName } from './providers'
import type {
  BillingCharge,
  BillingMonthly,
  BillingQuality,
  BillingRate,
  BillingSource,
  MetricSample,
} from './types'

const LABEL = /^[a-z0-9][a-z0-9_-]{0,62}$/
const CURRENCY = /^[A-Z]{3}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const QUALITIES = new Set<BillingQuality>(['declared', 'invoice', 'estimate'])

/** Drop scrape identity so two Prometheus replicas collapse before comparison. */
export const BILLING_DEDUPE = `max without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)`
/** Same collapse, but a single failing replica wins so an outage is never hidden. */
export const BILLING_DEDUPE_MIN = `min without (prometheus_replica, instance, pod, endpoint, service, namespace, container, job)`

export const BILLING_METRICS = {
  charge: 'billing_charge_amount',
  monthly: 'billing_monthly_amount',
  fx: 'billing_fx_eur',
  success: 'billing_collection_success',
  partial: 'billing_collection_partial',
  lastSuccess: 'billing_collection_last_success_timestamp_seconds',
} as const

/**
 * Fixed PromQL only. Each query targets one documented metric and never takes
 * text from the browser. The monthly gauge is queried apart from the charges
 * so a total cannot add the current price on top of the period that already
 * contains it.
 */
export function buildBillingQueries(): Record<keyof typeof BILLING_METRICS, string> {
  const m = BILLING_METRICS
  return {
    charge: `${BILLING_DEDUPE}(${m.charge})`,
    monthly: `${BILLING_DEDUPE}(${m.monthly})`,
    fx: `${BILLING_DEDUPE}(${m.fx})`,
    success: `${BILLING_DEDUPE_MIN}(${m.success})`,
    partial: `${BILLING_DEDUPE}(${m.partial})`,
    lastSuccess: `${BILLING_DEDUPE}(${m.lastSuccess})`,
  }
}

export function billingProviderLabel(provider: string): string {
  switch (provider) {
    case 'contabo':
      return 'Contabo'
    case 'cloudflare':
      return 'Cloudflare'
    case 'hetzner':
      return 'Hetzner'
    case 'opencode':
      return 'OpenCode'
    case 'vercel':
      return 'Vercel'
    case 'declared':
      return 'Relevé déclaré'
    default:
      return provider.trim() || 'Fournisseur inconnu'
  }
}

/** Display-only. Raw Prometheus labels stay unchanged. */
export function billingAccountLabel(provider: string, account: string): string {
  if (provider === 'opencode') return subscriptionDisplayName(provider, account)
  switch (account) {
    case 'vps':
      return 'VPS'
    case 'main':
      return 'Principal'
    case 'cloud':
      return 'Cloud'
    case 'ledger':
      return 'Relevé'
    case 'team':
      return 'Équipe'
    default:
      return account.trim() || 'Compte inconnu'
  }
}

export function billingQualityLabel(quality: BillingQuality): string {
  switch (quality) {
    case 'declared':
      return 'Déclaré'
    case 'invoice':
      return 'Facture'
    case 'estimate':
      return 'Estimation'
  }
}

export function billingItemLabel(item: string): string {
  switch (item) {
    case 'vps':
      return 'VPS'
    case 'go':
      return 'Go'
    case 'invoice':
      return 'Facture'
    case 'server':
      return 'Serveur'
    case 'volume':
      return 'Volume'
    case 'primary_ip':
      return 'IP primaire'
    case 'floating_ip':
      return 'IP flottante'
    case 'load_balancer':
      return 'Load balancer'
    case 'storage_box':
      return 'Storage Box'
    default:
      return item
  }
}

function field(sample: MetricSample, name: string): string {
  return (sample.labels[name] ?? '').trim()
}

function role(value: string): string | null {
  return LABEL.test(value) ? value : null
}

/** Declared labels are chosen by us. A long digit run is an instance id. */
function declaredRole(value: string): string | null {
  const parsed = role(value)
  if (!parsed || /[0-9]{5,}/.test(parsed)) return null
  return parsed
}

function money(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null
}

function quality(value: string): BillingQuality | null {
  return QUALITIES.has(value as BillingQuality) ? (value as BillingQuality) : null
}

function day(value: string): string | null {
  if (!DATE.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(parsed) ? value : null
}

export function assembleCharges(samples: MetricSample[]): BillingCharge[] {
  const seen = new Map<string, BillingCharge>()
  for (const sample of samples) {
    const kind = quality(field(sample, 'quality'))
    const identify = kind === 'declared' ? declaredRole : role
    const provider = identify(field(sample, 'provider'))
    const account = identify(field(sample, 'account'))
    const item = identify(field(sample, 'item'))
    const resource = identify(field(sample, 'resource'))
    const currency = field(sample, 'currency')
    const periodStart = day(field(sample, 'period_start'))
    const periodEnd = day(field(sample, 'period_end'))
    const amount = money(sample.value)
    if (
      !provider ||
      !account ||
      !item ||
      !resource ||
      !CURRENCY.test(currency) ||
      !kind ||
      !periodStart ||
      !periodEnd ||
      amount == null
    ) {
      continue
    }
    const charge: BillingCharge = {
      provider,
      account,
      item,
      resource,
      currency,
      quality: kind,
      periodStart,
      periodEnd,
      amount,
    }
    const key = [provider, account, item, resource, currency, kind, periodStart, periodEnd].join(
      '\u0000',
    )
    const previous = seen.get(key)
    if (!previous || charge.amount > previous.amount) seen.set(key, charge)
  }
  return [...seen.values()].sort(compareCharges)
}

export function assembleMonthly(samples: MetricSample[]): BillingMonthly[] {
  const seen = new Map<string, BillingMonthly>()
  for (const sample of samples) {
    const kind = quality(field(sample, 'quality'))
    const identify = kind === 'declared' ? declaredRole : role
    const provider = identify(field(sample, 'provider'))
    const account = identify(field(sample, 'account'))
    const item = identify(field(sample, 'item'))
    const resource = identify(field(sample, 'resource'))
    const currency = field(sample, 'currency')
    const amount = money(sample.value)
    if (
      !provider ||
      !account ||
      !item ||
      !resource ||
      !CURRENCY.test(currency) ||
      !kind ||
      amount == null
    ) {
      continue
    }
    const row: BillingMonthly = {
      provider,
      account,
      item,
      resource,
      currency,
      quality: kind,
      amount,
    }
    const key = [provider, account, item, resource, currency, kind].join('\u0000')
    const previous = seen.get(key)
    if (!previous || row.amount > previous.amount) seen.set(key, row)
  }
  return [...seen.values()].sort(compareMonthly)
}

export function assembleRates(samples: MetricSample[]): BillingRate[] {
  const seen = new Map<string, number>()
  for (const sample of samples) {
    const currency = field(sample, 'currency')
    if (currency === 'EUR' || !CURRENCY.test(currency) || !Number.isFinite(sample.value)) continue
    if (sample.value <= 0) continue
    seen.set(currency, sample.value)
  }
  return [...seen.entries()]
    .map(([currency, eur]) => ({ currency, eur }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

export function assembleSources(
  success: MetricSample[],
  partial: MetricSample[],
  lastSuccess: MetricSample[],
  now: Date,
  staleSeconds: number,
): BillingSource[] {
  const partialByKey = new Map(partial.map((sample) => [sourceKey(sample), sample.value > 0]))
  const lastByKey = new Map(
    lastSuccess.map((sample) => [sourceKey(sample), sample.value > 0 ? sample.value : null]),
  )
  const seen = new Map<string, BillingSource>()
  for (const sample of success) {
    const provider = role(field(sample, 'provider'))
    const account = role(field(sample, 'account'))
    if (!provider || !account) continue
    const key = `${provider}\u0000${account}`
    const last = lastByKey.get(key) ?? null
    const ok = sample.value >= 1
    const age = last == null ? Number.POSITIVE_INFINITY : now.getTime() / 1000 - last
    seen.set(key, {
      provider,
      account,
      success: ok,
      partial: partialByKey.get(key) ?? false,
      lastSuccessAt: last,
      stale: !ok || age > staleSeconds,
    })
  }
  return [...seen.values()].sort(
    (a, b) =>
      billingProviderLabel(a.provider).localeCompare(billingProviderLabel(b.provider), 'fr') ||
      a.account.localeCompare(b.account, 'fr'),
  )
}

export interface BillingMonthTotal {
  /** `YYYY-MM` of the charge end date. A charge belongs to that month. */
  month: string
  totals: MoneyTotal[]
}

/**
 * Sum every charge into the calendar month of its end date, newest first.
 * The current price is not a charge and must not be passed here.
 */
export function chargesByMonth(charges: BillingCharge[]): BillingMonthTotal[] {
  const rows = new Map<string, { currency: string; amount: number }[]>()
  for (const charge of charges) {
    const end = day(charge.periodEnd)
    if (!end) continue
    const month = end.slice(0, 7)
    const bucket = rows.get(month) ?? []
    bucket.push({ currency: charge.currency, amount: charge.amount })
    rows.set(month, bucket)
  }
  return [...rows.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, bucket]) => ({ month, totals: totalsByCurrency(bucket) }))
}

const monthLabel = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `2026-11` becomes `novembre 2026`. An unreadable key is returned as-is. */
export function formatBillingMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const year = Number(match[1])
  const mon = Number(match[2])
  if (mon < 1 || mon > 12) return month
  return monthLabel.format(new Date(Date.UTC(year, mon - 1, 1)))
}

export interface MoneyTotal {
  currency: string
  amount: number
}

export function totalsByCurrency(rows: { currency: string; amount: number }[]): MoneyTotal[] {
  const sums = new Map<string, number>()
  for (const row of rows) {
    if (!CURRENCY.test(row.currency) || !Number.isFinite(row.amount) || row.amount <= 0) continue
    sums.set(row.currency, (sums.get(row.currency) ?? 0) + row.amount)
  }
  return [...sums.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort(
      (a, b) =>
        currencyRank(a.currency) - currencyRank(b.currency) || a.currency.localeCompare(b.currency),
    )
}

/** Euro equivalent of one amount when a declared rate exists. EUR needs none. */
export function eurosEquivalent(
  amount: number,
  currency: string,
  rates: BillingRate[],
): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (currency === 'EUR') return amount
  const rate = rates.find((entry) => entry.currency === currency)
  if (!rate || rate.eur <= 0) return null
  return amount * rate.eur
}

function currencyRank(currency: string): number {
  return currency === 'EUR' ? 0 : 1
}

function sourceKey(sample: MetricSample): string {
  return `${field(sample, 'provider')}\u0000${field(sample, 'account')}`
}

function compareCharges(a: BillingCharge, b: BillingCharge): number {
  return (
    b.periodEnd.localeCompare(a.periodEnd) ||
    billingProviderLabel(a.provider).localeCompare(billingProviderLabel(b.provider), 'fr') ||
    a.account.localeCompare(b.account, 'fr') ||
    a.item.localeCompare(b.item, 'fr')
  )
}

function compareMonthly(a: BillingMonthly, b: BillingMonthly): number {
  return (
    billingProviderLabel(a.provider).localeCompare(billingProviderLabel(b.provider), 'fr') ||
    a.account.localeCompare(b.account, 'fr') ||
    a.item.localeCompare(b.item, 'fr')
  )
}
