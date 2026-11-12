import { expect, test } from '@playwright/test'

test('Prometheus configuration stays server-only and the CSP blocks direct access', async ({
  request,
}) => {
  const response = await request.get('/?window=monthly&history=30d')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).not.toContain('127.0.0.1:9090')
  expect(html).not.toContain('PROMETHEUS_URL=')
  expect(html).not.toContain('/api/v1/query')

  const csp = response.headers()['content-security-policy'] ?? ''
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("connect-src 'self'")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect(response.headers()['referrer-policy']).toBe('no-referrer')
})
