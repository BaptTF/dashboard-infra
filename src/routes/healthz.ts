import { createFileRoute } from '@tanstack/react-router'
import { appVersion, SERVICE_NAME, uptimeSeconds } from '~/lib/runtime.server'
import type { HealthResponse } from '~/lib/types'

function health(): HealthResponse {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    version: appVersion(),
    uptimeSeconds: uptimeSeconds(),
    timestamp: new Date().toISOString(),
  }
}

export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: () =>
        Response.json(health(), {
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
