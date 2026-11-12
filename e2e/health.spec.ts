import { expect, test } from '@playwright/test'

test('health and readiness are served on PORT and readiness does not depend on Prometheus', async ({
  request,
}) => {
  const health = await request.get('http://127.0.0.1:3100/healthz')
  expect(health.status()).toBe(200)
  expect((await health.json()).status).toBe('ok')

  const ready = await request.get('http://127.0.0.1:3100/readyz')
  expect(ready.status()).toBe(200)
  expect((await ready.json()).status).toBe('ready')

  const down = await request.get('http://127.0.0.1:3102/readyz')
  expect(down.status()).toBe(200)
  const downBody = await down.json()
  expect(downBody.status).toBe('ready')
  expect([false, null]).toContain(downBody.checks.prometheus.ok)
  await expect
    .poll(
      async () => {
        const response = await request.get('http://127.0.0.1:3102/readyz')
        return (await response.json()).checks.prometheus.ok
      },
      { timeout: 5_000 },
    )
    .toBe(false)

  const downHealth = await request.get('http://127.0.0.1:3102/healthz')
  expect(downHealth.status()).toBe(200)
})
