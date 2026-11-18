import {
  assembleCharges,
  assembleMonthly,
  assembleRates,
  assembleSources,
  buildBillingQueries,
} from './billing'
import type { PrometheusClient, PrometheusConfig } from './prometheus.server'
import type { BillingReport } from './types'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur Prometheus inconnue'
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

/** A billing poll is hourly, so one missed cycle is not yet stale. */
export function billingStaleSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.BILLING_STALE_SECONDS, 3 * 60 * 60)
}

export async function fetchBillingReport(
  client: PrometheusClient | null,
  config: PrometheusConfig,
  now = new Date(),
): Promise<BillingReport> {
  const base = {
    configured: config.configured,
    mockMode: config.mockMode,
    fetchedAt: now.toISOString(),
    charges: [],
    monthly: [],
    rates: [],
    sources: [],
  }
  if (!client) return base
  const queries = buildBillingQueries()
  try {
    const [charges, monthly, fx, success, partial, lastSuccess] = await Promise.all([
      client.query(queries.charge),
      client.query(queries.monthly),
      client.query(queries.fx),
      client.query(queries.success),
      client.query(queries.partial),
      client.query(queries.lastSuccess),
    ])
    return {
      ...base,
      charges: assembleCharges(charges),
      monthly: assembleMonthly(monthly),
      rates: assembleRates(fx),
      sources: assembleSources(success, partial, lastSuccess, now, billingStaleSeconds()),
    }
  } catch (error) {
    return { ...base, error: errorMessage(error) }
  }
}
