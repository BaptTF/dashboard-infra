import { createFileRoute } from '@tanstack/react-router'
import type { ReadinessResponse } from '~/lib/types'
import {
  checkPrometheusReadiness,
  getPrometheusConfig,
  type PrometheusConfig,
} from '~/lib/prometheus.server'
import { appVersion, SERVICE_NAME } from '~/lib/runtime.server'

type PrometheusCheck = ReadinessResponse['checks']['prometheus']

let cached: { check: PrometheusCheck; at: number } | null = null
let monitorStarted = false

function backgroundCheck(config: PrometheusConfig) {
  void checkPrometheusReadiness(config).then((check) => {
    cached = { check, at: Date.now() }
  })
}

/**
 * The readiness endpoint must never wait on Prometheus. The downstream check
 * runs in the background and only decorates the response; the process reports
 * ready as soon as it can serve HTTP. A slow or dead Prometheus can therefore
 * never fail a Kubernetes readiness probe.
 */
function ensureMonitor() {
  if (monitorStarted) return
  monitorStarted = true
  const config = getPrometheusConfig()
  backgroundCheck(config)
  const timer = setInterval(() => backgroundCheck(config), 30_000)
  timer.unref?.()
}

function readiness(): ReadinessResponse {
  ensureMonitor()
  const config = getPrometheusConfig()
  const check: PrometheusCheck = cached?.check ?? {
    configured: config.configured,
    ok: null,
    detail: 'Vérification Prometheus en arrière-plan, non bloquante',
    latencyMs: null,
  }
  return {
    status: 'ready',
    service: SERVICE_NAME,
    version: appVersion(),
    timestamp: new Date().toISOString(),
    checks: { prometheus: check },
  }
}

export const Route = createFileRoute('/readyz')({
  server: {
    handlers: {
      GET: () =>
        Response.json(readiness(), {
          status: 200,
          headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
        }),
      HEAD: () =>
        new Response(null, {
          status: 200,
          headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
        }),
    },
  },
})
