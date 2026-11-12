import { createServer, type IncomingMessage } from 'node:http'
import { MOCK_SCENARIOS, handlePrometheusRequest, type MockScenario } from '../mock/fixtures'

const port = Number(process.env.MOCK_PORT ?? 9090)
const host = process.env.MOCK_HOST ?? '127.0.0.1'
const requested = process.env.MOCK_SCENARIO ?? 'nominal'
const scenario: MockScenario = (MOCK_SCENARIOS as readonly string[]).includes(requested)
  ? (requested as MockScenario)
  : 'nominal'
const fixedNow = process.env.MOCK_NOW ? new Date(process.env.MOCK_NOW) : null
if (fixedNow && Number.isNaN(fixedNow.getTime())) {
  console.error('MOCK_NOW invalide : utilisez une date ISO 8601')
  process.exit(1)
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  if (request.method !== 'POST') return new URLSearchParams()
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)
  const form = await readForm(request)
  for (const [key, value] of form) url.searchParams.set(key, value)

  const handled = handlePrometheusRequest(
    url.pathname,
    url.searchParams,
    scenario,
    fixedNow ?? new Date(),
  )
  if (url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(
      `Mock Prometheus — scénario ${scenario}\n` +
        `Scénarios : ${MOCK_SCENARIOS.join(', ')}\n` +
        `Endpoints : /api/v1/query, /api/v1/query_range, /-/ready, /healthz\n`,
    )
    return
  }

  if (handled.status >= 400) {
    response.writeHead(handled.status, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(String(handled.body))
    return
  }
  if (typeof handled.body === 'string') {
    response.writeHead(handled.status, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(handled.body)
    return
  }
  response.writeHead(handled.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(handled.body))
})

server.listen(port, host, () => {
  console.log(`Mock Prometheus sur http://${host}:${port} (scénario ${scenario})`)
  console.log(`Scénarios disponibles : ${MOCK_SCENARIOS.join(', ')}`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
